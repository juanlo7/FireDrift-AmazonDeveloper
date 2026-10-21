import type { Signal, TitleCard, TitleType } from "@firedrift/domain";
import type { CatalogService } from "../catalog/catalogService";
import { toTmdbType } from "../catalog/mapping";
import type { TmdbClient } from "../catalog/tmdbClient";
import type { TmdbListItem } from "../catalog/tmdbTypes";
import { buildColdStartPool, COLD_START_VERSION, discoverParams, seenKey } from "../pool/coldStart";
import type { PoolRecord } from "../pool/poolStore";
import type { Profile } from "../profile/profileStore";
import { mapSettled } from "../shared/async";
import { decayAdjustment, type WeightMap } from "../weights/summary";
import { effectiveFromLayers } from "../weights/weightsService";
import type { WeightLayers } from "../weights/weightStore";
import type { TasteConfig } from "./config";
import { discoverGenre, listItemFeatures, titleFeatures, type Feature } from "./features";
import { learnWeights, signalStrength, type LearnedLayer } from "./learn";
import { scoreTitle } from "./score";

export const TASTE_VERSION = "taste-1";

/** At most this many TMDB calls run at once, to stay under TMDB's rate limit. */
const TMDB_CONCURRENCY = 8;
/** Genres weighing this much or less are kept out of discovery too. */
const DISLIKED_GENRE = -0.3;
/** Pages of recommendations per seed and of genre discover per type. */
const CANDIDATE_PAGES = 2;
/** Fewest candidates scored per bucket that has slots, so small pools still have choice. */
const MIN_SHORTLIST = 8;

export type Bucket = "favourites" | "genres" | "discovery";
const BUCKETS: Bucket[] = ["favourites", "genres", "discovery"];

export interface TastePoolInput {
  profile: Profile;
  signals: Signal[];
  recentPools: PoolRecord[];
  layers: WeightLayers;
  config: TasteConfig;
  size: number;
  now: number;
  /** Titles the butler already showed in this visit (`ranked_picks`). */
  exclude?: { type: TitleType; tmdbId: number }[];
}

export interface TastePoolDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
}

export interface TastePoolResult {
  algorithmVersion: string;
  titles: TitleCard[];
  /** The learned layer computed on the way, to save for `/weights` and the butler. */
  learned: LearnedLayer;
}

interface Candidate {
  type: TitleType;
  tmdbId: number;
  bucket: Bucket;
  /** For favourites: the liked title it was recommended from. */
  seed?: string;
  popularity: number;
  features: Feature[];
  score: number;
}

const titleKey = (type: TitleType, tmdbId: number) => seenKey(type, tmdbId);
const mainGenre = (features: Feature[]) => features.find((f) => f.kind === "genre")?.key;

/** Slots per bucket from the quotas; rounding leftovers go to the first buckets. */
export const quotaSlots = (size: number, quotas: TasteConfig["quotas"]): Record<Bucket, number> => {
  const total = BUCKETS.reduce((sum, b) => sum + quotas[b], 0) || 1;
  const slots = Object.fromEntries(BUCKETS.map((b) => [b, Math.floor((size * quotas[b]) / total)])) as Record<
    Bucket,
    number
  >;
  let left = size - BUCKETS.reduce((sum, b) => sum + slots[b], 0);
  for (const bucket of BUCKETS) if (left-- > 0) slots[bucket]++;
  return slots;
};

/** Genre IDs from the effective weights: the strongest liked ones and the disliked ones. */
const genreTaste = (weights: WeightMap, top: number) => {
  const genres = Object.entries(weights)
    .filter(([key]) => key.startsWith("genre:"))
    .map(([key, weight]) => ({ id: Number(key.slice("genre:".length)), weight }));
  return {
    liked: genres
      .filter((g) => g.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, top)
      .map((g) => g.id),
    disliked: genres.filter((g) => g.weight <= DISLIKED_GENRE).map((g) => g.id),
  };
};

const discoverIds = (type: TitleType, ids: number[]) =>
  [...new Set(ids.map((id) => discoverGenre(type, id)).filter((id): id is number => id !== undefined))];

/** Raw candidates from TMDB, per bucket. Failed calls only shrink the list. */
const fetchCandidates = async (
  tmdb: TmdbClient,
  profile: Profile,
  seeds: { type: TitleType; tmdbId: number }[],
  genres: { liked: number[]; disliked: number[] },
  /** How many pools the profile already had: later pools dig deeper into TMDB lists. */
  depth: number,
) => {
  type Raw = { type: TitleType; item: TmdbListItem; bucket: Bucket; seed?: string };
  const requests: (() => Promise<Raw[]>)[] = [];
  const pages = Array.from({ length: CANDIDATE_PAGES }, (_, i) => i + 1);

  for (const seed of seeds) {
    for (const page of pages) {
      requests.push(async () =>
        (await tmdb.recommendations(toTmdbType(seed.type), seed.tmdbId, page)).results.map((item) => ({
          type: seed.type,
          item,
          bucket: "favourites" as const,
          seed: titleKey(seed.type, seed.tmdbId),
        })),
      );
    }
  }
  for (const type of ["movie", "series"] as const) {
    const liked = discoverIds(type, genres.liked);
    const disliked = discoverIds(type, genres.disliked);
    for (const page of liked.length > 0 ? pages : []) {
      requests.push(async () =>
        (
          await tmdb.discover(toTmdbType(type), {
            ...discoverParams(profile, page + depth),
            with_genres: liked.join("|"),
            ...(disliked.length > 0 ? { without_genres: disliked.join(",") } : {}),
          })
        ).results.map((item) => ({ type, item, bucket: "genres" as const })),
      );
    }
    const known = discoverIds(type, [...genres.liked, ...genres.disliked]);
    requests.push(async () =>
      (
        await tmdb.discover(toTmdbType(type), {
          ...discoverParams(profile, 1 + (depth % 3)),
          ...(known.length > 0 ? { without_genres: known.join(",") } : {}),
        })
      ).results.map((item) => ({ type, item, bucket: "discovery" as const })),
    );
  }

  const results = await mapSettled(requests, TMDB_CONCURRENCY, (request) => request());
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
};

/**
 * Picks `slots` candidates of a bucket by score. Each repeat of a main genre
 * already in the pool multiplies the score by `genreRepeatPenalty`. Favourites
 * go round the seeds: one title per seed per round, so a pool spans many seeds.
 * Unless `allowAgainstTaste`, a title scoring 0 or less is never picked.
 */
const pick = (
  candidates: Candidate[],
  slots: number,
  picked: Candidate[],
  config: TasteConfig,
  allowAgainstTaste = false,
): Candidate[] => {
  const chosen: Candidate[] = [];
  const pool = [...candidates];
  const genreCount = new Map<string, number>();
  const seedCount = new Map<string, number>();
  const count = (map: Map<string, number>, key: string | undefined) => {
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const c of picked) {
    count(genreCount, mainGenre(c.features));
    count(seedCount, c.seed);
  }
  let perSeed = 1;

  while (chosen.length < slots && pool.length > 0) {
    let best = -1;
    let bestScore = -Infinity;
    let blockedBySeed = false;
    for (const [index, c] of pool.entries()) {
      if (!allowAgainstTaste && c.score <= 0) continue;
      if (c.seed && (seedCount.get(c.seed) ?? 0) >= perSeed) {
        blockedBySeed = true;
        continue;
      }
      const genre = mainGenre(c.features);
      const adjusted =
        c.score >= 0
          ? c.score * config.genreRepeatPenalty ** (genre ? (genreCount.get(genre) ?? 0) : 0)
          : c.score;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = index;
      }
    }
    if (best === -1) {
      if (!blockedBySeed) break;
      perSeed++;
      continue;
    }
    const [c] = pool.splice(best, 1);
    chosen.push(c!);
    count(genreCount, mainGenre(c!.features));
    count(seedCount, c!.seed);
  }
  return chosen;
};

/** Best of each seed first, then the second best of each, and so on. Keeps rank order inside a seed. */
const roundRobinBySeed = (ranked: Candidate[]) => {
  const bySeed = new Map<string, Candidate[]>();
  for (const c of ranked) bySeed.set(c.seed ?? "", [...(bySeed.get(c.seed ?? "") ?? []), c]);
  return interleave([...bySeed.values()]);
};

/** Round-robin over buckets, so the feed mixes favourites, genres and discovery. */
const interleave = (byBucket: Candidate[][]) => {
  const ordered: Candidate[] = [];
  for (let i = 0; byBucket.some((list) => i < list.length); i++) {
    for (const list of byBucket) if (i < list.length) ordered.push(list[i]!);
  }
  return ordered;
};

/** The taste algorithm (requirements 4.1), version `taste-1`. */
export const buildTastePool = async (deps: TastePoolDeps, input: TastePoolInput): Promise<TastePoolResult> => {
  const { profile, signals, recentPools, layers, config, size, now, exclude = [] } = input;

  // 1. Learned layer from the signals' title features.
  const signalTitles = [
    ...new Map(
      [...signals]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, config.maxSignals)
        .map((s) => [titleKey(s.type, s.tmdbId), { type: s.type, tmdbId: s.tmdbId }] as const),
    ).values(),
  ];
  const fetched = await mapSettled(signalTitles, TMDB_CONCURRENCY, (t) =>
    deps.tmdb.features(toTmdbType(t.type), t.tmdbId),
  );
  const featuresByTitle = new Map<string, Feature[]>();
  fetched.forEach((result, i) => {
    const t = signalTitles[i]!;
    if (result.status === "fulfilled") featuresByTitle.set(titleKey(t.type, t.tmdbId), titleFeatures(t.type, result.value));
  });
  const learned = learnWeights(signals, (s) => featuresByTitle.get(titleKey(s.type, s.tmdbId)), config, now);

  // 2. Effective weights; with no positive taste yet, a new profile gets the cold start.
  const weights = effectiveFromLayers({ ...layers, learned: learned.weights }, now, config.adjustmentHalfLifeDays);
  const adjustment = decayAdjustment(layers.adjustment, layers.adjustmentUpdatedAt, now, config.adjustmentHalfLifeDays);
  const seen = new Set([
    ...signals.map((s) => titleKey(s.type, s.tmdbId)),
    ...recentPools.flatMap((pool) => pool.titles.map((t) => titleKey(t.type, t.tmdbId))),
    ...exclude.map((t) => titleKey(t.type, t.tmdbId)),
  ]);
  if (!Object.values(weights).some((w) => w > 0)) {
    const titles = await buildColdStartPool(deps, { profile, seen, size, weights });
    return { algorithmVersion: COLD_START_VERSION, titles, learned };
  }

  // 3. Candidates per bucket, without seen titles or duplicates.
  const seeds = [
    ...new Map(
      [...signals]
        .filter((s) => signalStrength(s, config) > 0)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((s) => [titleKey(s.type, s.tmdbId), { type: s.type, tmdbId: s.tmdbId }] as const),
    ).values(),
  ].slice(0, config.maxSeeds);
  const raw = await fetchCandidates(
    deps.tmdb,
    profile,
    seeds,
    genreTaste(weights, config.topGenres),
    Math.min(recentPools.length, config.cooldownPools),
  );
  const unique = new Map<string, Candidate>();
  for (const r of raw) {
    const key = titleKey(r.type, r.item.id);
    if (seen.has(key) || unique.has(key)) continue;
    const features = listItemFeatures(r.type, r.item);
    unique.set(key, {
      type: r.type,
      tmdbId: r.item.id,
      bucket: r.bucket,
      seed: r.seed,
      popularity: r.item.popularity,
      features,
      score: scoreTitle(features, weights, config, r.item.popularity, adjustment),
    });
  }

  // 4. Keep the best few per slot from the list data, then score them with full features.
  const slots = quotaSlots(size, config.quotas);
  const shortlist = BUCKETS.flatMap((bucket) => {
    if (slots[bucket] === 0) return [];
    const ranked = [...unique.values()].filter((c) => c.bucket === bucket).sort((a, b) => b.score - a.score);
    const keep = Math.max(MIN_SHORTLIST, slots[bucket] * config.candidatesPerSlot);
    return (bucket === "favourites" ? roundRobinBySeed(ranked) : ranked).slice(0, keep);
  });
  const detailed = await mapSettled(shortlist, TMDB_CONCURRENCY, (c) => deps.tmdb.features(toTmdbType(c.type), c.tmdbId));
  detailed.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const c = shortlist[i]!;
    c.features = titleFeatures(c.type, result.value);
    c.score = scoreTitle(c.features, weights, config, c.popularity, adjustment);
  });

  // 5. Quotas first, then every other candidate by score, as backups for titles not on my services.
  const byBucket: Candidate[][] = [];
  const picked: Candidate[] = [];
  for (const bucket of BUCKETS) {
    const chosen = pick(
      shortlist.filter((c) => c.bucket === bucket),
      slots[bucket],
      picked,
      config,
      bucket === "discovery",
    );
    byBucket.push(chosen);
    picked.push(...chosen);
  }
  const pickedKeys = new Set(picked.map((c) => titleKey(c.type, c.tmdbId)));
  const backups = pick(
    shortlist.filter((c) => !pickedKeys.has(titleKey(c.type, c.tmdbId))),
    shortlist.length,
    picked,
    config,
  );
  const ordered = [...interleave(byBucket), ...backups];

  // 6. Cards in that order, in batches, until the pool is full of titles on my services.
  const services = profile.showEverything ? [] : profile.services;
  const cards: TitleCard[] = [];
  for (let start = 0; start < ordered.length && cards.length < size; start += TMDB_CONCURRENCY) {
    const batch = ordered.slice(start, start + TMDB_CONCURRENCY);
    const results = await mapSettled(batch, TMDB_CONCURRENCY, (c) =>
      deps.catalog.getTitleCard(c.type, c.tmdbId, profile.country, services),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && (services.length === 0 || r.value.onMyServices)) cards.push(r.value);
    }
  }
  cards.splice(size);

  if (cards.length < size) {
    const taken = new Set([...seen, ...cards.map((c) => titleKey(c.type, c.tmdbId))]);
    cards.push(...(await buildColdStartPool(deps, { profile, seen: taken, size: size - cards.length })));
  }
  return { algorithmVersion: TASTE_VERSION, titles: cards, learned };
};

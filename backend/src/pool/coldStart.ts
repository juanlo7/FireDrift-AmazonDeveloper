import type { TitleCard, TitleType } from "@firedrift/domain";
import type { CatalogService } from "../catalog/catalogService";
import { toTmdbType } from "../catalog/mapping";
import type { TmdbClient } from "../catalog/tmdbClient";
import type { TmdbListItem } from "../catalog/tmdbTypes";
import type { Profile } from "../profile/profileStore";

/** Replaced by the taste algorithm's version (#46). */
export const COLD_START_VERSION = "cold-start-1";

const DISCOVER_PAGES = 2;
const MIN_VOTES = 200;

export interface ColdStartInput {
  profile: Profile;
  /** `"<type>:<tmdbId>"` of titles the profile already reacted to. */
  seen: Set<string>;
  size: number;
  /** Effective weights: a main genre the user turned down (below 0) is left out. */
  weights?: Record<string, number>;
}

interface Candidate {
  type: TitleType;
  tmdbId: number;
  genre: number;
}

export const seenKey = (type: TitleType, tmdbId: number) => `${type}:${tmdbId}`;

export const discoverParams = (profile: Profile, page: number) => ({
  page,
  sort_by: "popularity.desc",
  watch_region: profile.country,
  "vote_count.gte": MIN_VOTES,
  with_watch_monetization_types: "flatrate|free|ads",
  ...(profile.showEverything || profile.services.length === 0
    ? {}
    : { with_watch_providers: profile.services.join("|") }),
});

const discoverType = async (tmdb: TmdbClient, profile: Profile, type: TitleType) => {
  const pages = await Promise.all(
    Array.from({ length: DISCOVER_PAGES }, (_, i) =>
      tmdb.discover(toTmdbType(type), discoverParams(profile, i + 1)),
    ),
  );
  return pages.flatMap((page) => page.results).map(
    (item: TmdbListItem): Candidate => ({ type, tmdbId: item.id, genre: item.genre_ids[0] ?? 0 }),
  );
};

/**
 * Popular, varied titles for a new profile. Movies and series alternate; inside
 * each type, a main genre comes back only after every other genre left has had a turn.
 */
export const pickVaried = (movies: Candidate[], series: Candidate[], seen: Set<string>, size: number) => {
  const fresh = (list: Candidate[]) => {
    const unique = new Map<string, Candidate>();
    for (const c of list) if (!seen.has(seenKey(c.type, c.tmdbId))) unique.set(seenKey(c.type, c.tmdbId), c);
    return [...unique.values()];
  };
  const queues = [fresh(movies), fresh(series)].map((items) => ({ items, usedGenres: new Set<number>() }));
  const takeNext = (queue: (typeof queues)[number]) => {
    let index = queue.items.findIndex((c) => !queue.usedGenres.has(c.genre));
    if (index === -1) {
      queue.usedGenres.clear();
      index = 0;
    }
    const [candidate] = queue.items.splice(index, 1);
    queue.usedGenres.add(candidate!.genre);
    return candidate!;
  };

  const picked: Candidate[] = [];
  while (picked.length < size && queues.some((q) => q.items.length > 0)) {
    for (const queue of queues) {
      if (picked.length < size && queue.items.length > 0) picked.push(takeNext(queue));
    }
  }
  return picked;
};

export const buildColdStartPool = async (
  deps: { tmdb: TmdbClient; catalog: CatalogService },
  { profile, seen, size, weights = {} }: ColdStartInput,
): Promise<TitleCard[]> => {
  const wanted = (c: Candidate) => (weights[`genre:${c.genre}`] ?? 0) >= 0;
  const [allMovies, allSeries] = await Promise.all([
    discoverType(deps.tmdb, profile, "movie"),
    discoverType(deps.tmdb, profile, "series"),
  ]);
  const movies = allMovies.filter(wanted);
  const series = allSeries.filter(wanted);
  const services = profile.showEverything ? [] : profile.services;
  const cards = await Promise.allSettled(
    pickVaried(movies, series, seen, size).map((c) =>
      deps.catalog.getTitleCard(c.type, c.tmdbId, profile.country, services),
    ),
  );
  // A title that fails to load is left out; the pool still comes back.
  return cards.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
};

import { describe, expect, it } from "vitest";
import { PoolResponse, type TitleCard } from "@firedrift/domain";
import { DEFAULT_PROFILE } from "../src/profile/profileStore";
import { buildTastePool, quotaSlots } from "../src/taste/buildPool";
import { DEFAULT_TASTE_CONFIG, mergeConfig } from "../src/taste/config";
import { canonicalGenre, discoverGenre, runtimeBand, titleFeatures } from "../src/taste/features";
import { learnWeights, signalStrength } from "../src/taste/learn";
import { scoreTitle } from "../src/taste/score";
import { poolBuilderFor } from "../src/taste/versions";
import type { WeightLayers } from "../src/weights/weightStore";
import { createTasteWorld, NOW, signal } from "./tasteWorld";

const config = DEFAULT_TASTE_CONFIG;
const noLayers: WeightLayers = { learned: {}, labels: {}, adjustment: {}, adjustmentUpdatedAt: null };
const input = (signals = [] as ReturnType<typeof signal>[], extra = {}) => ({
  profile: DEFAULT_PROFILE,
  signals,
  recentPools: [],
  layers: noLayers,
  config,
  size: 20,
  now: NOW,
  ...extra,
});

/** Movies with id % 5 = 0 are Action, = 1 are Romance (see tasteWorld). */
const actionLikesRomanceSkips = () => [
  ...[5, 10, 15, 20, 25].map((id) => signal("like", id)),
  ...[1, 6, 11, 16, 21].map((id) => signal("skip", id)),
];
const share = (titles: TitleCard[], genres: string[]) =>
  titles.filter((t) => t.genres.some((g) => genres.includes(g))).length / titles.length;

describe("features", () => {
  it("bands runtimes per type", () => {
    expect(runtimeBand("movie", 90)).toBe("short");
    expect(runtimeBand("movie", 120)).toBe("medium");
    expect(runtimeBand("movie", 150)).toBe("long");
    expect(runtimeBand("series", 25)).toBe("short");
    expect(runtimeBand("series", 60)).toBe("long");
  });

  it("maps TV-only genres to the movie genre, and back for TV discover", () => {
    expect(canonicalGenre(10759)).toBe(28);
    expect(canonicalGenre(18)).toBe(18);
    expect(discoverGenre("series", 28)).toBe(10759);
    expect(discoverGenre("series", 10749)).toBeUndefined();
    expect(discoverGenre("movie", 10749)).toBe(10749);
  });

  it("builds keys with labels for every kind", () => {
    const keys = titleFeatures("series", {
      genres: [{ id: 10759, name: "Action & Adventure" }],
      keywords: [{ id: 9, name: "heist" }],
      people: [{ id: 7, name: "Ana" }],
      year: 1994,
      runtimeMinutes: 45,
    });
    expect(keys.map((f) => f.key)).toEqual([
      "genre:28",
      "keyword:9",
      "person:7",
      "decade:1990",
      "type:series",
      "runtime:medium",
    ]);
    expect(keys[0]?.label).toBe("Action & Adventure");
  });
});

describe("learnWeights", () => {
  it("orders strengths: watch now > like > long dwell > short dwell > skip", () => {
    const strengths = [
      signal("watch_now", 1),
      signal("like", 1),
      signal("dwell", 1, { surface: "cover", ratio: 1 }),
      signal("dwell", 1, { surface: "cover", ratio: 0.5 }),
      signal("dwell", 1, { surface: "cover", ratio: 0.05 }),
      signal("skip", 1),
    ].map((s) => signalStrength(s, config));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
    expect(strengths[3]).toBe(0);
    expect(strengths[4]).toBeLessThan(0);
  });

  it("scales weights to [-1, 1], keeps labels, and weighs recent signals more", () => {
    const features = (id: number) => [
      { key: `genre:${id}`, kind: "genre" as const, label: `G${id}` },
    ];
    const old = signal("like", 1, { at: "2026-09-07T12:00:00Z" });
    const recent = signal("like", 2);
    const skip = signal("skip", 3);
    const { weights, labels } = learnWeights([old, recent, skip], (s) => features(s.tmdbId), config, NOW);
    expect(Math.max(...Object.values(weights).map(Math.abs))).toBe(1);
    expect(weights["genre:2"]).toBeGreaterThan(weights["genre:1"]!);
    expect(weights["genre:3"]).toBeLessThan(0);
    expect(labels["genre:2"]).toBe("G2");
  });

  it("returns nothing without signals", () => {
    expect(learnWeights([], () => [], config, NOW)).toEqual({ weights: {}, labels: {} });
  });
});

describe("scoreTitle", () => {
  it("adds weights times kind factors", () => {
    const features = [
      { key: "genre:28", kind: "genre" as const, label: "Action" },
      { key: "keyword:1", kind: "keyword" as const, label: "k" },
    ];
    const score = scoreTitle(features, { "genre:28": 0.8, "keyword:1": 0.4 }, config);
    expect(score).toBeCloseTo(0.8 * 1 + 0.4 * 0.5);
  });
});

describe("quotaSlots", () => {
  it("splits 50 / 30 / 20 and gives rounding leftovers to the first buckets", () => {
    expect(quotaSlots(20, config.quotas)).toEqual({ favourites: 10, genres: 6, discovery: 4 });
    expect(quotaSlots(7, config.quotas)).toEqual({ favourites: 4, genres: 2, discovery: 1 });
  });
});

describe("buildTastePool", () => {
  it("moves toward action after 5 action likes and 5 romance skips (FR-2 acceptance)", async () => {
    const coldWorld = createTasteWorld();
    const cold = await buildTastePool(coldWorld, input());
    const world = createTasteWorld();
    const pool = await buildTastePool(world, input(actionLikesRomanceSkips()));

    expect(pool.algorithmVersion).toBe("taste-1");
    expect(pool.titles).toHaveLength(20);
    const action = ["Action", "Action & Adventure"];
    expect(share(pool.titles, action)).toBeGreaterThan(0.5);
    expect(share(pool.titles, action)).toBeGreaterThan(share(cold.titles, action));
    expect(share(pool.titles, ["Romance"])).toBeLessThanOrEqual(0.1);
    expect(PoolResponse.parse({ poolId: "p", algorithmVersion: pool.algorithmVersion, titles: pool.titles })).toBeTruthy();
  });

  it("learns names for the butler and /weights", async () => {
    const { learned } = await buildTastePool(createTasteWorld(), input(actionLikesRomanceSkips()));
    expect(learned.weights["genre:28"]).toBe(1);
    expect(learned.weights["genre:10749"]).toBeLessThan(0);
    expect(learned.labels["genre:28"]).toBe("Action");
    expect(learned.labels["person:2800"]).toBe("Action star");
  });

  it("never repeats a title, a signalled title or a title from recent pools", async () => {
    const recentPools = [
      { poolId: "a", createdAt: "2026-10-05T09:00:00Z", titles: [30, 35, 40].map((tmdbId) => ({ type: "movie" as const, tmdbId })) },
    ];
    const signals = actionLikesRomanceSkips();
    const { titles } = await buildTastePool(createTasteWorld(), input(signals, { recentPools }));
    const keys = titles.map((t) => `${t.type}:${t.tmdbId}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const blocked of [...signals.map((s) => s.tmdbId), 30, 35, 40]) {
      expect(keys).not.toContain(`movie:${blocked}`);
    }
  });

  it("asks TMDB for recommendations of the liked titles and discovery outside known genres", async () => {
    const world = createTasteWorld();
    await buildTastePool(world, input(actionLikesRomanceSkips()));
    const seeds = world.recommendations.mock.calls.map(([, id]) => id).sort((a, b) => a - b);
    expect(seeds).toEqual([5, 10, 15, 20, 25]);
    const discovery = world.discover.mock.calls.find(([type, params]) => type === "movie" && params.without_genres);
    expect(String(discovery?.[1].without_genres).split(",")).toEqual(expect.arrayContaining(["28", "10749"]));
  });

  it("only returns titles on my services", async () => {
    const offServices = Array.from({ length: 200 }, (_, i) => i + 1).filter((id) => id % 2 === 0);
    const profile = { country: "ES", services: [8], showEverything: false };
    const { titles } = await buildTastePool(createTasteWorld({ offServices }), input(actionLikesRomanceSkips(), { profile }));
    expect(titles.length).toBe(20);
    expect(titles.every((t) => t.onMyServices)).toBe(true);
  });

  it("falls back to the cold start without positive taste", async () => {
    const pool = await buildTastePool(createTasteWorld(), input([signal("skip", 1)]));
    expect(pool.algorithmVersion).toBe("cold-start-1");
    expect(pool.titles).toHaveLength(20);
  });

  it("uses the butler adjustment as taste", async () => {
    const layers = { ...noLayers, adjustment: { "genre:878": 0.8 }, adjustmentUpdatedAt: "2026-10-05T12:00:00Z" };
    const pool = await buildTastePool(createTasteWorld(), input([], { layers }));
    expect(pool.algorithmVersion).toBe("taste-1");
    expect(share(pool.titles, ["Science Fiction", "Sci-Fi & Fantasy"])).toBeGreaterThan(0.3);
  });
});

describe("versions", () => {
  it("picks the builder named by the config, and the current one for unknown names", async () => {
    const cold = await poolBuilderFor("cold-start-1")(createTasteWorld(), input(actionLikesRomanceSkips()));
    expect(cold.algorithmVersion).toBe("cold-start-1");
    expect(poolBuilderFor("nope")).toBe(buildTastePool);
  });

  it("merges config overrides field by field and ignores wrong types", () => {
    const merged = mergeConfig(DEFAULT_TASTE_CONFIG, { quotas: { discovery: 0.4 }, maxSeeds: "many" });
    expect(merged.quotas).toEqual({ favourites: 0.5, genres: 0.3, discovery: 0.4 });
    expect(merged.maxSeeds).toBe(DEFAULT_TASTE_CONFIG.maxSeeds);
  });
});

describe("muteFactor", () => {
  it("shrinks a positive score by the most negative butler adjustment among the title's features", async () => {
    const { muteFactor } = await import("../src/taste/score");
    const features = [
      { key: "genre:27", kind: "genre" as const, label: "Horror" },
      { key: "keyword:1", kind: "keyword" as const, label: "k" },
    ];
    expect(muteFactor(features, { "genre:27": -0.5, "keyword:1": -0.2 })).toBe(0.5);
    expect(muteFactor(features, { "genre:27": -1 })).toBe(0);
    expect(muteFactor(features, { "genre:27": 0.4 })).toBe(1);
    expect(scoreTitle(features, { "genre:27": 1 }, config, 0, { "genre:27": -0.5 })).toBeCloseTo(0.5);
  });
});

import { describe, expect, it } from "vitest";
import { buildColdStartPool, pickVaried, seenKey } from "../src/pool/coldStart";
import { DEFAULT_PROFILE } from "../src/profile/profileStore";
import { createFakeCatalog, createFakeTmdb } from "./profileFakes";

const candidates = (type: "movie" | "series", ids: number[], genre = (id: number) => id % 3) =>
  ids.map((tmdbId) => ({ type, tmdbId, genre: genre(tmdbId) }));

describe("pickVaried", () => {
  it("alternates movies and series", () => {
    const picked = pickVaried(candidates("movie", [1, 2, 3]), candidates("series", [4, 5, 6]), new Set(), 4);
    expect(picked.map((c) => c.type)).toEqual(["movie", "series", "movie", "series"]);
  });

  it("repeats a main genre only after the other genres had a turn", () => {
    const movies = candidates("movie", [1, 2, 3, 4], (id) => (id <= 2 ? 28 : 12));
    const picked = pickVaried(movies, [], new Set(), 4);
    expect(picked.map((c) => c.genre)).toEqual([28, 12, 28, 12]);
  });

  it("keeps going with one type when the other runs out", () => {
    const picked = pickVaried(candidates("movie", [1, 2, 3]), candidates("series", [4]), new Set(), 4);
    expect(picked.map((c) => c.type)).toEqual(["movie", "series", "movie", "movie"]);
  });

  it("skips seen titles and duplicates", () => {
    const picked = pickVaried(candidates("movie", [1, 1, 2]), [], new Set([seenKey("movie", 2)]), 5);
    expect(picked.map((c) => c.tmdbId)).toEqual([1]);
  });
});

describe("buildColdStartPool", () => {
  it("returns size cards, both types, no repeats", async () => {
    const { tmdb } = createFakeTmdb();
    const { catalog } = createFakeCatalog();
    const titles = await buildColdStartPool({ tmdb, catalog }, { profile: DEFAULT_PROFILE, seen: new Set(), size: 20 });
    expect(titles).toHaveLength(20);
    expect(new Set(titles.map((t) => seenKey(t.type, t.tmdbId))).size).toBe(20);
    expect(new Set(titles.map((t) => t.type))).toEqual(new Set(["movie", "series"]));
  });

  it("leaves out a main genre with a negative weight", async () => {
    const { tmdb } = createFakeTmdb();
    const { catalog, getTitleCard } = createFakeCatalog();
    // The fake gives each title the main genre (id - 1) % 4: genre 0 is ids 1, 5, 9…
    await buildColdStartPool({ tmdb, catalog }, { profile: DEFAULT_PROFILE, seen: new Set(), size: 20, weights: { "genre:0": -0.5 } });
    const ids = getTitleCard.mock.calls.map((call) => call[1]);
    expect(ids).toHaveLength(20);
    expect(ids.some((id) => (id - 1) % 4 === 0)).toBe(false);
  });

  it("filters by the profile's services and country", async () => {
    const { tmdb, discover } = createFakeTmdb();
    const { catalog, getTitleCard } = createFakeCatalog();
    const profile = { country: "US", services: [8, 337], showEverything: false };
    await buildColdStartPool({ tmdb, catalog }, { profile, seen: new Set(), size: 2 });
    expect(discover.mock.calls[0]?.[1]).toMatchObject({ watch_region: "US", with_watch_providers: "8|337" });
    expect(getTitleCard.mock.calls[0]?.slice(2)).toEqual(["US", [8, 337]]);
  });

  it("does not filter by provider when the profile shows everything", async () => {
    const { tmdb, discover } = createFakeTmdb();
    const { catalog, getTitleCard } = createFakeCatalog();
    const profile = { country: "ES", services: [8], showEverything: true };
    await buildColdStartPool({ tmdb, catalog }, { profile, seen: new Set(), size: 2 });
    expect(discover.mock.calls[0]?.[1]).not.toHaveProperty("with_watch_providers");
    expect(getTitleCard.mock.calls[0]?.[3]).toEqual([]);
  });

  it("leaves out a title whose card fails", async () => {
    const { tmdb } = createFakeTmdb();
    const { catalog } = createFakeCatalog([1]);
    const titles = await buildColdStartPool({ tmdb, catalog }, { profile: DEFAULT_PROFILE, seen: new Set(), size: 4 });
    expect(titles).toHaveLength(3);
    expect(titles.some((t) => t.tmdbId === 1)).toBe(false);
  });
});

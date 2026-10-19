import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "../src/catalog/cache";
import { createTmdbClient, parseTmdbSecret, TmdbError } from "../src/catalog/tmdbClient";
import { createFakeTmdbFetch, createTestTmdb } from "./helpers";

describe("tmdb client", () => {
  it("asks for videos and watch providers in the same details request", async () => {
    const { tmdb, fetch } = createTestTmdb();
    await tmdb.details("tv", 70523);

    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/3/tv/70523");
    expect(url.searchParams.get("append_to_response")).toBe("videos,watch/providers");
    expect(url.searchParams.get("language")).toBe("en-US");
  });

  it("serves repeated requests from the cache", async () => {
    const { tmdb, fetch } = createTestTmdb();
    await tmdb.details("tv", 70523);
    await tmdb.videos("tv", 70523);
    await tmdb.watchProviders("tv", 70523, "ES");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a token as a Bearer header", async () => {
    const { tmdb, fetch } = createTestTmdb();
    await tmdb.details("movie", 27205);
    const init = fetch.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("sends an API key as a query parameter but keeps it out of the cache key", async () => {
    const fetch = createFakeTmdbFetch();
    const cache = createMemoryCache();
    const setSpy = vi.spyOn(cache, "set");
    const tmdb = createTmdbClient({
      credentials: async () => ({ kind: "apiKey", key: "0123456789abcdef0123456789abcdef" }),
      cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await tmdb.details("movie", 27205);

    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("api_key")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(setSpy.mock.calls[0]?.[0]).not.toContain("api_key");
  });

  it("throws TmdbError with the TMDB status", async () => {
    const { tmdb } = createTestTmdb();
    await expect(tmdb.details("movie", 1)).rejects.toMatchObject({ status: 404 });
    await expect(tmdb.details("movie", 503)).rejects.toBeInstanceOf(TmdbError);
  });

  it("does not cache errors", async () => {
    const { tmdb, fetch } = createTestTmdb();
    await tmdb.details("movie", 1).catch(() => undefined);
    await tmdb.details("movie", 1).catch(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("passes the year to search with the right TMDB name per type", async () => {
    const { tmdb, fetch } = createTestTmdb();
    await tmdb.search("movie", "Inception", 2010).catch(() => undefined);
    await tmdb.search("tv", "Dark", 2017).catch(() => undefined);
    const [movie, tv] = fetch.mock.calls.map(([input]) => new URL(String(input)).searchParams);
    expect(movie?.get("year")).toBe("2010");
    expect(tv?.get("first_air_date_year")).toBe("2017");
  });
});

describe("parseTmdbSecret", () => {
  it("reads a 32-character hex string as a v3 API key", () => {
    expect(parseTmdbSecret("0123456789abcdef0123456789abcdef\n")).toEqual({
      kind: "apiKey",
      key: "0123456789abcdef0123456789abcdef",
    });
  });

  it("reads anything else as a Read Access Token", () => {
    expect(parseTmdbSecret("eyJhbGciOiJIUzI1NiJ9.token")).toEqual({
      kind: "bearer",
      token: "eyJhbGciOiJIUzI1NiJ9.token",
    });
  });
});

describe("tmdb client features", () => {
  const raw = {
    genres: [{ id: 28, name: "Action" }],
    release_date: "2010-07-15",
    runtime: 148,
    keywords: { keywords: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `k${i + 1}` })) },
    credits: {
      cast: Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, name: `actor ${i}`, order: 7 - i, character: "x" })),
      crew: [
        { id: 525, name: "Christopher Nolan", job: "Director" },
        { id: 1, name: "Someone", job: "Editor" },
      ],
    },
  };

  const setup = (body: unknown) => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    const cache = createMemoryCache();
    const setSpy = vi.spyOn(cache, "set");
    const tmdb = createTmdbClient({
      credentials: async () => ({ kind: "bearer", token: "t" }),
      cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    return { tmdb, fetch, setSpy };
  };

  it("asks for keywords and credits and keeps only what taste needs", async () => {
    const { tmdb, fetch } = setup(raw);
    const features = await tmdb.features("movie", 27205);

    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/3/movie/27205");
    expect(url.searchParams.get("append_to_response")).toBe("keywords,credits");
    expect(features.keywords).toHaveLength(10);
    expect(features.people.map((p) => p.name)).toEqual([
      "actor 7",
      "actor 6",
      "actor 5",
      "actor 4",
      "actor 3",
      "Christopher Nolan",
    ]);
    expect(features).toMatchObject({ year: 2010, runtimeMinutes: 148, genres: [{ id: 28, name: "Action" }] });
  });

  it("caches the trimmed value under its own key for 30 days", async () => {
    const { tmdb, fetch, setSpy } = setup(raw);
    await tmdb.features("movie", 27205);
    await tmdb.features("movie", 27205);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [key, value, ttl] = setSpy.mock.calls[0]!;
    expect(key.startsWith("features:/movie/27205?")).toBe(true);
    expect(value).not.toContain("character");
    expect(ttl).toBe(30 * 24 * 3600);
  });

  it("reads series keywords and creators", async () => {
    const { tmdb } = setup({
      genres: [{ id: 18, name: "Drama" }],
      first_air_date: "2017-12-01",
      episode_run_time: [60],
      created_by: [{ id: 9, name: "Baran bo Odar" }],
      keywords: { results: [{ id: 5, name: "time travel" }] },
      credits: { cast: [{ id: 1, name: "Louis", order: 0 }], crew: [] },
    });
    const features = await tmdb.features("tv", 70523);
    expect(features).toMatchObject({
      year: 2017,
      runtimeMinutes: 60,
      keywords: [{ id: 5, name: "time travel" }],
      people: [{ id: 1, name: "Louis" }, { id: 9, name: "Baran bo Odar" }],
    });
  });
});

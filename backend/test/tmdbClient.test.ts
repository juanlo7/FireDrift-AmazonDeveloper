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

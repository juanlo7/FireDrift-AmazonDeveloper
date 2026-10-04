import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { createMemoryCache } from "../src/catalog/cache";
import { createTmdbClient } from "../src/catalog/tmdbClient";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "tmdb", `${name}.json`), "utf8");

/** TMDB paths served from `test/fixtures/tmdb/`. Anything else is a 404. */
const ROUTES: Record<string, string> = {
  "/3/tv/70523": "tv-70523",
  "/3/movie/27205": "movie-27205",
  "/3/watch/providers/movie": "providers-movie-ES",
  "/3/watch/providers/tv": "providers-tv-ES",
};

/** A `fetch` that answers like TMDB from the fixtures. */
export const createFakeTmdbFetch = () =>
  vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    const name = ROUTES[url.pathname];
    if (url.pathname === "/3/movie/503") return new Response("{}", { status: 503 });
    if (url.pathname === "/3/movie/429") return new Response("{}", { status: 429 });
    return name
      ? new Response(fixture(name), { status: 200 })
      : new Response(fixture("movie-404"), { status: 404 });
  });

export const createTestTmdb = () => {
  const fetch = createFakeTmdbFetch();
  const tmdb = createTmdbClient({
    credentials: async () => ({ kind: "bearer", token: "test-token" }),
    cache: createMemoryCache(),
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { tmdb, fetch };
};

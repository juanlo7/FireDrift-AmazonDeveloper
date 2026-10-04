import type { Cache } from "./cache";
import type {
  TmdbCountryProviders,
  TmdbDetails,
  TmdbListItem,
  TmdbMediaType,
  TmdbPage,
  TmdbProviderListItem,
  TmdbVideo,
} from "./tmdbTypes";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/** How long each kind of TMDB response stays in the cache. */
export const CACHE_TTL_SECONDS = {
  details: 24 * 3600,
  search: 24 * 3600,
  list: 24 * 3600,
  discover: 6 * 3600,
  providerList: 7 * 24 * 3600,
} as const;

/** A TMDB API Read Access Token (Bearer) or a v3 API key. */
export type TmdbCredentials = { kind: "bearer"; token: string } | { kind: "apiKey"; key: string };

/** Reads the secret value: a 32-character hex string is a v3 API key, anything else a token. */
export const parseTmdbSecret = (secret: string): TmdbCredentials => {
  const value = secret.trim();
  return /^[0-9a-f]{32}$/i.test(value)
    ? { kind: "apiKey", key: value }
    : { kind: "bearer", token: value };
};

export class TmdbError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export type DiscoverParams = Record<string, string | number | boolean | undefined>;

/** The TMDB calls FireDrift needs. Every call is cached. */
export interface TmdbClient {
  search(type: TmdbMediaType, query: string, year?: number): Promise<TmdbPage<TmdbListItem>>;
  /** Details with videos and watch providers for every country, in one request. */
  details(type: TmdbMediaType, id: number): Promise<TmdbDetails>;
  videos(type: TmdbMediaType, id: number): Promise<TmdbVideo[]>;
  watchProviders(type: TmdbMediaType, id: number, country: string): Promise<TmdbCountryProviders>;
  /** Every streaming provider TMDB knows in a country. */
  providerList(type: TmdbMediaType, country: string): Promise<TmdbProviderListItem[]>;
  discover(type: TmdbMediaType, params: DiscoverParams): Promise<TmdbPage<TmdbListItem>>;
  recommendations(type: TmdbMediaType, id: number, page?: number): Promise<TmdbPage<TmdbListItem>>;
  similar(type: TmdbMediaType, id: number, page?: number): Promise<TmdbPage<TmdbListItem>>;
}

export interface TmdbClientOptions {
  credentials: () => Promise<TmdbCredentials>;
  cache: Cache;
  fetch?: typeof fetch;
  /** Language for names and overviews (NFR-8: English). */
  language?: string;
  timeoutMs?: number;
}

export const createTmdbClient = ({
  credentials,
  cache,
  fetch: fetchImpl = fetch,
  language = "en-US",
  timeoutMs = 5000,
}: TmdbClientOptions): TmdbClient => {
  /** GET `path` with `params`; the cache key never holds the credentials. */
  const get = async <T>(path: string, params: DiscoverParams, ttlSeconds: number): Promise<T> => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries({ language, ...params }).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (value !== undefined) query.set(name, String(value));
    }
    const cacheKey = `${path}?${query.toString()}`;

    const cached = await cache.get(cacheKey);
    if (cached !== undefined) return JSON.parse(cached) as T;

    const auth = await credentials();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth.kind === "bearer") headers.Authorization = `Bearer ${auth.token}`;
    else query.set("api_key", auth.key);

    const response = await fetchImpl(`${TMDB_BASE_URL}${path}?${query.toString()}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new TmdbError(response.status, `TMDB ${path} returned ${response.status}`);
    }
    const body = await response.text();
    await cache.set(cacheKey, body, ttlSeconds);
    return JSON.parse(body) as T;
  };

  const details: TmdbClient["details"] = (type, id) =>
    get(`/${type}/${id}`, { append_to_response: "videos,watch/providers" }, CACHE_TTL_SECONDS.details);

  return {
    search: (type, query, year) =>
      get(
        `/search/${type}`,
        {
          query,
          include_adult: false,
          ...(type === "movie" ? { year } : { first_air_date_year: year }),
        },
        CACHE_TTL_SECONDS.search,
      ),
    details,
    videos: async (type, id) => (await details(type, id)).videos?.results ?? [],
    watchProviders: async (type, id, country) =>
      (await details(type, id))["watch/providers"]?.results[country] ?? {},
    providerList: async (type, country) =>
      (
        await get<{ results: TmdbProviderListItem[] }>(
          `/watch/providers/${type}`,
          { watch_region: country },
          CACHE_TTL_SECONDS.providerList,
        )
      ).results,
    discover: (type, params) =>
      get(`/discover/${type}`, { include_adult: false, ...params }, CACHE_TTL_SECONDS.discover),
    recommendations: (type, id, page = 1) =>
      get(`/${type}/${id}/recommendations`, { page }, CACHE_TTL_SECONDS.list),
    similar: (type, id, page = 1) =>
      get(`/${type}/${id}/similar`, { page }, CACHE_TTL_SECONDS.list),
  };
};

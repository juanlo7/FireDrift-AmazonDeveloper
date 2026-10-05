import type { Signal, TitleCard, TitleType } from "@firedrift/domain";
import { vi } from "vitest";
import type { CatalogService } from "../src/catalog/catalogService";
import type { TmdbClient } from "../src/catalog/tmdbClient";
import type { TmdbListItem, TmdbMediaType, TmdbPage, TmdbTitleFeatures } from "../src/catalog/tmdbTypes";

/**
 * A small fake TMDB. Movies 1–200 and series 1001–1100 cycle over five
 * genres; each genre has its own keyword and lead actor, so taste is visible.
 */
export const ACTION = 28;
export const ROMANCE = 10749;
const MOVIE_GENRES = [ACTION, ROMANCE, 35, 18, 878];
const TV_GENRES = [10759, 18, 35, 18, 10765];
const GENRE_NAMES: Record<number, string> = {
  28: "Action",
  10749: "Romance",
  35: "Comedy",
  18: "Drama",
  878: "Science Fiction",
  10759: "Action & Adventure",
  10765: "Sci-Fi & Fantasy",
};

const isMovie = (type: TmdbMediaType) => type === "movie";
const ids = (type: TmdbMediaType) =>
  isMovie(type) ? Array.from({ length: 200 }, (_, i) => i + 1) : Array.from({ length: 100 }, (_, i) => i + 1001);
export const genreOf = (type: TmdbMediaType, id: number) =>
  (isMovie(type) ? MOVIE_GENRES : TV_GENRES)[id % 5]!;

const listItem = (type: TmdbMediaType, id: number): TmdbListItem => ({
  id,
  ...(isMovie(type) ? { release_date: "2015-05-01" } : { first_air_date: "2015-05-01" }),
  overview: "",
  popularity: 1000 - (id % 1000),
  vote_average: 7,
  vote_count: 1000,
  genre_ids: [genreOf(type, id)],
  poster_path: null,
  backdrop_path: null,
});

const page = (results: TmdbListItem[], n = 1): TmdbPage<TmdbListItem> => ({
  page: n,
  results: results.slice((n - 1) * 20, n * 20),
  total_pages: Math.ceil(results.length / 20),
  total_results: results.length,
});

const numbers = (value: unknown, separator: string) =>
  value === undefined ? undefined : String(value).split(separator).map(Number);

export const createTasteWorld = (options: { offServices?: number[] } = {}) => {
  const discover = vi.fn(async (type: TmdbMediaType, params: Record<string, unknown>) => {
    const withGenres = numbers(params.with_genres, "|");
    const withoutGenres = numbers(params.without_genres, ",");
    const items = ids(type)
      .filter((id) => !withGenres || withGenres.includes(genreOf(type, id)))
      .filter((id) => !withoutGenres || !withoutGenres.includes(genreOf(type, id)))
      .map((id) => listItem(type, id));
    return page(items, Number(params.page ?? 1));
  });
  const recommendations = vi.fn(async (type: TmdbMediaType, id: number) =>
    page(
      ids(type)
        .filter((other) => other !== id && genreOf(type, other) === genreOf(type, id))
        .slice(id % 7, (id % 7) + 20)
        .map((other) => listItem(type, other)),
    ),
  );
  const features = vi.fn(async (type: TmdbMediaType, id: number): Promise<TmdbTitleFeatures> => {
    const genre = genreOf(type, id);
    return {
      genres: [{ id: genre, name: GENRE_NAMES[genre]! }],
      keywords: [{ id: genre * 10, name: `${GENRE_NAMES[genre]} keyword` }],
      people: [{ id: genre * 100, name: `${GENRE_NAMES[genre]} star` }],
      year: 2015,
      runtimeMinutes: isMovie(type) ? 110 : 45,
    };
  });
  const tmdb = { discover, recommendations, features } as unknown as TmdbClient;

  const getTitleCard = vi.fn(async (type: TitleType, tmdbId: number): Promise<TitleCard> => {
    const genre = genreOf(type === "movie" ? "movie" : "tv", tmdbId);
    return {
      tmdbId,
      type,
      name: `${type} ${tmdbId}`,
      year: 2015,
      overview: "",
      rating: 7,
      genres: [GENRE_NAMES[genre]!],
      runtimeMinutes: 100,
      posterUrl: null,
      backdropUrl: null,
      trailerKey: null,
      providers: [],
      onMyServices: !(options.offServices ?? []).includes(tmdbId),
    };
  });
  const catalog = { getTitleCard, listProviders: vi.fn() } as unknown as CatalogService;
  return { tmdb, catalog, discover, recommendations, features, getTitleCard };
};

let counter = 0;
export const signal = (kind: Signal["kind"], tmdbId: number, extra: Partial<Signal> = {}): Signal =>
  ({
    signalId: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    tmdbId,
    type: "movie",
    kind,
    source: "feed",
    at: "2026-10-05T10:00:00Z",
    ...extra,
  }) as Signal;

export const NOW = Date.parse("2026-10-05T12:00:00Z");

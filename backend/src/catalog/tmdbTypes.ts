/** The parts of TMDB API v3 responses we read. https://developer.themoviedb.org/reference */

export type TmdbMediaType = "movie" | "tv";

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official?: boolean;
  published_at?: string;
}

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

export interface TmdbCountryProviders {
  link?: string;
  flatrate?: TmdbWatchProvider[];
  free?: TmdbWatchProvider[];
  ads?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
}

interface TmdbDetailsBase {
  id: number;
  overview: string;
  vote_average: number;
  vote_count: number;
  genres: TmdbGenre[];
  poster_path: string | null;
  backdrop_path: string | null;
  /** Present when requested with `append_to_response=videos`. */
  videos?: { results: TmdbVideo[] };
  /** Present when requested with `append_to_response=watch/providers`. */
  "watch/providers"?: { results: Record<string, TmdbCountryProviders> };
}

export interface TmdbMovieDetails extends TmdbDetailsBase {
  title: string;
  release_date?: string;
  runtime: number | null;
}

export interface TmdbTvDetails extends TmdbDetailsBase {
  name: string;
  first_air_date?: string;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime: number | null } | null;
}

export type TmdbDetails = TmdbMovieDetails | TmdbTvDetails;

export interface TmdbNamed {
  id: number;
  name: string;
}

/** Raw `/{type}/{id}?append_to_response=keywords,credits` fields that `features` reads. */
export interface TmdbFeaturesResponse {
  genres?: TmdbNamed[];
  release_date?: string;
  first_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  created_by?: TmdbNamed[];
  /** Movies: `keywords.keywords`; series: `keywords.results`. */
  keywords?: { keywords?: TmdbNamed[]; results?: TmdbNamed[] };
  credits?: {
    cast?: (TmdbNamed & { order?: number })[];
    crew?: (TmdbNamed & { job?: string })[];
  };
}

/** What the taste algorithm needs from a title: small enough to cache for weeks. */
export interface TmdbTitleFeatures {
  genres: TmdbNamed[];
  keywords: TmdbNamed[];
  /** Main cast first, then directors (series: creators). */
  people: TmdbNamed[];
  /** First release or air year, or null. */
  year: number | null;
  /** Movie runtime or episode runtime, in minutes, or null. */
  runtimeMinutes: number | null;
}

/** One item of search, discover, recommendations and similar results. */
export interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbProviderListItem {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
  display_priorities?: Record<string, number>;
}

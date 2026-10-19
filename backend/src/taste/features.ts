import type { FeatureKey, TitleType } from "@firedrift/domain";
import type { TmdbListItem, TmdbTitleFeatures } from "../catalog/tmdbTypes";
import type { FeatureKind } from "./config";

/** One feature of a title, with the label shown to the user and the butler. */
export interface Feature {
  key: FeatureKey;
  kind: FeatureKind;
  label: string;
}

/** TV-only TMDB genres mapped to the movie genre they mean, so taste carries across types. */
const TV_TO_MOVIE_GENRE: Record<number, number> = { 10759: 28, 10765: 878, 10768: 10752, 10762: 10751 };

/** Movie genre IDs that TV discover understands, as TV genre IDs. Others have no TV match. */
const MOVIE_TO_TV_GENRE: Record<number, number> = {
  28: 10759,
  12: 10759,
  878: 10765,
  14: 10765,
  10752: 10768,
  16: 16,
  35: 35,
  80: 80,
  99: 99,
  18: 18,
  10751: 10751,
  9648: 9648,
  37: 37,
};

/** Genre ID used in feature keys: always the movie genre. */
export const canonicalGenre = (id: number) => TV_TO_MOVIE_GENRE[id] ?? id;

/** Genre ID to send to TMDB discover for a type, or undefined when that type has none. */
export const discoverGenre = (type: TitleType, id: number): number | undefined =>
  type === "movie" ? id : MOVIE_TO_TV_GENRE[id];

export type RuntimeBand = "short" | "medium" | "long";

/** Movies: under 95 / 95–130 / over 130 min. Series, per episode: under 30 / 30–50 / over 50. */
export const runtimeBand = (type: TitleType, minutes: number): RuntimeBand => {
  const [shortBelow, longAbove] = type === "movie" ? [95, 130] : [30, 50];
  if (minutes < shortBelow) return "short";
  return minutes > longAbove ? "long" : "medium";
};

const feature = (kind: FeatureKind, value: string | number, label: string): Feature => ({
  key: `${kind}:${value}`,
  kind,
  label,
});

const uniqueByKey = (features: Feature[]) => [...new Map(features.map((f) => [f.key, f])).values()];

const decadeOf = (year: number) => Math.floor(year / 10) * 10;
const typeFeature = (type: TitleType) => feature("type", type, type === "movie" ? "Movies" : "Series");

/** Every feature of a title, from its trimmed TMDB features. */
export const titleFeatures = (type: TitleType, raw: TmdbTitleFeatures): Feature[] =>
  uniqueByKey([
  ...raw.genres.map((g) => feature("genre", canonicalGenre(g.id), g.name)),
  ...raw.keywords.map((k) => feature("keyword", k.id, k.name)),
  ...raw.people.map((p) => feature("person", p.id, p.name)),
  ...(raw.year ? [feature("decade", decadeOf(raw.year), `${decadeOf(raw.year)}s`)] : []),
  typeFeature(type),
  ...(raw.runtimeMinutes
    ? [feature("runtime", runtimeBand(type, raw.runtimeMinutes), `${runtimeBand(type, raw.runtimeMinutes)} runtime`)]
    : []),
  ]);

/** The features a list item already has (genre IDs, year, type): enough to pre-rank candidates. */
export const listItemFeatures = (type: TitleType, item: TmdbListItem): Feature[] => {
  const date = item.release_date || item.first_air_date;
  const year = date ? Number(date.slice(0, 4)) : Number.NaN;
  return uniqueByKey([
    ...item.genre_ids.map((id) => feature("genre", canonicalGenre(id), `genre ${id}`)),
    ...(Number.isInteger(year) ? [feature("decade", decadeOf(year), `${decadeOf(year)}s`)] : []),
    typeFeature(type),
  ]);
};

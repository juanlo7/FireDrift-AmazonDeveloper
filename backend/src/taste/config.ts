import type { DwellSurface } from "@firedrift/domain";

export type FeatureKind = "genre" | "keyword" | "person" | "decade" | "type" | "runtime";

export interface DwellStrength {
  /** `ratio` at or above this counts as a long dwell. */
  longRatio: number;
  long: number;
  /** `ratio` below this counts as a short dwell. */
  shortRatio: number;
  short: number;
}

/** Every tunable of the taste algorithm. `CONFIG / ACTIVE` in DynamoDB can override any field. */
export interface TasteConfig {
  algorithmVersion: string;
  strengths: {
    watch_now: number;
    like: number;
    skip: number;
    dwell: Record<DwellSurface, DwellStrength>;
  };
  /** How much one signal moves each kind of feature of its title. */
  featureFactors: Record<FeatureKind, number>;
  /** Signals lose half their weight every this many days. */
  signalHalfLifeDays: number;
  maxSignals: number;
  quotas: { favourites: number; genres: number; discovery: number };
  maxSeeds: number;
  topGenres: number;
  /** Titles shown in this many latest pools are not shown again. */
  cooldownPools: number;
  /** Each repeat of a main genre inside a pool multiplies the score by this. */
  genreRepeatPenalty: number;
  /** Candidates scored with full features per quota slot. */
  candidatesPerSlot: number;
  /** Butler adjustments lose half their weight every this many days. */
  adjustmentHalfLifeDays: number;
  /** Limits of `update_weights`, enforced by the tool (FR-5). */
  butler: {
    maxChanges: number;
    maxDelta: number;
    /** Adjustment values stay in [-adjustmentRange, adjustmentRange]. */
    adjustmentRange: number;
    maxRankedPicks: number;
    /** `ranked_picks` gives the best matches: no discovery share. */
    rankedPicksQuotas: { favourites: number; genres: number; discovery: number };
  };
}

export const DEFAULT_TASTE_CONFIG: TasteConfig = {
  algorithmVersion: "taste-1",
  strengths: {
    watch_now: 1,
    like: 0.6,
    skip: -0.6,
    dwell: {
      // FR-2: the whole 15 s cap is a weak positive, under 2 s a weak negative.
      cover: { longRatio: 1, long: 0.15, shortRatio: 2 / 15, short: -0.1 },
      trailer: { longRatio: 0.9, long: 0.3, shortRatio: 0.1, short: -0.15 },
    },
  },
  featureFactors: { genre: 1, keyword: 0.5, person: 0.5, decade: 0.3, type: 0.2, runtime: 0.2 },
  signalHalfLifeDays: 14,
  maxSignals: 200,
  quotas: { favourites: 0.5, genres: 0.3, discovery: 0.2 },
  maxSeeds: 10,
  topGenres: 3,
  cooldownPools: 3,
  genreRepeatPenalty: 0.8,
  candidatesPerSlot: 2,
  adjustmentHalfLifeDays: 7,
  butler: {
    maxChanges: 3,
    maxDelta: 0.5,
    adjustmentRange: 1,
    maxRankedPicks: 10,
    rankedPicksQuotas: { favourites: 0.6, genres: 0.4, discovery: 0 },
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type TasteConfigOverrides = DeepPartial<TasteConfig>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Overrides replace only the fields they set; a wrong type for a field is ignored. */
export const mergeConfig = <T>(base: T, overrides: unknown): T => {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in base)) continue;
    const current = (base as Record<string, unknown>)[key];
    if (isPlainObject(current)) merged[key] = mergeConfig(current, value);
    else if (typeof value === typeof current) merged[key] = value;
  }
  return merged as T;
};

import type { FeatureKey, WeightChange, WeightDelta, WeightEntry, WeightsSummary } from "@firedrift/domain";

/** Feature key → weight. Missing features weigh 0. */
export type WeightMap = Record<FeatureKey, number>;

/** Effective weights live in [-WEIGHT_RANGE, WEIGHT_RANGE]. */
export const WEIGHT_RANGE = 1;
export const SUMMARY_TOP_N = 5;

const clamp = (value: number) => Math.max(-WEIGHT_RANGE, Math.min(WEIGHT_RANGE, value));

/** Effective weights = clamp(learned + adjustment), per feature. */
export const effectiveWeights = (learned: WeightMap, adjustment: WeightMap): WeightMap => {
  const effective: WeightMap = {};
  for (const feature of new Set([...Object.keys(learned), ...Object.keys(adjustment)])) {
    const weight = clamp((learned[feature] ?? 0) + (adjustment[feature] ?? 0));
    if (weight !== 0) effective[feature] = weight;
  }
  return effective;
};

/** Adds (or with `sign = -1` removes) a change's deltas from the adjustment layer. */
export const applyDeltas = (adjustment: WeightMap, deltas: WeightDelta[], sign: 1 | -1 = 1): WeightMap => {
  const next = { ...adjustment };
  for (const { feature, delta } of deltas) {
    const weight = (next[feature] ?? 0) + sign * delta;
    if (Math.abs(weight) < 1e-6) delete next[feature];
    else next[feature] = weight;
  }
  return next;
};

const DAY_MS = 24 * 3600 * 1000;

/** Share of a weight left after the time from `since` to `now`, with exponential decay. */
export const decayFactor = (since: string | null, now: number, halfLifeDays: number): number =>
  since ? 0.5 ** (Math.max(0, now - Date.parse(since)) / DAY_MS / halfLifeDays) : 1;

/** The adjustment layer as it weighs at `now`: every value decays from `updatedAt`. */
export const decayAdjustment = (
  adjustment: WeightMap,
  updatedAt: string | null,
  now: number,
  halfLifeDays: number,
): WeightMap => {
  const factor = decayFactor(updatedAt, now, halfLifeDays);
  return Object.fromEntries(Object.entries(adjustment).map(([feature, weight]) => [feature, weight * factor]));
};

/** Label of a feature: the learned name when known, else the key itself. */
export type LabelFeature = (feature: FeatureKey) => string;
const keyAsLabel: LabelFeature = (feature) => feature;

export const toSummary = (
  effective: WeightMap,
  lastChange: WeightChange | null,
  label: LabelFeature = keyAsLabel,
): WeightsSummary => {
  const entries: WeightEntry[] = Object.entries(effective).map(([feature, weight]) => ({
    feature,
    label: label(feature),
    weight,
  }));
  return {
    likes: entries
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, SUMMARY_TOP_N),
    dislikes: entries
      .filter((entry) => entry.weight < 0)
      .sort((a, b) => a.weight - b.weight)
      .slice(0, SUMMARY_TOP_N),
    lastChange,
  };
};

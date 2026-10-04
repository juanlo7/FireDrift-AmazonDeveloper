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
    if (Math.abs(weight) < 1e-9) delete next[feature];
    else next[feature] = weight;
  }
  return next;
};

/** Until #46 names features, the label is the key itself. */
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

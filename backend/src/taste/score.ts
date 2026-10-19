import type { WeightMap } from "../weights/summary";
import type { TasteConfig } from "./config";
import type { Feature } from "./features";

/** A small push toward well-known titles so ties break toward the popular one. */
const POPULARITY_WEIGHT = 0.05;

/**
 * Share of a title's score left after the butler lowered one of its features:
 * 1 + the most negative adjustment among them (−0.5 halves it, −1 removes it).
 * Without this, correlated features learned from the same likes (keywords,
 * cast) would keep the lowered genre on top.
 */
export const muteFactor = (features: Feature[], adjustment: WeightMap): number => {
  let lowest = 0;
  for (const feature of features) lowest = Math.min(lowest, adjustment[feature.key] ?? 0);
  return Math.max(0, 1 + lowest);
};

/**
 * How well a title fits the effective weights: Σ weight × kind factor, plus a
 * popularity prior; a positive score shrinks by `muteFactor` of the butler adjustment.
 */
export const scoreTitle = (
  features: Feature[],
  weights: WeightMap,
  config: TasteConfig,
  popularity = 0,
  adjustment: WeightMap = {},
): number => {
  const unique = [...new Map(features.map((f) => [f.key, f])).values()];
  let score = 0;
  for (const feature of unique) score += (weights[feature.key] ?? 0) * config.featureFactors[feature.kind];
  score += POPULARITY_WEIGHT * Math.log10(1 + Math.max(0, popularity));
  return score > 0 ? score * muteFactor(unique, adjustment) : score;
};

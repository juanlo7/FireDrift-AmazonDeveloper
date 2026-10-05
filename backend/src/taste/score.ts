import type { WeightMap } from "../weights/summary";
import type { TasteConfig } from "./config";
import type { Feature } from "./features";

/** A small push toward well-known titles so ties break toward the popular one. */
const POPULARITY_WEIGHT = 0.05;

/** How well a title fits the effective weights: Σ weight × kind factor, plus a popularity prior. */
export const scoreTitle = (
  features: Feature[],
  weights: WeightMap,
  config: TasteConfig,
  popularity = 0,
): number => {
  let score = 0;
  for (const feature of new Map(features.map((f) => [f.key, f])).values()) {
    score += (weights[feature.key] ?? 0) * config.featureFactors[feature.kind];
  }
  return score + POPULARITY_WEIGHT * Math.log10(1 + Math.max(0, popularity));
};

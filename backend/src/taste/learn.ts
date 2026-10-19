import type { Signal } from "@firedrift/domain";
import type { WeightMap } from "../weights/summary";
import type { TasteConfig } from "./config";
import type { Feature } from "./features";

const DAY_MS = 24 * 3600 * 1000;

/** How much one signal says about the taste, before recency. Zero means "no opinion". */
export const signalStrength = (signal: Signal, config: TasteConfig): number => {
  const { strengths } = config;
  switch (signal.kind) {
    case "watch_now":
      return strengths.watch_now;
    case "like":
      return strengths.like;
    case "skip":
      return strengths.skip;
    case "dwell": {
      const dwell = strengths.dwell[signal.surface ?? "cover"];
      const ratio = signal.ratio ?? 0;
      if (ratio >= dwell.longRatio) return dwell.long;
      return ratio < dwell.shortRatio ? dwell.short : 0;
    }
  }
};

export const recencyFactor = (at: string, now: number, halfLifeDays: number) =>
  0.5 ** (Math.max(0, now - Date.parse(at)) / DAY_MS / halfLifeDays);

export interface LearnedLayer {
  weights: WeightMap;
  labels: Record<string, string>;
}

/**
 * Learned weights from signals: each signal adds strength × recency × the
 * kind's factor to every feature of its title, then all weights are scaled so
 * the strongest one is ±1.
 */
export const learnWeights = (
  signals: Signal[],
  featuresOf: (signal: Signal) => Feature[] | undefined,
  config: TasteConfig,
  now: number,
): LearnedLayer => {
  const totals: WeightMap = {};
  const labels: Record<string, string> = {};
  const recent = [...signals].sort((a, b) => b.at.localeCompare(a.at)).slice(0, config.maxSignals);

  for (const signal of recent) {
    const strength = signalStrength(signal, config) * recencyFactor(signal.at, now, config.signalHalfLifeDays);
    if (strength === 0) continue;
    for (const feature of featuresOf(signal) ?? []) {
      totals[feature.key] = (totals[feature.key] ?? 0) + strength * config.featureFactors[feature.kind];
      labels[feature.key] = feature.label;
    }
  }

  const max = Math.max(0, ...Object.values(totals).map(Math.abs));
  if (max === 0) return { weights: {}, labels: {} };
  const weights: WeightMap = {};
  for (const [key, total] of Object.entries(totals)) {
    const weight = Math.round((total / max) * 1000) / 1000;
    if (weight !== 0) weights[key] = weight;
  }
  return { weights, labels: Object.fromEntries(Object.keys(weights).map((key) => [key, labels[key]!])) };
};

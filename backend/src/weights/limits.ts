import type { WeightDelta } from "@firedrift/domain";
import type { TasteConfig } from "../taste/config";
import type { WeightMap } from "./summary";

export interface LimitedChange {
  /** Deltas as applied after every limit; never empty when `ok`. */
  applied: WeightDelta[];
  /** The new adjustment layer. */
  adjustment: WeightMap;
  /** Features whose request was cut: dropped, delta capped or range reached. */
  clamped: string[];
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The limits of `update_weights` (FR-5), applied in code so no prompt can skip
 * them: repeated features are summed, at most `maxChanges` features change,
 * each delta is capped at ±`maxDelta`, and the adjustment stays within
 * ±`adjustmentRange`. `current` is the adjustment already decayed to now.
 */
export const limitChange = (
  requested: WeightDelta[],
  current: WeightMap,
  limits: TasteConfig["butler"],
): LimitedChange => {
  const merged = new Map<string, number>();
  for (const { feature, delta } of requested) merged.set(feature, (merged.get(feature) ?? 0) + delta);

  const clamped = new Set<string>();
  const adjustment: WeightMap = { ...current };
  const applied: WeightDelta[] = [];

  for (const [index, [feature, wanted]] of [...merged.entries()].entries()) {
    if (index >= limits.maxChanges) {
      clamped.add(feature);
      continue;
    }
    const capped = Math.max(-limits.maxDelta, Math.min(limits.maxDelta, wanted));
    const before = current[feature] ?? 0;
    const after = Math.max(-limits.adjustmentRange, Math.min(limits.adjustmentRange, before + capped));
    const delta = round(after - before);
    if (delta !== round(wanted)) clamped.add(feature);
    if (delta === 0) continue;
    applied.push({ feature, delta });
    if (Math.abs(after) < 1e-6) delete adjustment[feature];
    else adjustment[feature] = after;
  }
  return { applied, adjustment, clamped: [...clamped] };
};

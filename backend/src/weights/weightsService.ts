import { randomUUID } from "node:crypto";
import type { UpdateWeightsOutput, WeightChange, WeightDelta, WeightsSummary } from "@firedrift/domain";
import { DEFAULT_TASTE_CONFIG, type TasteConfig } from "../taste/config";
import type { ConfigStore } from "../taste/configStore";
import { applyDeltas, decayAdjustment, decayFactor, effectiveWeights, toSummary, type WeightMap } from "./summary";
import { limitChange } from "./limits";
import type { WeightLayers, WeightStore } from "./weightStore";

/** What `GET /weights`, undo and reset answer, and what `get_weights` (#47) reuses. */
export interface WeightsService {
  summary(profileId: string): Promise<WeightsSummary>;
  /** Reverts the newest change not undone yet. Does nothing when there is none. */
  undo(profileId: string): Promise<WeightsSummary>;
  /** Clears the butler adjustment layer. Pending changes are marked undone, so undo cannot replay them. */
  reset(profileId: string): Promise<WeightsSummary>;
  /**
   * The butler's `update_weights`: applies the limits and saves the change to
   * the adjustment layer. Returns null when nothing is left to change.
   */
  update(profileId: string, changes: WeightDelta[], reason: string): Promise<UpdateWeightsOutput | null>;
}

export interface WeightsServiceOptions {
  config?: ConfigStore;
  now?: () => number;
}

/** Effective weights at `now`: clamp(learned + decayed adjustment). Shared with the pools. */
export const effectiveFromLayers = (layers: WeightLayers, now: number, halfLifeDays: number): WeightMap =>
  effectiveWeights(layers.learned, decayAdjustment(layers.adjustment, layers.adjustmentUpdatedAt, now, halfLifeDays));

export const createWeightsService = (store: WeightStore, options: WeightsServiceOptions = {}): WeightsService => {
  const now = options.now ?? Date.now;
  const tasteConfig = async (): Promise<TasteConfig> =>
    (await options.config?.getTasteConfig()) ?? DEFAULT_TASTE_CONFIG;
  const halfLife = async () => (await tasteConfig()).adjustmentHalfLifeDays;

  const summary = async (profileId: string) => {
    const [layers, changes, halfLifeDays] = await Promise.all([
      store.getLayers(profileId),
      store.listChanges(profileId),
      halfLife(),
    ]);
    return toSummary(
      effectiveFromLayers(layers, now(), halfLifeDays),
      changes[0] ?? null,
      (feature) => layers.labels[feature] ?? feature,
    );
  };

  return {
    summary,
    async undo(profileId) {
      const [layers, changes, halfLifeDays] = await Promise.all([
        store.getLayers(profileId),
        store.listChanges(profileId),
        halfLife(),
      ]);
      const last = changes.find((change) => !change.undone);
      if (last) {
        // Decay is exponential, so the change still weighs delta × its own decay factor.
        const current = decayAdjustment(layers.adjustment, layers.adjustmentUpdatedAt, now(), halfLifeDays);
        const leftOfChange = decayFactor(last.at, now(), halfLifeDays);
        const reverted = applyDeltas(
          current,
          last.changes.map(({ feature, delta }) => ({ feature, delta: delta * leftOfChange })),
          -1,
        );
        await store.undoChange(profileId, last, reverted);
      }
      return summary(profileId);
    },
    async update(profileId, changes, reason) {
      const [layers, config] = await Promise.all([store.getLayers(profileId), tasteConfig()]);
      const at = new Date(now()).toISOString();
      const current = decayAdjustment(layers.adjustment, layers.adjustmentUpdatedAt, now(), config.adjustmentHalfLifeDays);
      const limited = limitChange(changes, current, config.butler);
      if (limited.applied.length === 0) return null;
      const change: WeightChange = {
        changeId: `chg_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        changes: limited.applied,
        reason,
        at,
        undone: false,
      };
      await store.addChange(profileId, change, limited.adjustment);
      return { change, clamped: limited.clamped };
    },
    async reset(profileId) {
      const pending = (await store.listChanges(profileId)).filter((change) => !change.undone);
      await store.resetAdjustment(profileId, pending);
      return summary(profileId);
    },
  };
};

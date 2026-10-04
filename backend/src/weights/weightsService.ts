import type { WeightsSummary } from "@firedrift/domain";
import { applyDeltas, effectiveWeights, toSummary } from "./summary";
import type { WeightStore } from "./weightStore";

/** What `GET /weights`, undo and reset answer, and what `get_weights` (#47) reuses. */
export interface WeightsService {
  summary(profileId: string): Promise<WeightsSummary>;
  /** Reverts the newest change not undone yet. Does nothing when there is none. */
  undo(profileId: string): Promise<WeightsSummary>;
  /** Clears the butler adjustment layer. Pending changes are marked undone, so undo cannot replay them. */
  reset(profileId: string): Promise<WeightsSummary>;
}

export const createWeightsService = (store: WeightStore): WeightsService => {
  const summary = async (profileId: string) => {
    const [{ learned, adjustment }, changes] = await Promise.all([
      store.getLayers(profileId),
      store.listChanges(profileId),
    ]);
    return toSummary(effectiveWeights(learned, adjustment), changes[0] ?? null);
  };

  return {
    summary,
    async undo(profileId) {
      const [{ adjustment }, changes] = await Promise.all([
        store.getLayers(profileId),
        store.listChanges(profileId),
      ]);
      const last = changes.find((change) => !change.undone);
      if (last) await store.undoChange(profileId, last, applyDeltas(adjustment, last.changes, -1));
      return summary(profileId);
    },
    async reset(profileId) {
      const pending = (await store.listChanges(profileId)).filter((change) => !change.undone);
      await store.resetAdjustment(profileId, pending);
      return summary(profileId);
    },
  };
};

import { UpdateWeightsInput, type UpdateWeightsOutput } from "@firedrift/domain";
import { getProfileRuntime } from "../../shared/runtime";
import { createToolHandler, toolError } from "../../shared/tool";
import type { ConfigStore } from "../../taste/configStore";
import type { WeightStore } from "../../weights/weightStore";
import { createWeightsService } from "../../weights/weightsService";

/** `update_weights` → `{ change, clamped }`. Limits live in `weights/limits.ts`. */
export const createUpdateWeightsTool = (
  deps: () => { weights: WeightStore; config: ConfigStore },
  now?: () => number,
) =>
  createToolHandler<UpdateWeightsInput, UpdateWeightsOutput>(
    UpdateWeightsInput,
    async ({ profileId, changes, reason }) => {
      const { weights, config } = deps();
      const result = await createWeightsService(weights, { config, now }).update(profileId, changes, reason);
      return result ?? toolError("invalid_change", "Nothing left to change after the limits.");
    },
  );

export const handler = createUpdateWeightsTool(getProfileRuntime);

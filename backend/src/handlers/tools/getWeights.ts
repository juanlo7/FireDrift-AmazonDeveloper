import { GetWeightsInput, type GetWeightsOutput } from "@firedrift/domain";
import { getProfileRuntime } from "../../shared/runtime";
import { createToolHandler } from "../../shared/tool";
import type { ConfigStore } from "../../taste/configStore";
import type { WeightStore } from "../../weights/weightStore";
import { createWeightsService } from "../../weights/weightsService";

/** `get_weights` → `WeightsSummary`: the compact view of the taste the agent gets. */
export const createGetWeightsTool = (deps: () => { weights: WeightStore; config: ConfigStore }) =>
  createToolHandler<GetWeightsInput, GetWeightsOutput>(GetWeightsInput, async ({ profileId }) => {
    const { weights, config } = deps();
    return createWeightsService(weights, { config }).summary(profileId);
  });

export const handler = createGetWeightsTool(getProfileRuntime);

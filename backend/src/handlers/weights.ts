import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { fromError, json, type HttpResult } from "../shared/http";
import { requireProfileId } from "../shared/request";
import { getProfileRuntime } from "../shared/runtime";
import type { ConfigStore } from "../taste/configStore";
import type { WeightStore } from "../weights/weightStore";
import { createWeightsService, type WeightsService } from "../weights/weightsService";

type WeightsAction = keyof WeightsService;

/** `GET /weights`, `POST /weights/undo` and `POST /weights/reset` → `WeightsSummary`. */
export const createWeightsHandler =
  (action: WeightsAction, deps: () => { weights: WeightStore; config?: ConfigStore }) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const profileId = requireProfileId(event);
    if (!profileId.ok) return profileId.response;
    try {
      const { weights, config } = deps();
      const service = createWeightsService(weights, { config });
      return json(200, await service[action](profileId.value));
    } catch (cause) {
      return fromError(cause);
    }
  };

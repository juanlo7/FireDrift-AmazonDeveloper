import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { SignalsBody } from "@firedrift/domain";
import type { SignalStore } from "../signals/signalStore";
import { fromError, json, type HttpResult } from "../shared/http";
import { parseJsonBody, requireProfileId } from "../shared/request";
import { getProfileRuntime } from "../shared/runtime";

/** `POST /profiles/{profileId}/signals` with up to 50 signals → `{ accepted, duplicates }`. */
export const createPostSignalsHandler =
  (deps: () => { signals: SignalStore }) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const profileId = requireProfileId(event);
    if (!profileId.ok) return profileId.response;
    const body = parseJsonBody(event, SignalsBody);
    if (!body.ok) return body.response;
    try {
      return json(200, await deps().signals.putNew(profileId.value, body.value.signals));
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createPostSignalsHandler(getProfileRuntime);

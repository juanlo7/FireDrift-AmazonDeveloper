import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ProfilePutBody } from "@firedrift/domain";
import type { ProfileRepository } from "../profile/profileStore";
import { fromError, type HttpResult } from "../shared/http";
import { parseJsonBody, requireProfileId } from "../shared/request";
import { getProfileRuntime } from "../shared/runtime";

/** `PUT /profiles/{profileId}` with `{ country, services, showEverything }` → `204`. */
export const createPutProfileHandler =
  (deps: () => { profiles: ProfileRepository }) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const profileId = requireProfileId(event);
    if (!profileId.ok) return profileId.response;
    const body = parseJsonBody(event, ProfilePutBody);
    if (!body.ok) return body.response;
    try {
      await deps().profiles.put(profileId.value, body.value);
      return { statusCode: 204 };
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createPutProfileHandler(getProfileRuntime);

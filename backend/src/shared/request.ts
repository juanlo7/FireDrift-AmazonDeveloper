import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { error, type HttpResult } from "./http";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: HttpResult };

/** The part of a zod schema from `@firedrift/domain` that the routes use. */
interface Schema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `{profileId}` path parameter; profiles are anonymous device UUIDs. */
export const requireProfileId = (event: APIGatewayProxyEventV2): Parsed<string> => {
  const profileId = event.pathParameters?.profileId ?? "";
  return UUID_PATTERN.test(profileId)
    ? { ok: true, value: profileId.toLowerCase() }
    : { ok: false, response: error(400, "invalid_profile_id", "profileId must be a UUID.") };
};

/** Parses and validates a JSON body. API Gateway may send it base64-encoded. */
export const parseJsonBody = <T>(event: APIGatewayProxyEventV2, schema: Schema<T>): Parsed<T> => {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: error(400, "invalid_json", "Body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const message = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "body"}: ${issue.message}`)
    .join("; ");
  return { ok: false, response: error(400, "invalid_body", message) };
};

import type { HealthResponse } from "@firedrift/domain";
import { json, type HttpResult } from "../shared/http";

/** `GET /health` → `{ ok: true }`. */
export const handler = async (): Promise<HttpResult> => json(200, { ok: true } satisfies HealthResponse);

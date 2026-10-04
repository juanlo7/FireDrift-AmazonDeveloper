import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ApiError } from "@firedrift/domain";
import { TmdbError } from "../catalog/tmdbClient";

export type HttpResult = APIGatewayProxyStructuredResultV2;

export const json = (statusCode: number, body: unknown, cacheSeconds = 0): HttpResult => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    ...(cacheSeconds > 0 ? { "Cache-Control": `public, max-age=${cacheSeconds}` } : {}),
  },
  body: JSON.stringify(body),
});

/** Error body of `docs/contracts.md`, section 2. */
export const error = (statusCode: number, code: string, message: string): HttpResult =>
  json(statusCode, { error: { code, message } } satisfies ApiError);

/** Maps a thrown error to the contract error shape. Never leaks TMDB details or secrets. */
export const fromError = (cause: unknown): HttpResult => {
  if (cause instanceof TmdbError) {
    if (cause.status === 404) return error(404, "not_found", "Title not found.");
    if (cause.status === 429) return error(503, "upstream_busy", "Catalog is busy, try again.");
    return error(502, "upstream_error", "Catalog is unavailable.");
  }
  console.error("Unhandled error", cause);
  return error(500, "internal_error", "Something went wrong.");
};

export const COUNTRY_PATTERN = /^[A-Z]{2}$/;

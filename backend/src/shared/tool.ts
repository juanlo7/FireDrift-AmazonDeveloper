import type { ApiError } from "@firedrift/domain";
import { TmdbError } from "../catalog/tmdbClient";

/**
 * Agent tools run as Lambdas behind AgentCore Gateway (#48): the event is the
 * tool's input object. `profileId` is in it, but the agent sets it from the
 * session; the model never sees or chooses it.
 */
export type ToolResult<T> = T | ApiError;

/** The part of a zod schema from `@firedrift/domain` that the tools use. */
interface Schema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

export const toolError = (code: string, message: string): ApiError => ({ error: { code, message } });

const parseEvent = (event: unknown): unknown => {
  if (typeof event !== "string") return event;
  try {
    return JSON.parse(event);
  } catch {
    return undefined;
  }
};

/**
 * Wraps a tool: validates the input against its contract schema and turns any
 * failure into `{ error: { code, message } }`. A tool never throws, so the agent
 * can always fall back (FR-5).
 */
export const createToolHandler =
  <I, O>(schema: Schema<I>, run: (input: I) => Promise<ToolResult<O>>) =>
  async (event: unknown): Promise<ToolResult<O>> => {
    const parsed = schema.safeParse(parseEvent(event));
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.map(String).join(".") || "input"}: ${issue.message}`)
        .join("; ");
      return toolError("invalid_input", message);
    }
    try {
      return await run(parsed.data);
    } catch (cause) {
      if (cause instanceof TmdbError) return toolError("upstream_error", "Catalog is unavailable.");
      console.error("Tool failed", cause);
      return toolError("internal_error", "Something went wrong.");
    }
  };

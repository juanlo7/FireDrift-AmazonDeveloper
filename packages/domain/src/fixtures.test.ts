import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import * as domain from "./index";

const FIXTURES_DIR = join(__dirname, "..", "fixtures");

/** Every fixture file and the schema it must satisfy. */
const registry: Record<string, ZodType> = {
  "rest/health.response.json": domain.HealthResponse,
  "rest/providers.response.json": domain.ProvidersResponse,
  "rest/profile-put.body.json": domain.ProfilePutBody,
  "rest/pool.response.json": domain.PoolResponse,
  "rest/signals.body.json": domain.SignalsBody,
  "rest/signals.response.json": domain.SignalsResponse,
  "rest/title.response.json": domain.TitleResponse,
  "rest/title-no-trailer.response.json": domain.TitleResponse,
  "rest/weights.response.json": domain.WeightsResponse,
  "rest/error.response.json": domain.ApiError,

  "socket/app-to-agent/session-start.json": domain.SessionStartEvent,
  "socket/app-to-agent/audio-start.json": domain.AudioStartEvent,
  "socket/app-to-agent/audio-end.json": domain.AudioEndEvent,
  "socket/app-to-agent/chip-select.json": domain.ChipSelectEvent,
  "socket/app-to-agent/suggestion-feedback.json": domain.SuggestionFeedbackEvent,
  "socket/app-to-agent/session-end.json": domain.SessionEndEvent,

  "socket/agent-to-app/transcript.json": domain.TranscriptEvent,
  "socket/agent-to-app/thinking.json": domain.ThinkingEvent,
  "socket/agent-to-app/answer-delta.json": domain.AnswerDeltaEvent,
  "socket/agent-to-app/speech.json": domain.SpeechEvent,
  "socket/agent-to-app/suggestion.json": domain.SuggestionEvent,
  "socket/agent-to-app/chips.json": domain.ChipsEvent,
  "socket/agent-to-app/weights-changed.json": domain.WeightsChangedEvent,
  "socket/agent-to-app/answer-done.json": domain.AnswerDoneEvent,
  "socket/agent-to-app/fallback.json": domain.FallbackEvent,

  "tools/get-weights.input.json": domain.GetWeightsInput,
  "tools/get-weights.output.json": domain.GetWeightsOutput,
  "tools/update-weights.input.json": domain.UpdateWeightsInput,
  "tools/update-weights.output.json": domain.UpdateWeightsOutput,
  "tools/resolve-titles.input.json": domain.ResolveTitlesInput,
  "tools/resolve-titles.output.json": domain.ResolveTitlesOutput,
  "tools/similar.input.json": domain.SimilarInput,
  "tools/similar.output.json": domain.SimilarOutput,
  "tools/ranked-picks.input.json": domain.RankedPicksInput,
  "tools/ranked-picks.output.json": domain.RankedPicksOutput,

  "pipeline/brain-input-text.json": domain.BrainInput,
  "pipeline/brain-input-chip.json": domain.BrainInput,
  "pipeline/brain-answer-delta.json": domain.BrainEvent,
  "pipeline/cued-sentence.json": domain.CuedSentence,
};

function listFixtures(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFixtures(path) : [relative(FIXTURES_DIR, path)];
  });
}

function readFixture(path: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, path), "utf8"));
}

describe("fixtures", () => {
  const files = listFixtures(FIXTURES_DIR).sort();

  it("are all registered with a schema", () => {
    expect(files).toEqual(Object.keys(registry).sort());
  });

  it.each(Object.entries(registry))("%s matches its schema", (path, schema) => {
    const result = schema.safeParse(readFixture(path));
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each(files.filter((path) => path.startsWith("socket/app-to-agent/")))(
    "%s is an app-to-agent event",
    (path) => {
      expect(domain.AppToAgentEvent.safeParse(readFixture(path)).success).toBe(true);
    },
  );

  it.each(files.filter((path) => path.startsWith("socket/agent-to-app/")))(
    "%s is an agent-to-app event",
    (path) => {
      expect(domain.AgentToAppEvent.safeParse(readFixture(path)).success).toBe(true);
    },
  );
});

describe("contract limits", () => {
  const dark = readFixture("rest/title.response.json");

  it("rejects an unknown title type", () => {
    expect(domain.TitleCard.safeParse({ ...(dark as object), type: "film" }).success).toBe(false);
  });

  it("requires ratio only for trailer_progress", () => {
    const signal = {
      signalId: "6b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      tmdbId: 70523,
      type: "series",
      source: "feed",
      at: "2026-10-03T18:40:01Z",
    };
    expect(domain.Signal.safeParse({ ...signal, kind: "trailer_progress" }).success).toBe(false);
    expect(domain.Signal.safeParse({ ...signal, kind: "like", ratio: 0.5 }).success).toBe(false);
  });

  it("caps a signal batch at 50", () => {
    const { signals } = readFixture("rest/signals.body.json") as { signals: unknown[] };
    const batch = Array.from({ length: domain.MAX_SIGNALS_PER_BATCH + 1 }, () => signals[0]);
    expect(domain.SignalsBody.safeParse({ signals: batch }).success).toBe(false);
  });

  it("caps resolve_titles at 5 proposals", () => {
    const proposal = { title: "Dark", year: 2017, type: "series" };
    const proposals = Array.from({ length: domain.MAX_PROPOSALS_PER_CALL + 1 }, () => proposal);
    const input = { profileId: "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90", proposals };
    expect(domain.ResolveTitlesInput.safeParse(input).success).toBe(false);
  });

  it("rejects an unknown gesture", () => {
    const cue = { gesture: "wink", charOffset: 0 };
    expect(domain.CuedSentence.safeParse({ text: "Hello.", cues: [cue] }).success).toBe(false);
  });
});

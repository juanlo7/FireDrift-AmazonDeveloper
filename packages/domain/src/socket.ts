import { z } from "zod";
import { Chip, Country, Gesture, TitleCard, TitleType, WeightChange } from "./common";

// Butler socket (contracts.md, section 3). Text frames are JSON `{ t, ...fields }`;
// microphone audio and, optionally, speech audio travel in binary frames.

// App -> agent

export const SessionStartEvent = z.object({
  t: z.literal("session.start"),
  profileId: z.uuid(),
  country: Country,
  services: z.array(z.number().int()),
  hasMic: z.boolean(),
});

export const AudioStartEvent = z.object({
  t: z.literal("audio.start"),
  format: z.literal("pcm16"),
  sampleRate: z.literal(16000),
});

export const AudioEndEvent = z.object({ t: z.literal("audio.end") });

export const ChipSelectEvent = z.object({
  t: z.literal("chip.select"),
  chipId: z.string().min(1),
});

export const SuggestionFeedbackEvent = z.object({
  t: z.literal("suggestion.feedback"),
  tmdbId: z.number().int().positive(),
  type: TitleType,
  kind: z.enum(["like", "skip", "watch_now"]),
});

export const SessionEndEvent = z.object({ t: z.literal("session.end") });

export const AppToAgentEvent = z.discriminatedUnion("t", [
  SessionStartEvent,
  AudioStartEvent,
  AudioEndEvent,
  ChipSelectEvent,
  SuggestionFeedbackEvent,
  SessionEndEvent,
]);
export type AppToAgentEvent = z.infer<typeof AppToAgentEvent>;

// Agent -> app

export const TranscriptEvent = z.object({
  t: z.literal("transcript"),
  text: z.string(),
  final: z.boolean(),
});

export const ThinkingEvent = z.object({ t: z.literal("thinking") });

/** Answer text as shown on screen: gesture markers are already stripped. */
export const AnswerDeltaEvent = z.object({
  t: z.literal("answer.delta"),
  text: z.string(),
});

/** Polly speech mark (word, sentence or viseme). */
export const SpeechMark = z.object({
  timeMs: z.number().int().nonnegative(),
  type: z.enum(["word", "sentence", "viseme"]),
  value: z.string(),
});
export type SpeechMark = z.infer<typeof SpeechMark>;

export const GestureCue = z.object({
  name: Gesture,
  timeMs: z.number().int().nonnegative(),
});
export type GestureCue = z.infer<typeof GestureCue>;

/** One per sentence. Audio is either at `audioUrl` or in the binary frames that follow. */
export const SpeechEvent = z.object({
  t: z.literal("speech"),
  audioUrl: z.url().optional(),
  format: z.literal("mp3"),
  marks: z.array(SpeechMark),
  gestures: z.array(GestureCue).max(1),
});

export const SuggestionEvent = z.object({
  t: z.literal("suggestion"),
  title: TitleCard,
  reason: z.string(),
});

export const ChipsEvent = z.object({
  t: z.literal("chips"),
  chips: z.array(Chip),
});

export const WeightsChangedEvent = z.object({
  t: z.literal("weights.changed"),
  change: WeightChange,
});

export const AnswerDoneEvent = z.object({ t: z.literal("answer.done") });

export const FallbackReason = z.enum(["cap", "disabled", "error"]);
export type FallbackReason = z.infer<typeof FallbackReason>;

export const FallbackEvent = z.object({
  t: z.literal("fallback"),
  reason: FallbackReason,
  message: z.string(),
  chips: z.array(Chip),
});

export const AgentToAppEvent = z.discriminatedUnion("t", [
  TranscriptEvent,
  ThinkingEvent,
  AnswerDeltaEvent,
  SpeechEvent,
  SuggestionEvent,
  ChipsEvent,
  WeightsChangedEvent,
  AnswerDoneEvent,
  FallbackEvent,
]);
export type AgentToAppEvent = z.infer<typeof AgentToAppEvent>;

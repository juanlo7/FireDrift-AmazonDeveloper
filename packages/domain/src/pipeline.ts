import { z } from "zod";
import { Gesture } from "./common";
import {
  AnswerDoneEvent,
  ChipsEvent,
  FallbackEvent,
  SuggestionEvent,
  WeightsChangedEvent,
} from "./socket";

// Agent pipeline inside the agent server (contracts.md, section 7):
// voice (P1) -> brain (P2) -> gesture parser (P3) -> voice (P1) -> app.

/** What the brain receives for one turn: a final transcript or a chip. */
export const BrainInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
  z.object({ kind: z.literal("chip"), chipId: z.string().min(1) }),
]);
export type BrainInput = z.infer<typeof BrainInput>;

/**
 * Raw answer text from the brain. Unlike the socket `answer.delta`, it still
 * holds the `{{gesture}}` markers; the gesture parser strips them.
 */
export const BrainAnswerDelta = z.object({
  t: z.literal("answer.delta"),
  text: z.string(),
});

/** What the brain streams back for one turn. No audio, no transcript. */
export const BrainEvent = z.discriminatedUnion("t", [
  BrainAnswerDelta,
  SuggestionEvent,
  ChipsEvent,
  WeightsChangedEvent,
  AnswerDoneEvent,
  FallbackEvent,
]);
export type BrainEvent = z.infer<typeof BrainEvent>;

/** A gesture cue placed before the character at `charOffset` of the clean sentence text. */
export const SentenceCue = z.object({
  gesture: Gesture,
  charOffset: z.number().int().nonnegative(),
});
export type SentenceCue = z.infer<typeof SentenceCue>;

/**
 * One sentence after the gesture parser: clean text to show and to speak, and
 * at most one cue. The voice side maps `charOffset` to the next Polly word
 * mark to get the cue's `timeMs` for `speech.gestures`.
 */
export const CuedSentence = z
  .object({
    text: z.string().min(1),
    cues: z.array(SentenceCue).max(1),
  })
  .refine((sentence) => sentence.cues.every((cue) => cue.charOffset < sentence.text.length), {
    message: "cue charOffset must point inside the sentence text",
    path: ["cues"],
  });
export type CuedSentence = z.infer<typeof CuedSentence>;

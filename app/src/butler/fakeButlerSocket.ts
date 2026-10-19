import type { AgentToAppEvent, FallbackReason } from '@firedrift/domain';
import type { OpenButlerSession } from './butlerSocket';

// The agent → app fixtures of `packages/domain/fixtures/socket/`.
const fixture = {
  transcript: require('@firedrift/domain/fixtures/socket/agent-to-app/transcript.json'),
  thinking: require('@firedrift/domain/fixtures/socket/agent-to-app/thinking.json'),
  answerDelta: require('@firedrift/domain/fixtures/socket/agent-to-app/answer-delta.json'),
  speech: require('@firedrift/domain/fixtures/socket/agent-to-app/speech.json'),
  suggestion: require('@firedrift/domain/fixtures/socket/agent-to-app/suggestion.json'),
  chips: require('@firedrift/domain/fixtures/socket/agent-to-app/chips.json'),
  weightsChanged: require('@firedrift/domain/fixtures/socket/agent-to-app/weights-changed.json'),
  answerDone: require('@firedrift/domain/fixtures/socket/agent-to-app/answer-done.json'),
  fallback: require('@firedrift/domain/fixtures/socket/agent-to-app/fallback.json'),
} as Record<string, AgentToAppEvent>;

/** Chips that change the taste, so the fake also sends `weights.changed`. */
const WEIGHT_CHIPS = new Set(['shorter', 'different_genre']);

export interface FakeButlerOptions {
  /** Time between two agent events, so the screen shows each state. */
  stepMs?: number;
  /** Answer every turn with this `fallback` instead, to try the fallback state. */
  fallback?: FallbackReason;
}

/**
 * A butler socket with no network: each turn (`audio.end` after some audio, or `chip.select`)
 * replays the fixtures in the order the agent sends them. The butler screen
 * works with it before the agent is reachable.
 */
export const createFakeButlerSocket =
  ({ stepMs = 400, fallback }: FakeButlerOptions = {}): OpenButlerSession =>
  (_info, handlers) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let over = false;
    let heardBytes = 0;

    const play = (events: AgentToAppEvent[]) =>
      events.forEach((event, i) =>
        timers.push(
          setTimeout(() => {
            if (!over) handlers.onEvent(event);
          }, stepMs * (i + 1)),
        ),
      );

    const turn = (heard: boolean, chipId?: string) => {
      if (fallback) {
        play([{ ...fixture.fallback, reason: fallback } as AgentToAppEvent]);
        return;
      }
      play([
        ...(heard ? [fixture.transcript] : []),
        fixture.thinking,
        fixture.answerDelta,
        fixture.speech,
        fixture.suggestion,
        ...(chipId && WEIGHT_CHIPS.has(chipId) ? [fixture.weightsChanged] : []),
        fixture.chips,
        fixture.answerDone,
      ]);
    };

    return {
      send: event => {
        if (over) return;
        if (event.t === 'audio.start') heardBytes = 0;
        // A turn by voice needs audio: an empty press is ignored, as the real agent does.
        if (event.t === 'audio.end' && heardBytes > 0) turn(true);
        if (event.t === 'chip.select') turn(false, event.chipId);
      },
      sendAudio: pcm => {
        heardBytes += pcm.byteLength;
      },
      end: () => {
        over = true;
        timers.forEach(clearTimeout);
      },
    };
  };

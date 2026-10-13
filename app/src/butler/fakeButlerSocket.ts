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
 * A butler socket with no network: each turn (`audio.end` or `chip.select`)
 * replays the fixtures in the order the agent sends them. The butler screen
 * works with it before the agent is reachable.
 */
export const createFakeButlerSocket =
  ({ stepMs = 400, fallback }: FakeButlerOptions = {}): OpenButlerSession =>
  (_info, handlers) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let over = false;

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
        if (event.t === 'audio.end') turn(true);
        if (event.t === 'chip.select') turn(false, event.chipId);
      },
      sendAudio: () => undefined,
      end: () => {
        over = true;
        timers.forEach(clearTimeout);
      },
    };
  };

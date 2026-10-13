import type { AgentToAppEvent } from '@firedrift/domain';

type SpeechEvent = Extract<AgentToAppEvent, { t: 'speech' }>;
type Gesture = SpeechEvent['gestures'][number]['name'];

/** Polly word marks have no end time; the last word is said within this long. */
export const LAST_WORD_MS = 450;

export interface SpeechMoment {
  /** Words are being said: show the `speaking` loop (contracts.md, section 4). */
  talking: boolean;
  /** Gestures whose time has come since the last call. Each one plays once. */
  gestures: Gesture[];
}

/**
 * Follows one `speech` event while its audio plays. The butler screen calls
 * `at(positionMs)` with the audio position, for example on each progress tick,
 * and plays the returned gestures in the one clip player.
 */
export const createSpeechSync = (speech: Pick<SpeechEvent, 'marks' | 'gestures'>) => {
  const words = speech.marks.filter(mark => mark.type === 'word').map(mark => mark.timeMs);
  const start = words.length ? Math.min(...words) : 0;
  const end = words.length ? Math.max(...words) + LAST_WORD_MS : 0;
  const pending = [...speech.gestures].sort((a, b) => a.timeMs - b.timeMs);

  const at = (positionMs: number): SpeechMoment => {
    const gestures: Gesture[] = [];
    while (pending.length && pending[0].timeMs <= positionMs) gestures.push(pending.shift()!.name);
    return { talking: positionMs >= start && positionMs < end, gestures };
  };

  return { at };
};

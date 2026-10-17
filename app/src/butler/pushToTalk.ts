import type { ButlerAppEvent } from './butlerSocket';

/** An open microphone: PCM 16 kHz, mono, 16 bit (contracts.md, section 3). */
export interface MicStream {
  read(): Promise<ArrayBuffer>;
  close(): Promise<void>;
}

/** Resolves `null` when there is no microphone or no permission. Never throws. */
export type OpenMic = () => Promise<MicStream | null>;

export interface PushToTalkDeps {
  openMic: OpenMic;
  /** The current session, or `null` when the butler is in fallback or not open yet. */
  getSession(): { send(event: ButlerAppEvent): void; sendAudio(pcm: ArrayBuffer): void } | null;
  /** The talk button is held (`true`) or let go (`false`). Called before the mic opens. */
  onListening(listening: boolean): void;
  /** The audio was sent (`audio.end`): the agent now works on the turn. */
  onSent?(): void;
  /** If a remote sends no key-up, a held key counts as released after this long without a repeat. */
  releaseMs?: number;
}

export const RELEASE_MS = 700;

export interface PressOptions {
  /** Stop on silence of key repeats. Off for a press that reports its own release. */
  autoRelease?: boolean;
}

/**
 * Push to talk. `press()` shows `listening` at once, before the microphone or
 * the socket are touched, so the character reacts in well under 200 ms. Then
 * the mic opens; frames go out after `audio.start`; `release()` ends the turn
 * with `audio.end`. With no mic, no session, or a failed read, it drops back to
 * the previous state and sends nothing: chips still work.
 */
export const createPushToTalk = ({ openMic, getSession, onListening, onSent, releaseMs = RELEASE_MS }: PushToTalkDeps) => {
  let holding = false;
  let turn = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const capture = async (mine: number) => {
    const active = () => holding && turn === mine;
    const mic = await openMic().catch(() => null);
    if (!mic) {
      if (active()) release();
      return;
    }
    let started = false;
    const session = getSession();
    try {
      while (active() && session) {
        const chunk = await mic.read();
        if (!chunk.byteLength) continue;
        if (!started) {
          started = true;
          session.send({ t: 'audio.start', format: 'pcm16', sampleRate: 16000 });
        }
        session.sendAudio(chunk);
      }
    } catch (cause) {
      console.warn('[butler] microphone read failed', cause);
    }
    await mic.close().catch(() => undefined);
    if (active()) release();
    if (started && session) {
      session.send({ t: 'audio.end' });
      onSent?.();
    }
  };

  const release = () => {
    clearTimer();
    if (!holding) return;
    holding = false;
    onListening(false);
  };

  const press = ({ autoRelease = true }: PressOptions = {}) => {
    if (autoRelease) {
      clearTimer();
      timer = setTimeout(release, releaseMs);
    }
    if (holding) return;
    if (!getSession()) return;
    holding = true;
    turn += 1;
    onListening(true);
    capture(turn);
  };

  return { press, release, isHolding: () => holding };
};

import type { AgentToAppEvent } from '@firedrift/domain';
import { createSpeechSync } from './speechSync';

type SpeechEvent = Extract<AgentToAppEvent, { t: 'speech' }>;
type Gesture = SpeechEvent['gestures'][number]['name'];

/** The part of the W3C media `AudioPlayer` the speech player uses, so tests can pass a fake. */
export interface AudioLike {
  src: string;
  autoplay: boolean;
  readonly currentTime: number;
  initialize(): Promise<void>;
  deinitialize(): Promise<void>;
  load(): void;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
}

/**
 * After the last queued sentence, talking stops only when no new sentence comes within
 * this long: the agent sends the next sentence while Polly reads the one before.
 */
export const SPEECH_GAP_MS = 700;

export interface SpeechPlayerHandlers {
  /** An answer is being said, from its first word to its last sentence: the character shows `speaking`. */
  onTalking(talking: boolean): void;
  onGesture?(gesture: Gesture): void;
  /** Every queued sentence has played (or failed). */
  onIdle?(): void;
}

const createW3cAudio = (): AudioLike => {
  // Loaded on first use: the native module exists only on Vega.
  const { AudioPlayer, AudioContentType, AudioUsageType } = require('@amazon-devices/react-native-w3cmedia');
  return new AudioPlayer(AudioContentType.CONTENT_TYPE_SPEECH, AudioUsageType.USAGE_MEDIA) as AudioLike;
};

/**
 * Plays the butler's `speech` events in order with one audio player. A sentence
 * without audio or whose audio fails is skipped: its text is already on screen
 * (FR-5, "if only Polly fails, the answer is shown as text").
 */
export const createSpeechPlayer = (
  handlers: SpeechPlayerHandlers,
  createAudio: () => AudioLike = createW3cAudio,
) => {
  const queue: SpeechEvent[] = [];
  let audio: AudioLike | null = null;
  let ready: Promise<AudioLike | null> | null = null;
  let current: ReturnType<typeof createSpeechSync> | null = null;
  let talking = false;
  let disposed = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;

  const setTalking = (value: boolean) => {
    if (quiet) clearTimeout(quiet);
    quiet = undefined;
    if (value === talking) return;
    talking = value;
    handlers.onTalking(value);
  };

  /** Each clip change shows on screen, so the pauses between sentences keep `speaking`. */
  const stopTalkingSoon = () => {
    if (!talking || quiet) return;
    quiet = setTimeout(() => setTalking(false), SPEECH_GAP_MS);
  };

  const finish = () => {
    current = null;
    playNext();
  };

  const player = (): Promise<AudioLike | null> =>
    (ready ??= (async () => {
      try {
        const created = createAudio();
        await created.initialize();
        created.autoplay = false;
        created.addEventListener('timeupdate', () => {
          if (!current) return;
          const moment = current.at(created.currentTime * 1000);
          if (moment.talking) setTalking(true);
          moment.gestures.forEach(gesture => handlers.onGesture?.(gesture));
        });
        created.addEventListener('ended', finish);
        created.addEventListener('error', () => {
          console.warn('[butler] speech audio failed; the text stays on screen');
          finish();
        });
        audio = created;
        return created;
      } catch (cause) {
        console.warn('[butler] no audio player; answers are text only', cause);
        return null;
      }
    })());

  const playNext = () => {
    if (disposed || current) return;
    const next = queue.shift();
    if (!next) {
      stopTalkingSoon();
      handlers.onIdle?.();
      return;
    }
    if (!next.audioUrl) {
      playNext();
      return;
    }
    current = createSpeechSync(next);
    const url = next.audioUrl;
    player().then(audioPlayer => {
      if (!audioPlayer || disposed) {
        current = null;
        queue.length = 0;
        if (!disposed) handlers.onIdle?.();
        return;
      }
      audioPlayer.src = url;
      audioPlayer.load();
      audioPlayer.play().catch(finish);
    });
  };

  // Starting the native player takes a couple of seconds: do it before the first answer.
  player();

  return {
    enqueue: (speech: SpeechEvent) => {
      // The answer goes on: keep `speaking` while this sentence loads.
      if (quiet) clearTimeout(quiet);
      quiet = undefined;
      queue.push(speech);
      playNext();
    },
    /** Drops what is queued and stops the sentence playing (a new turn or leaving the screen). */
    stop: () => {
      queue.length = 0;
      if (current) {
        current = null;
        audio?.pause();
      }
      setTalking(false);
    },
    dispose: () => {
      disposed = true;
      if (quiet) clearTimeout(quiet);
      queue.length = 0;
      current = null;
      audio?.pause();
      audio?.deinitialize().catch(() => undefined);
    },
  };
};

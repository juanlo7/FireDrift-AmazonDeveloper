import type { Signal } from '@firedrift/domain';
import { ApiRequestError, type ApiClient } from '../api/client';
import type { KeyValueStore } from '../storage';
import { createSignal, type SignalInput, type SignalQueue } from './queue';

const PENDING_KEY = 'firedrift.pendingSignals';

/** FR-2 batch rules. */
export const BATCH_SIZE = 5;
// MAX_SIGNALS_PER_BATCH of packages/domain; importing it would pull zod into the app bundle.
export const MAX_SIGNALS_PER_REQUEST = 50;
export const FLUSH_INTERVAL_MS = 30_000;
export const MAX_RETRY_DELAY_MS = 5 * 60_000;
/** Oldest signals are dropped past this, so a long offline stretch cannot grow without limit. */
export const MAX_PENDING = 500;

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void } | undefined;
}

export interface BatchQueueOptions {
  api: Pick<ApiClient, 'postSignals'>;
  store: KeyValueStore;
  getProfileId: () => Promise<string>;
  clock?: Clock;
  appState?: AppStateSource;
}

export interface BatchQueue extends SignalQueue {
  /** Sends what is pending now. Resolves when the attempt ends. */
  flush(): Promise<void>;
  /** Loads signals left from an earlier run and schedules their delivery. */
  start(): Promise<void>;
  pending(): Signal[];
  stop(): void;
}

const defaultClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Signals are kept on the device and sent in batches (FR-2): when 5 are
 * waiting, 30 s after the last send, or when the app goes to the background.
 * A failed send keeps them and retries with backoff, also after a restart.
 */
export const createBatchQueue = ({
  api,
  store,
  getProfileId,
  clock = defaultClock,
  appState,
}: BatchQueueOptions): BatchQueue => {
  let pending: Signal[] = [];
  let sending: Promise<void> | null = null;
  let timer: unknown = null;
  let retryDelay = FLUSH_INTERVAL_MS;
  let saving = Promise.resolve();
  const subscription = appState?.addEventListener('change', state => {
    if (state === 'background') flushInBackground();
  });

  const save = () => {
    const snapshot = JSON.stringify(pending);
    saving = saving.then(() => store.set(PENDING_KEY, snapshot)).catch(cause => {
      console.warn('[signals] could not save the queue', cause);
    });
    return saving;
  };

  const schedule = (ms: number) => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = pending.length > 0 ? clock.setTimeout(flushInBackground, ms) : null;
  };

  const send = async (): Promise<void> => {
    const profileId = await getProfileId();
    while (pending.length > 0) {
      const batch = pending.slice(0, MAX_SIGNALS_PER_REQUEST);
      try {
        await api.postSignals(profileId, { signals: batch });
      } catch (cause) {
        // A batch the contract rejects would block the queue forever: drop it.
        if (cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 429) {
          console.warn(`[signals] dropping ${batch.length} rejected signals: ${cause.code}`);
        } else {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
          schedule(retryDelay);
          return;
        }
      }
      const sent = new Set(batch.map(s => s.signalId));
      pending = pending.filter(s => !sent.has(s.signalId));
      await save();
    }
    retryDelay = FLUSH_INTERVAL_MS;
    schedule(FLUSH_INTERVAL_MS);
  };

  const flush = (): Promise<void> => {
    if (sending) return sending;
    if (pending.length === 0) return Promise.resolve();
    sending = send().finally(() => {
      sending = null;
    });
    return sending;
  };

  function flushInBackground() {
    flush().catch(cause => console.warn('[signals] send failed', cause));
  }

  return {
    enqueue(input: SignalInput): Signal {
      const signal = createSignal(input);
      pending = [...pending, signal].slice(-MAX_PENDING);
      save();
      if (pending.length >= BATCH_SIZE) flushInBackground();
      else if (timer === null) schedule(FLUSH_INTERVAL_MS);
      return signal;
    },
    flush,
    async start() {
      try {
        const saved = JSON.parse((await store.get(PENDING_KEY)) ?? '[]') as Signal[];
        const known = new Set(pending.map(s => s.signalId));
        pending = [...saved.filter(s => !known.has(s.signalId)), ...pending].slice(-MAX_PENDING);
      } catch (cause) {
        console.warn('[signals] could not load the saved queue', cause);
      }
      if (pending.length > 0) flushInBackground();
    },
    pending: () => [...pending],
    stop() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      subscription?.remove();
    },
  };
};

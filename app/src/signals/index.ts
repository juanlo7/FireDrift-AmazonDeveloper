import type { Signal } from '@firedrift/domain';

/** What a screen knows when the user does something. `signalId` and `at` are added here. */
export type SignalInput = Omit<Signal, 'signalId' | 'at'>;

/**
 * Where screens send signals. The batch queue of FR-2 (#45, P2) implements
 * this: 5 items, 30 s, or app to background, then `POST /signals`.
 */
export interface SignalQueue {
  enqueue(input: SignalInput): Signal;
}

/** RFC 4122 version 4 UUID. Random enough for idempotency keys. */
export const uuidv4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

export const createSignal = (input: SignalInput): Signal =>
  ({ ...input, signalId: uuidv4(), at: new Date().toISOString() }) as Signal;

/**
 * Placeholder until #45: keeps signals in memory and logs them. Nothing is sent.
 * Replace the implementation, keep the `SignalQueue` interface.
 */
export const createMemorySignalQueue = (): SignalQueue & { pending: Signal[] } => {
  const pending: Signal[] = [];
  return {
    pending,
    enqueue(input) {
      const signal = createSignal(input);
      pending.push(signal);
      console.info(`[signals] queued ${signal.kind} ${signal.type}/${signal.tmdbId}`);
      return signal;
    },
  };
};

export const signalQueue: SignalQueue = createMemorySignalQueue();

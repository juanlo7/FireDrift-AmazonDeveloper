import type { Signal } from '@firedrift/domain';
import { uuidv4 } from './ids';

/** What a screen knows when the user does something. `signalId` and `at` are added here. */
export type SignalInput = Omit<Signal, 'signalId' | 'at'>;

/** Where screens send signals. `createBatchQueue` is the app's implementation (FR-2). */
export interface SignalQueue {
  enqueue(input: SignalInput): Signal;
}

export const createSignal = (input: SignalInput): Signal =>
  ({ ...input, signalId: uuidv4(), at: new Date().toISOString() }) as Signal;

/** For tests: keeps signals in memory and sends nothing. */
export const createMemorySignalQueue = (): SignalQueue & { pending: Signal[] } => {
  const pending: Signal[] = [];
  return {
    pending,
    enqueue(input) {
      const signal = createSignal(input);
      pending.push(signal);
      return signal;
    },
  };
};

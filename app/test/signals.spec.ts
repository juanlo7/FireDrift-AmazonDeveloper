import { Signal, type TitleCard } from '@firedrift/domain';
import { ApiRequestError } from '../src/api/client';
import { createDeviceProfile } from '../src/profile';
import {
  BATCH_SIZE,
  createBatchQueue,
  createMemorySignalQueue,
  FLUSH_INTERVAL_MS,
  MAX_PENDING,
  trackCoverDwell,
  type Clock,
  type SignalInput,
} from '../src/signals';
import { createMemoryStore } from '../src/storage';

const PROFILE_ID = '3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90';
const like = (tmdbId: number): SignalInput => ({ tmdbId, type: 'movie', kind: 'like', source: 'feed' });

/** A clock whose timers run only when the test says so. */
const createFakeClock = () => {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const clock: Clock = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: id => {
      timers = timers.filter(t => t.id !== id);
    },
  };
  const advance = async (ms: number) => {
    now += ms;
    const due = timers.filter(t => t.at <= now);
    timers = timers.filter(t => t.at > now);
    due.forEach(t => t.fn());
    await settle();
  };
  return { clock, advance, nextDelay: () => Math.min(...timers.map(t => t.at - now)) };
};

const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 0));

const setup = (postSignals = jest.fn().mockResolvedValue({ accepted: 1, duplicates: 0 }), store = createMemoryStore()) => {
  const { clock, advance, nextDelay } = createFakeClock();
  let listener: ((state: string) => void) | undefined;
  const appState = {
    addEventListener: (_type: 'change', fn: (state: string) => void) => {
      listener = fn;
      return { remove: () => undefined };
    },
  };
  const queue = createBatchQueue({ api: { postSignals }, store, getProfileId: async () => PROFILE_ID, clock, appState });
  return { queue, postSignals, store, advance, nextDelay, background: () => listener?.('background') };
};

describe('batch signal queue (FR-2)', () => {
  it('sends nothing for 4 signals and one batch of 5 with the fifth', async () => {
    const { queue, postSignals } = setup();
    for (let i = 1; i < BATCH_SIZE; i++) queue.enqueue(like(i));
    await settle();
    expect(postSignals).not.toHaveBeenCalled();

    queue.enqueue(like(5));
    await settle();
    expect(postSignals).toHaveBeenCalledTimes(1);
    const [profileId, body] = postSignals.mock.calls[0];
    expect(profileId).toBe(PROFILE_ID);
    expect(body.signals).toHaveLength(5);
    expect(new Set(body.signals.map((s: { signalId: string }) => s.signalId)).size).toBe(5);
    body.signals.forEach((s: unknown) => expect(Signal.safeParse(s).success).toBe(true));
    expect(queue.pending()).toHaveLength(0);
  });

  it('sends what is waiting 30 s later', async () => {
    const { queue, postSignals, advance } = setup();
    queue.enqueue(like(1));
    queue.enqueue(like(2));
    await advance(FLUSH_INTERVAL_MS - 1);
    expect(postSignals).not.toHaveBeenCalled();
    await advance(1);
    expect(postSignals.mock.calls[0][1].signals).toHaveLength(2);
  });

  it('sends when the app goes to the background', async () => {
    const { queue, postSignals, background } = setup();
    queue.enqueue(like(1));
    background();
    await settle();
    expect(postSignals).toHaveBeenCalledTimes(1);
  });

  it('keeps signals when the backend is down, retries with backoff and sends them after a restart', async () => {
    const down = jest.fn().mockRejectedValue(new ApiRequestError('network', 'offline', 0));
    const { queue, store, advance, nextDelay } = setup(down);
    queue.enqueue(like(1));
    await queue.flush();
    expect(queue.pending()).toHaveLength(1);
    expect(nextDelay()).toBe(2 * FLUSH_INTERVAL_MS);
    await advance(2 * FLUSH_INTERVAL_MS);
    expect(down).toHaveBeenCalledTimes(2);
    expect(nextDelay()).toBe(4 * FLUSH_INTERVAL_MS);
    queue.stop();

    const up = jest.fn().mockResolvedValue({ accepted: 1, duplicates: 0 });
    const restarted = setup(up, store);
    await restarted.queue.start();
    await settle();
    expect(up.mock.calls[0][1].signals.map((s: { tmdbId: number }) => s.tmdbId)).toEqual([1]);
    expect(restarted.queue.pending()).toHaveLength(0);
  });

  it('drops a batch the backend rejects so the queue does not get stuck', async () => {
    const rejected = jest.fn().mockRejectedValue(new ApiRequestError('invalid_body', 'bad', 400));
    const { queue } = setup(rejected);
    queue.enqueue(like(1));
    await queue.flush();
    expect(queue.pending()).toHaveLength(0);
  });

  it('splits more than 50 signals into batches of 50', async () => {
    const { queue, postSignals, background } = setup();
    const down = new ApiRequestError('network', 'offline', 0);
    postSignals.mockRejectedValueOnce(down);
    for (let i = 1; i <= 120; i++) queue.enqueue(like(i));
    await settle();
    background();
    await settle();
    const sizes = postSignals.mock.calls.slice(1).map(([, body]) => body.signals.length);
    expect(sizes).toEqual([50, 50, 20]);
  });

  it(`keeps at most ${MAX_PENDING} signals, dropping the oldest`, async () => {
    const offline = jest.fn().mockRejectedValue(new ApiRequestError('network', 'offline', 0));
    const { queue } = setup(offline);
    for (let i = 1; i <= MAX_PENDING + 10; i++) queue.enqueue(like(i));
    await settle();
    expect(queue.pending()).toHaveLength(MAX_PENDING);
    expect(queue.pending()[0].tmdbId).toBe(11);
  });

  it('never runs two sends at once', async () => {
    let release: () => void = () => undefined;
    const slow = jest.fn(() => new Promise(resolve => (release = () => resolve({ accepted: 1, duplicates: 0 }))));
    const { queue } = setup(slow as never);
    queue.enqueue(like(1));
    const first = queue.flush();
    const second = queue.flush();
    expect(second).toBe(first);
    await settle();
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });
});

describe('device profile', () => {
  it('makes a UUID once and keeps it across runs', async () => {
    const store = createMemoryStore();
    const id = await createDeviceProfile(store).getProfileId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await createDeviceProfile(store).getProfileId()).toBe(id);
  });

  it('never throws when the profile cannot be saved', async () => {
    const api = { putProfile: jest.fn().mockRejectedValue(new Error('offline')) };
    const saved = await createDeviceProfile(createMemoryStore()).ensureProfile(api as never, {
      country: 'ES',
      services: [8],
      showEverything: false,
    });
    expect(saved).toBe(false);
  });
});

describe('cover dwell', () => {
  const title = { tmdbId: 90669, type: 'series' } as TitleCard;
  const other = { tmdbId: 70523, type: 'series' } as TitleCard;

  const track = () => {
    let now = 0;
    const queue = createMemorySignalQueue();
    const dwell = trackCoverDwell(queue, () => now);
    return { queue, dwell, wait: (ms: number) => (now += ms) };
  };

  it.each([
    [20_000, 1],
    [15_000, 1],
    [3_000, 0.2],
  ])('after %i ms on a cover queues dwell with ratio %d', (ms, ratio) => {
    const { queue, dwell, wait } = track();
    dwell.enter(title);
    wait(ms);
    dwell.leave();
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0]).toMatchObject({ kind: 'dwell', surface: 'cover', ratio, tmdbId: 90669, source: 'feed' });
    expect(Signal.safeParse(queue.pending[0]).success).toBe(true);
  });

  it('ignores the D-pad passing by', () => {
    const { queue, dwell, wait } = track();
    dwell.enter(title);
    wait(200);
    dwell.leave();
    expect(queue.pending).toHaveLength(0);
  });

  it('closes the previous cover when the next one shows', () => {
    const { queue, dwell, wait } = track();
    dwell.enter(title);
    wait(6_000);
    dwell.enter(other);
    expect(queue.pending.map(s => s.tmdbId)).toEqual([90669]);
  });
});

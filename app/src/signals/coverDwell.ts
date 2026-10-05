import type { TitleCard } from '@firedrift/domain';
import type { SignalQueue } from './queue';

/** FR-2: staying the whole cap on a cover is a weak positive (ratio 1). */
export const COVER_DWELL_CAP_MS = 15_000;
/** Shorter stays are the D-pad passing by, not an opinion. */
export const MIN_DWELL_MS = 300;

/**
 * Measures time on each feed cover and queues a `dwell` signal when the user
 * leaves it. The feed calls `enter(title)` when a cover shows and `leave()`
 * when it goes (`enter` on the next cover also closes the previous one).
 */
export const trackCoverDwell = (queue: SignalQueue, now: () => number = Date.now) => {
  let current: { title: TitleCard; since: number } | null = null;

  const leave = () => {
    if (!current) return;
    const ms = now() - current.since;
    if (ms >= MIN_DWELL_MS) {
      queue.enqueue({
        tmdbId: current.title.tmdbId,
        type: current.title.type,
        kind: 'dwell',
        surface: 'cover',
        ratio: Math.round(Math.min(1, ms / COVER_DWELL_CAP_MS) * 1000) / 1000,
        source: 'feed',
      });
    }
    current = null;
  };

  const enter = (title: TitleCard) => {
    leave();
    current = { title, since: now() };
  };

  return { enter, leave };
};

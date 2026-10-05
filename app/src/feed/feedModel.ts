import type { PoolResponse, TitleCard } from '@firedrift/domain';

/** FR-1: metadata and images of the next titles are fetched before they show. Never video. */
export const PREFETCH_AHEAD = 3;
/** Ask for a new pool when this many titles or fewer are left after the current one. */
export const REFILL_WHEN_LEFT = 5;
/** Titles kept behind the current one for Up. Older ones are dropped so memory stays flat. */
export const MAX_BEHIND = 20;

/** The titles the feed has, in order, and which one is on screen. */
export interface FeedState {
  titles: TitleCard[];
  index: number;
}

export const emptyFeed: FeedState = { titles: [], index: 0 };

/** A title is the same title only with the same type and TMDB id. */
export const titleKey = (title: Pick<TitleCard, 'type' | 'tmdbId'>) => `${title.type}:${title.tmdbId}`;

export const currentTitle = (state: FeedState): TitleCard | null => state.titles[state.index] ?? null;

/** Titles left after the current one. */
export const titlesLeft = (state: FeedState) => Math.max(0, state.titles.length - state.index - 1);

export const needsRefill = (state: FeedState) => titlesLeft(state) <= REFILL_WHEN_LEFT;

/** The next `count` titles, for prefetching. */
export const upcomingTitles = (state: FeedState, count = PREFETCH_AHEAD) =>
  state.titles.slice(state.index + 1, state.index + 1 + count);

/** Adds a pool's titles at the end, without titles the feed already has. */
export const appendPool = (state: FeedState, pool: PoolResponse): FeedState => {
  const known = new Set(state.titles.map(titleKey));
  const fresh = pool.titles.filter(title => {
    const key = titleKey(title);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return fresh.length ? { ...state, titles: [...state.titles, ...fresh] } : state;
};

/** Moves to the next title. Stays on the last one until a refill arrives. */
export const nextTitle = (state: FeedState): FeedState => {
  if (state.index >= state.titles.length - 1) return state;
  const index = state.index + 1;
  const drop = Math.max(0, index - MAX_BEHIND);
  return { titles: drop ? state.titles.slice(drop) : state.titles, index: index - drop };
};

export const previousTitle = (state: FeedState): FeedState =>
  state.index > 0 ? { ...state, index: state.index - 1 } : state;

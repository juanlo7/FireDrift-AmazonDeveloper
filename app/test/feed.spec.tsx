import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { PoolResponse, TitleCard } from '@firedrift/domain';
import { createMockClient, type ApiClient } from '../src/api';
import {
  appendPool,
  coverMeta,
  createImagePrefetcher,
  emptyFeed,
  feedCommandFor,
  MAX_BEHIND,
  needsRefill,
  nextTitle,
  previousTitle,
  REFILL_RETRY_MS,
  upcomingTitles,
  useFeed,
  type FeedState,
} from '../src/feed';
import type { HWEvent } from '../src/focus';
import { createMemorySignalQueue } from '../src/signals';

let mockRemote: ((event: HWEvent) => void) | null = null;
jest.mock('../src/focus/focusGuide', () => ({
  ...jest.requireActual('../src/focus/focusGuide'),
  useRemoteKeys: (callback: (event: HWEvent) => void) => {
    mockRemote = callback;
  },
}));

const fixture: TitleCard = require('@firedrift/domain/fixtures/rest/title.response.json');

const card = (tmdbId: number, extra: Partial<TitleCard> = {}): TitleCard => ({
  ...fixture,
  tmdbId,
  name: `Title ${tmdbId}`,
  backdropUrl: `https://image.tmdb.org/t/p/w1280/${tmdbId}.jpg`,
  ...extra,
});

const pool = (...ids: number[]): PoolResponse => ({
  poolId: `pool-${ids.join('-')}`,
  algorithmVersion: 'test',
  titles: ids.map(id => card(id)),
});

const feedOf = (count: number, index = 0): FeedState => ({
  titles: Array.from({ length: count }, (_, i) => card(i + 1)),
  index,
});

describe('feed model', () => {
  it('appends a pool without titles the feed already has', () => {
    const state = appendPool(appendPool(emptyFeed, pool(1, 2)), pool(2, 3, 3));
    expect(state.titles.map(t => t.tmdbId)).toEqual([1, 2, 3]);
  });

  it('treats a movie and a series with the same TMDB id as different titles', () => {
    const state = appendPool(emptyFeed, {
      ...pool(),
      titles: [card(7, { type: 'movie' }), card(7, { type: 'series' })],
    });
    expect(state.titles).toHaveLength(2);
  });

  it('returns the same state when a pool brings nothing new', () => {
    const state = appendPool(emptyFeed, pool(1));
    expect(appendPool(state, pool(1))).toBe(state);
  });

  it('moves next and previous and stops at both ends', () => {
    expect(nextTitle(feedOf(2, 1)).index).toBe(1);
    expect(previousTitle(feedOf(2, 0)).index).toBe(0);
    expect(previousTitle(nextTitle(feedOf(3))).index).toBe(0);
  });

  it(`keeps at most ${MAX_BEHIND} titles behind so memory stays flat`, () => {
    let state = feedOf(60);
    for (let i = 0; i < 50; i++) state = nextTitle(state);
    expect(state.index).toBe(MAX_BEHIND);
    expect(state.titles[state.index].tmdbId).toBe(51);
    expect(state.titles).toHaveLength(60 - 50 + MAX_BEHIND);
  });

  it('prefetches the next 3 titles and refills when 10 or fewer are left', () => {
    expect(upcomingTitles(feedOf(10, 2)).map(t => t.tmdbId)).toEqual([4, 5, 6]);
    expect(needsRefill(feedOf(20, 8))).toBe(false);
    expect(needsRefill(feedOf(20, 9))).toBe(true);
  });
});

describe('feedCommandFor', () => {
  it.each([
    ['down', 'next'],
    ['up', 'previous'],
    ['right', 'like'],
    ['left', 'skip'],
    ['select', 'watchNow'],
    ['enter', 'watchNow'],
    ['playpause', null],
  ])('%s → %s', (eventType, command) => {
    expect(feedCommandFor({ eventType, eventKeyAction: 0 })).toBe(command);
  });

  it('ignores key releases', () => {
    expect(feedCommandFor({ eventType: 'down', eventKeyAction: 1 })).toBeNull();
  });
});

describe('createImagePrefetcher', () => {
  it('fetches each cover image once: the poster and the backdrop', async () => {
    const prefetch = jest.fn().mockResolvedValue(true);
    const warm = createImagePrefetcher(prefetch);
    warm([card(1, { posterUrl: 'https://image.tmdb.org/p1.jpg' }), card(2, { backdropUrl: null, posterUrl: null })]);
    warm([card(1, { posterUrl: 'https://image.tmdb.org/p1.jpg' })]);
    await act(async () => {});
    expect(prefetch.mock.calls.map(c => c[0])).toEqual([
      'https://image.tmdb.org/p1.jpg',
      'https://image.tmdb.org/t/p/w1280/1.jpg',
    ]);
  });

  it('survives a prefetch that throws', async () => {
    const warm = createImagePrefetcher(() => {
      throw new Error('no image loader');
    });
    expect(() => warm([card(1)])).not.toThrow();
    await act(async () => {});
  });
});

describe('coverMeta', () => {
  it('joins year, first genre, runtime and rating', () => {
    expect(coverMeta(card(1, { year: 2017, genres: ['Crime', 'Drama'], runtimeMinutes: 164, rating: 8.4 }))).toBe(
      '2017  ·  Crime  ·  2 h 44 min  ·  Rated 8.4',
    );
  });

  it('falls back to the type when there is no genre', () => {
    expect(coverMeta(card(1, { year: 2017, genres: [], type: 'series', runtimeMinutes: 45, rating: null }))).toBe(
      '2017  ·  Series  ·  45 min',
    );
  });
});

describe('useFeed', () => {
  const setup = (api: Partial<ApiClient>, active = true) => {
    const signals = createMemorySignalQueue();
    let now = 0;
    const deps = {
      api: { ...createMockClient(), ...api },
      getProfileId: async () => 'profile-1',
      signals,
      prefetchImages: jest.fn(),
      now: () => now,
    };
    const hook = renderHook(({ isActive }: { isActive: boolean }) => useFeed(deps, isActive), {
      initialProps: { isActive: active },
    });
    return { ...hook, signals, deps, advance: (ms: number) => (now += ms) };
  };

  it('loads the pool and shows the first title', async () => {
    const { result } = setup({ getPool: async () => pool(1, 2) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.title?.tmdbId).toBe(1);
  });

  it('shows the error and keeps a retry when the first pool fails', async () => {
    const getPool = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(pool(1));
    const { result } = setup({ getPool });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('offline');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('is empty when the pool has no titles', async () => {
    const { result } = setup({ getPool: async () => pool() });
    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('like queues one signal and marks the cover; skip queues a signal and moves on', async () => {
    const { result, signals } = setup({ getPool: async () => pool(1, 2, 3, 4, 5, 6, 7, 8) });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.like());
    act(() => result.current.like());
    expect(result.current.isLiked).toBe(true);

    act(() => result.current.skip());
    expect(result.current.title?.tmdbId).toBe(2);
    expect(result.current.isLiked).toBe(false);

    const kinds = signals.pending.filter(s => s.kind !== 'dwell').map(s => [s.kind, s.tmdbId]);
    expect(kinds).toEqual([
      ['like', 1],
      ['skip', 1],
    ]);
  });

  it('asks for a new pool only when the current one is nearly used', async () => {
    const getPool = jest
      .fn()
      .mockResolvedValueOnce(pool(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13))
      .mockResolvedValue(pool(14, 15, 16, 17, 18, 19, 20, 21));
    const { result } = setup({ getPool });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getPool).toHaveBeenCalledTimes(1);

    act(() => result.current.next()); // 11 left
    expect(getPool).toHaveBeenCalledTimes(1);
    act(() => result.current.next()); // 10 left → refill
    await waitFor(() => expect(getPool).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.hasNext).toBe(true));
  });

  it('waits before asking again when a refill brings nothing new', async () => {
    const getPool = jest.fn().mockResolvedValue(pool(1, 2));
    const { result, advance } = setup({ getPool });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(getPool).toHaveBeenCalledTimes(2));

    act(() => result.current.next());
    act(() => result.current.previous());
    expect(getPool).toHaveBeenCalledTimes(2);

    advance(REFILL_RETRY_MS);
    act(() => result.current.next());
    await waitFor(() => expect(getPool).toHaveBeenCalledTimes(3));
  });

  it('prefetches the upcoming covers', async () => {
    const { result, deps } = setup({ getPool: async () => pool(1, 2, 3, 4, 5) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const lastCall = deps.prefetchImages.mock.calls.at(-1)?.[0] as TitleCard[];
    expect(lastCall.map(t => t.tmdbId)).toEqual([2, 3, 4]);
  });

  it('measures cover dwell only while active', async () => {
    const { result, signals, advance, rerender } = setup({ getPool: async () => pool(1, 2, 3) });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    advance(3000);
    rerender({ isActive: false }); // menu or Watch now opened
    advance(60_000);
    rerender({ isActive: true });
    advance(1500);
    act(() => result.current.next());

    const dwell = signals.pending.filter(s => s.kind === 'dwell').map(s => [s.tmdbId, s.ratio]);
    expect(dwell).toEqual([
      [1, 0.2],
      [1, 0.1],
    ]);
  });
});

describe('FeedScreen with the remote', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderApp } = require('./renderApp');
  const press = (eventType: string) => act(() => mockRemote?.({ eventType, eventKeyAction: 0 }));

  it('browses covers with Up and Down and opens Watch now with OK', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toHaveTextContent('Dark'));
    expect(screen.getByTestId('feed-hints')).toBeTruthy();

    press('down');
    expect(screen.getByTestId('feed-title')).toHaveTextContent('Arrival');
    press('up');
    expect(screen.getByTestId('feed-title')).toHaveTextContent('Dark');

    press('right');
    expect(screen.getByTestId('feed-liked')).toBeTruthy();

    press('select');
    await waitFor(() => expect(screen.getByTestId('watch-now-title')).toHaveTextContent('Watch Dark'));

    // While the sheet is open, the feed ignores the D-pad and its text column steps out.
    press('down');
    expect(screen.queryByTestId('feed-title')).toBeNull();
    expect(screen.getByTestId('watch-now-title')).toHaveTextContent('Watch Dark');
  });

  it('skips with Left', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toHaveTextContent('Dark'));
    press('left');
    expect(screen.getByTestId('feed-title')).toHaveTextContent('Arrival');
  });
});

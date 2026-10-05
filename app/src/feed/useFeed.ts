import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TitleCard } from '@firedrift/domain';
import type { ApiClient } from '../api';
import { trackCoverDwell, type SignalQueue } from '../signals';
import {
  appendPool,
  currentTitle,
  emptyFeed,
  needsRefill,
  nextTitle,
  previousTitle,
  titleKey,
  upcomingTitles,
  type FeedState,
} from './feedModel';
import { createImagePrefetcher } from './prefetch';

/** After a refill fails or brings nothing new, wait this long before asking again. */
export const REFILL_RETRY_MS = 60_000;

export type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface FeedDeps {
  api: ApiClient;
  getProfileId: () => Promise<string>;
  signals: SignalQueue;
  /** Warms the cache for upcoming covers. Defaults to `Image.prefetch`. */
  prefetchImages?: (titles: TitleCard[]) => void;
  now?: () => number;
}

/**
 * FR-1 feed state: the pool, the title on screen, and the remote commands.
 * Asks for a new pool only when the current one is nearly used. Measures
 * dwell on the cover while `active` (screen focused, no menu or sheet open).
 */
export const useFeed = (
  { api, getProfileId, signals, prefetchImages, now = Date.now }: FeedDeps,
  active: boolean,
  /** When it changes (new services or country), the feed starts again with a new pool. */
  reloadKey = '',
) => {
  const [feed, setFeed] = useState<FeedState>(emptyFeed);
  const [load, setLoad] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set());
  const loading = useRef(false);
  const retryAfter = useRef(0);
  // A pool that arrives after a reload belongs to the old settings and is ignored.
  const generation = useRef(0);
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const prefetch = useMemo(() => prefetchImages ?? createImagePrefetcher(), [prefetchImages]);
  const dwell = useMemo(() => trackCoverDwell(signals, now), [signals, now]);

  const loadPool = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const started = generation.current;
    try {
      const pool = await api.getPool(await getProfileId());
      if (started !== generation.current) return;
      const known = new Set(feedRef.current.titles.map(titleKey));
      if (!pool.titles.some(t => !known.has(titleKey(t)))) {
        retryAfter.current = now() + REFILL_RETRY_MS;
      }
      setFeed(prev => appendPool(prev, pool));
      setLoad('loaded');
      setError(null);
    } catch (e: unknown) {
      if (started !== generation.current) return;
      // A failed refill keeps the titles the feed already has.
      retryAfter.current = now() + REFILL_RETRY_MS;
      setError(e instanceof Error ? e.message : String(e));
      setLoad('error');
    } finally {
      if (started === generation.current) loading.current = false;
    }
  }, [api, getProfileId, now]);

  const retry = useCallback(() => {
    retryAfter.current = 0;
    setLoad('loading');
    loadPool();
  }, [loadPool]);

  const firstKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey === firstKey.current) {
      loadPool();
      return;
    }
    firstKey.current = reloadKey;
    generation.current += 1;
    loading.current = false;
    retryAfter.current = 0;
    setFeed(emptyFeed);
    setLiked(new Set());
    setLoad('loading');
    loadPool();
  }, [reloadKey, loadPool]);

  const status: FeedStatus = feed.titles.length
    ? 'ready'
    : load === 'loaded'
      ? 'empty'
      : load;
  const title = currentTitle(feed);
  const key = title ? titleKey(title) : null;

  useEffect(() => {
    if (status === 'ready' && needsRefill(feed) && now() >= retryAfter.current) loadPool();
    prefetch(upcomingTitles(feed));
  }, [feed, status, loadPool, prefetch, now]);

  useEffect(() => {
    if (!active || !title) return;
    dwell.enter(title);
    return dwell.leave;
    // `key` identifies the title; the object may be a new copy of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, dwell]);

  const next = useCallback(() => setFeed(nextTitle), []);
  const previous = useCallback(() => setFeed(previousTitle), []);

  const like = useCallback(() => {
    if (!title || liked.has(titleKey(title))) return;
    signals.enqueue({ tmdbId: title.tmdbId, type: title.type, kind: 'like', source: 'feed' });
    setLiked(prev => new Set(prev).add(titleKey(title)));
  }, [title, liked, signals]);

  const skip = useCallback(() => {
    if (!title) return;
    signals.enqueue({ tmdbId: title.tmdbId, type: title.type, kind: 'skip', source: 'feed' });
    setFeed(nextTitle);
  }, [title, signals]);

  return {
    status,
    error,
    title,
    isLiked: key !== null && liked.has(key),
    position: { index: feed.index + 1, total: feed.titles.length },
    hasPrevious: feed.index > 0,
    hasNext: feed.index < feed.titles.length - 1,
    next,
    previous,
    like,
    skip,
    retry,
  };
};

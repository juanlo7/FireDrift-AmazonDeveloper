import { Image } from 'react-native';
import type { TitleCard } from '@firedrift/domain';

export type PrefetchImage = (url: string) => Promise<unknown>;

/** The images a cover shows: the poster in the case and the backdrop as the room's light. */
export const coverImageUrls = (title: TitleCard): string[] =>
  [title.posterUrl, title.backdropUrl].filter((url): url is string => Boolean(url));

/**
 * Warms the image cache. Each URL is fetched once; failures are ignored (and
 * may be tried again) because every screen still works without its images.
 */
export const createUrlPrefetcher = (prefetch: PrefetchImage = url => Image.prefetch(url)) => {
  const requested = new Set<string>();
  return (urls: string[]) => {
    for (const url of urls) {
      if (!url || requested.has(url)) continue;
      requested.add(url);
      // `then` also catches a prefetch that throws instead of rejecting.
      Promise.resolve()
        .then(() => prefetch(url))
        .catch(() => requested.delete(url));
    }
  };
};

/** Prefetches the next covers so each one shows in under 500 ms (NFR-3). */
export const createImagePrefetcher = (prefetch?: PrefetchImage) => {
  const prefetchUrls = createUrlPrefetcher(prefetch);
  return (titles: TitleCard[]) => prefetchUrls(titles.flatMap(coverImageUrls));
};

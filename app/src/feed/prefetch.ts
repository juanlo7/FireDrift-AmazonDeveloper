import { Image } from 'react-native';
import type { TitleCard } from '@firedrift/domain';

export type PrefetchImage = (url: string) => Promise<unknown>;

/** The images a cover shows: the backdrop, or the poster when there is no backdrop. */
export const coverImageUrl = (title: TitleCard): string | null => title.backdropUrl ?? title.posterUrl;

/**
 * Warms the image cache for the next covers so each one shows in under
 * 500 ms (NFR-3). Each URL is fetched once; failures are ignored because the
 * cover still works without its image.
 */
export const createImagePrefetcher = (prefetch: PrefetchImage = url => Image.prefetch(url)) => {
  const requested = new Set<string>();
  return (titles: TitleCard[]) => {
    for (const title of titles) {
      const url = coverImageUrl(title);
      if (!url || requested.has(url)) continue;
      requested.add(url);
      // `then` also catches a prefetch that throws instead of rejecting.
      Promise.resolve()
        .then(() => prefetch(url))
        .catch(() => requested.delete(url));
    }
  };
};

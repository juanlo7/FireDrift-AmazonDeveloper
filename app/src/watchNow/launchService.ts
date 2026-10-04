import { Linking } from 'react-native';
import type { TitleCard } from '@firedrift/domain';

/**
 * Links to try per TMDB provider ID, in order. Spike V3 (docs/spikes.md):
 * Vega opens an installed app with `pkg://<component-id>` or a URL the app
 * registers. The Vega component IDs of the streaming apps and the URLs they
 * accept are NOT verified yet (no streaming apps on the VVD); check them with
 * `vega device installed-apps` on a Vega device and update this table.
 */
const CANDIDATES: Record<number, (title: TitleCard) => string[]> = {
  // Netflix (and "Netflix Standard with Ads")
  8: t => [`https://www.netflix.com/search?q=${encodeURIComponent(t.name)}`, 'https://www.netflix.com'],
  1796: t => [`https://www.netflix.com/search?q=${encodeURIComponent(t.name)}`],
  // Amazon Prime Video (and "with Ads")
  119: t => [`https://app.primevideo.com/search?phrase=${encodeURIComponent(t.name)}`, 'https://www.primevideo.com'],
  2100: t => [`https://app.primevideo.com/search?phrase=${encodeURIComponent(t.name)}`],
  // Disney Plus
  337: t => [`https://www.disneyplus.com/search?q=${encodeURIComponent(t.name)}`],
  // HBO Max
  1899: () => ['https://play.max.com'],
  // Apple TV / Apple TV Store
  2: t => [`https://tv.apple.com/search?term=${encodeURIComponent(t.name)}`],
  350: t => [`https://tv.apple.com/search?term=${encodeURIComponent(t.name)}`],
};

export type LaunchResult = { opened: true; url: string } | { opened: false; tried: string[] };

/**
 * Tries each candidate link for the service. On Vega `canOpenURL` throws when
 * no app handles a URL, so both calls are guarded.
 */
export const launchService = async (
  providerId: number,
  title: TitleCard,
  linking: Pick<typeof Linking, 'canOpenURL' | 'openURL'> = Linking,
): Promise<LaunchResult> => {
  const tried = CANDIDATES[providerId]?.(title) ?? [];
  for (const url of tried) {
    try {
      if (await linking.canOpenURL(url)) {
        await linking.openURL(url);
        return { opened: true, url };
      }
    } catch {
      // No app for this URL; try the next one.
    }
  }
  return { opened: false, tried };
};

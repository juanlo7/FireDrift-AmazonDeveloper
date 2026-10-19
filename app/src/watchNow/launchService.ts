import { Linking } from 'react-native';
import type { TitleCard } from '@firedrift/domain';
import { config } from '../config';

/**
 * Vega component IDs of the streaming apps, by TMDB provider ID. On the VVD an
 * app opens another app only with `pkg://<component-id>`, on its home screen
 * (custom schemes and https links fail from `Linking.openURL`, see
 * docs/feedback.md). The real IDs need a Vega device with the apps installed:
 * `vega device installed-apps`. Unknown so far.
 */
const COMPONENT_IDS: Record<number, string> = {};

/**
 * Web links per TMDB provider ID. They did not open apps on the VVD; they stay
 * as a second try in case a device handles them.
 */
const WEB_LINKS: Record<number, (title: TitleCard) => string[]> = {
  // Netflix (and "Netflix Standard with Ads")
  8: t => [`https://www.netflix.com/search?q=${encodeURIComponent(t.name)}`],
  1796: t => [`https://www.netflix.com/search?q=${encodeURIComponent(t.name)}`],
  // Amazon Prime Video (and "with Ads")
  119: t => [`https://app.primevideo.com/search?phrase=${encodeURIComponent(t.name)}`],
  2100: t => [`https://app.primevideo.com/search?phrase=${encodeURIComponent(t.name)}`],
  // Disney Plus
  337: t => [`https://www.disneyplus.com/search?q=${encodeURIComponent(t.name)}`],
  // HBO Max
  1899: () => ['https://play.max.com'],
  // Apple TV / Apple TV Store
  2: t => [`https://tv.apple.com/search?term=${encodeURIComponent(t.name)}`],
  350: t => [`https://tv.apple.com/search?term=${encodeURIComponent(t.name)}`],
};

/** The app's home first (works on Vega), then the web links. */
export const serviceLinks = (
  providerId: number,
  title: TitleCard,
  componentIds: Record<number, string> = { ...COMPONENT_IDS, ...config.serviceAppOverrides },
): string[] => {
  const componentId = componentIds[providerId];
  return [
    ...(componentId ? [`pkg://${componentId}`] : []),
    ...(WEB_LINKS[providerId]?.(title) ?? []),
  ];
};

export type LaunchResult = { opened: true; url: string } | { opened: false; tried: string[] };

/**
 * Tries each link with `openURL` and stops at the first that opens.
 * `canOpenURL` is not used: on Vega it throws even when an installed app
 * handles the URL.
 */
export const launchService = async (
  providerId: number,
  title: TitleCard,
  linking: Pick<typeof Linking, 'openURL'> = Linking,
  links: string[] = serviceLinks(providerId, title),
): Promise<LaunchResult> => {
  for (const url of links) {
    try {
      await linking.openURL(url);
      return { opened: true, url };
    } catch {
      // No app for this link; try the next one.
    }
  }
  return { opened: false, tried: links };
};

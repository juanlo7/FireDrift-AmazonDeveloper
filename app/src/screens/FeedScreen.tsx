import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@amazon-devices/react-navigation__native';
import type { TitleCard } from '@firedrift/domain';
import { api } from '../api';
import { FocusableButton, Screen } from '../components';
import {
  CoverView,
  createUrlPrefetcher,
  FeedMenu,
  feedCommandFor,
  titleKey,
  useFeed,
  type FeedCommand,
  type FeedDeps,
} from '../feed';
import { FocusGuideView, useRemoteKeys } from '../focus';
import { deviceProfile } from '../profile';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { useSettings } from '../settings';
import { signalQueue } from '../signals';
import { colors, fonts, spacing, typography } from '../theme';
import { MAX_SHEET_OPTIONS, toServiceOptions, WatchNowSheet } from '../watchNow';

const feedDeps: FeedDeps = { api, getProfileId: deviceProfile.getProfileId, signals: signalQueue };

// OK is on the "Watch on …" chip itself.
const KEY_HINTS = [
  ['Up · Down', 'Browse'],
  ['Right', 'Like'],
  ['Left', 'Skip'],
  ['Back', 'Menu'],
] as const;

/**
 * Home, FR-1 with D8 plan B: one full-screen cover at a time, browsed with
 * the remote. Up/Down = previous/next, Right = Like, Left = Skip,
 * OK = Watch now, Back = menu.
 */
export const FeedScreen = ({ navigation }: RootScreenProps<'Feed'>) => {
  const isFocused = useIsFocused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [watchNow, setWatchNow] = useState<TitleCard | null>(null);
  const active = isFocused && !menuOpen && !watchNow;
  // The cover holds focus so OK reaches it from any remote: the on-screen remote of
  // the VVD sends OK to the focused element, not to the key listener. Remounting it
  // when an overlay closes gives focus back to the cover.
  const [focusEpoch, setFocusEpoch] = useState(0);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setFocusEpoch(n => n + 1);
    wasActive.current = active;
  }, [active]);
  const settings = useSettings();
  const reloadKey = settings
    ? `${settings.country}|${[...settings.services].sort().join(',')}|${settings.showEverything}`
    : '';
  const feed = useFeed(feedDeps, active, reloadKey);

  // Images that finish loading while a Modal is open never paint on Vega, so the
  // Watch now logos are fetched as soon as the cover shows, before OK opens the sheet.
  const prefetchLogos = useMemo(() => createUrlPrefetcher(), []);
  useEffect(() => {
    if (!feed.title) return;
    prefetchLogos(
      toServiceOptions(feed.title.providers)
        .slice(0, MAX_SHEET_OPTIONS)
        .map(option => option.logoUrl),
    );
  }, [feed.title, prefetchLogos]);

  // The title shown before the current one, so its case can slide out and its light fade under.
  const shown = useRef<{ current: TitleCard | null; previous: TitleCard | null }>({ current: null, previous: null });
  if (feed.title && shown.current.current && titleKey(shown.current.current) !== titleKey(feed.title)) {
    shown.current = { current: feed.title, previous: shown.current.current };
  } else if (feed.title) {
    shown.current = { ...shown.current, current: feed.title };
  }

  const run: Record<FeedCommand, () => void> = {
    next: feed.next,
    previous: feed.previous,
    like: feed.like,
    skip: feed.skip,
    watchNow: () => feed.title && setWatchNow(feed.title),
  };
  // The key listener lives for the whole screen; it always reads the latest state.
  const latest = useRef({ active, ready: feed.status === 'ready', run });
  latest.current = { active, ready: feed.status === 'ready', run };

  useRemoteKeys(event => {
    const { active: isActive, ready, run: commands } = latest.current;
    const command = feedCommandFor(event);
    if (isActive && ready && command) commands[command]();
  });

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen(true);
      return true;
    });
    return () => subscription.remove();
  }, [active]);

  return (
    <Screen testID="screen-feed">
      {feed.status === 'ready' && feed.title ? (
        <>
          <CoverView
            key={titleKey(feed.title)}
            title={feed.title}
            previous={shown.current.previous}
            isLiked={feed.isLiked}
            dimmed={menuOpen || watchNow !== null}
          />
          <Pressable
            key={`cover-focus-${focusEpoch}`}
            accessibilityRole="button"
            accessibilityLabel={`Watch ${feed.title.name}`}
            hasTVPreferredFocus
            onPress={() => active && feed.title && setWatchNow(feed.title)}
            style={StyleSheet.absoluteFill}
            testID="feed-cover-press"
          />
          <View style={[styles.hints, (menuOpen || watchNow !== null) && styles.hidden]} testID="feed-hints">
            {KEY_HINTS.map(([key, label]) => (
              <Text key={label} style={styles.hint}>
                <Text style={styles.hintKey}>{key}</Text>  {label}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.message}>
          <Text style={styles.messageTitle}>
            {feed.status === 'loading' ? 'Tonight' : feed.status === 'empty' ? 'Nothing showing' : 'Lights out'}
          </Text>
          <Text style={styles.messageText} testID="feed-status">
            {feed.status === 'loading'
              ? 'Finding something to watch…'
              : feed.status === 'empty'
                ? 'Nothing new on your services right now. Try more services in Settings.'
                : `Could not load the feed: ${feed.error ?? 'unknown error'}`}
          </Text>
          {feed.status === 'loading' ? null : (
            <FocusGuideView autoFocus style={styles.actions}>
              <FocusableButton label="Try again" hasTVPreferredFocus onPress={feed.retry} testID="feed-retry" />
              <FocusableButton
                label="Settings"
                onPress={() => navigation.navigate('Settings')}
                testID="feed-settings"
              />
            </FocusGuideView>
          )}
        </View>
      )}

      <FeedMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={item => {
          setMenuOpen(false);
          navigation.navigate(item);
        }}
        onExit={() => BackHandler.exitApp()}
      />

      <WatchNowSheet
        title={watchNow}
        source="feed"
        onClose={() => setWatchNow(null)}
        onNextTitle={() => {
          setWatchNow(null);
          feed.next();
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  hints: {
    position: 'absolute',
    left: 410,
    right: 60,
    bottom: 40,
    flexDirection: 'row',
    gap: spacing.xl,
  },
  hidden: { opacity: 0 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  hintKey: { ...typography.label, color: colors.text },
  message: { flex: 1, justifyContent: 'center', maxWidth: 560, gap: spacing.lg },
  messageTitle: { ...typography.title, color: colors.text },
  messageText: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.md },
});

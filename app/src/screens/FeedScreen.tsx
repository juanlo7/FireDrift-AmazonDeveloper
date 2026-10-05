import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@amazon-devices/react-navigation__native';
import type { TitleCard } from '@firedrift/domain';
import { api } from '../api';
import { FocusableButton, Screen } from '../components';
import {
  CoverView,
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
import { colors, safeArea, spacing, typography } from '../theme';
import { WatchNowSheet } from '../watchNow';

const feedDeps: FeedDeps = { api, getProfileId: deviceProfile.getProfileId, signals: signalQueue };

const KEY_HINTS = [
  ['↑ ↓', 'Browse'],
  ['←', 'Skip'],
  ['→', 'Like'],
  ['OK', 'Watch now'],
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
  const settings = useSettings();
  const reloadKey = settings
    ? `${settings.country}|${[...settings.services].sort().join(',')}|${settings.showEverything}`
    : '';
  const feed = useFeed(feedDeps, active, reloadKey);

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
          <CoverView key={titleKey(feed.title)} title={feed.title} isLiked={feed.isLiked} />
          <View style={styles.hints} testID="feed-hints">
            {KEY_HINTS.map(([key, label]) => (
              <Text key={label} style={styles.hint}>
                <Text style={styles.hintKey}>{key}</Text> {label}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.message}>
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
    left: safeArea.horizontal,
    right: safeArea.horizontal,
    bottom: safeArea.vertical,
    flexDirection: 'row',
    gap: spacing.lg,
  },
  hint: { ...typography.caption, color: colors.textMuted },
  hintKey: { color: colors.text, fontWeight: '700' },
  message: { flex: 1, justifyContent: 'center', maxWidth: 1200, gap: spacing.md },
  messageText: { ...typography.subtitle, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md },
});

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PoolResponse, TitleCard } from '@firedrift/domain';
import { api } from '../api';
import { FocusableButton, Screen } from '../components';
import { FocusGuideView } from '../focus';
import { deviceProfile } from '../profile';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { colors, spacing, typography } from '../theme';
import { WatchNowSheet } from '../watchNow';

/** Home. Shows one pool title at a time until the cover feed (#35). */
export const FeedScreen = ({ navigation }: RootScreenProps<'Feed'>) => {
  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [watchNow, setWatchNow] = useState<TitleCard | null>(null);

  useEffect(() => {
    deviceProfile
      .getProfileId()
      .then(profileId => api.getPool(profileId))
      .then(setPool)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const title = pool?.titles[index] ?? null;
  const nextTitle = () => {
    setWatchNow(null);
    if (pool?.titles.length) setIndex(i => (i + 1) % pool.titles.length);
  };

  return (
    <Screen testID="screen-feed">
      <FocusGuideView autoFocus style={styles.menu}>
        <FocusableButton
          label="Butler"
          onPress={() => navigation.navigate('Butler')}
          testID="menu-butler"
        />
        <FocusableButton
          label="Settings"
          onPress={() => navigation.navigate('Settings')}
          testID="menu-settings"
        />
        <FocusableButton
          label="About"
          onPress={() => navigation.navigate('About')}
          testID="menu-about"
        />
      </FocusGuideView>

      <View style={styles.body}>
        {error ? (
          <Text style={styles.overview} testID="feed-status">
            Could not load the pool: {error}
          </Text>
        ) : !title ? (
          <Text style={styles.overview} testID="feed-status">
            Loading pool…
          </Text>
        ) : (
          <>
            <Text style={styles.name} testID="feed-title">
              {title.name}
            </Text>
            <Text style={styles.meta}>
              {[title.year, title.genres.slice(0, 3).join(', '), title.rating?.toFixed(1)]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
            <Text style={styles.overview} numberOfLines={4} testID="feed-status">
              {title.overview}
            </Text>
            <FocusGuideView autoFocus style={styles.actions}>
              <FocusableButton
                label="Watch now"
                hasTVPreferredFocus
                onPress={() => setWatchNow(title)}
                testID="feed-watch-now"
              />
              <FocusableButton label="Next title" onPress={nextTitle} testID="feed-next" />
            </FocusGuideView>
          </>
        )}
      </View>

      <WatchNowSheet
        title={watchNow}
        source="feed"
        onClose={() => setWatchNow(null)}
        onNextTitle={nextTitle}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  menu: { flexDirection: 'row', gap: spacing.md },
  body: { flex: 1, justifyContent: 'center', maxWidth: 1200, gap: spacing.sm },
  name: { ...typography.display, color: colors.text },
  meta: { ...typography.subtitle, color: colors.primary },
  overview: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});

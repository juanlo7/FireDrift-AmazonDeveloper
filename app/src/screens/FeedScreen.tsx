import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PoolResponse } from '@firedrift/domain';
import { api } from '../api';
import { FocusableButton, Screen } from '../components';
import { FocusGuideView } from '../focus';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { colors, spacing, typography } from '../theme';

// Until the device profile exists (#37), every call uses this ID.
const PLACEHOLDER_PROFILE_ID = '00000000-0000-4000-8000-000000000000';

/** Home. Placeholder until the trailer feed (#35). */
export const FeedScreen = ({ navigation }: RootScreenProps<'Feed'>) => {
  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPool(PLACEHOLDER_PROFILE_ID)
      .then(setPool)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <Screen testID="screen-feed">
      <FocusGuideView autoFocus style={styles.menu}>
        <FocusableButton
          label="Butler"
          hasTVPreferredFocus
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
        <Text style={styles.brand}>FireDrift</Text>
        <Text style={styles.status} testID="feed-status">
          {error
            ? `Could not load the pool: ${error}`
            : pool
            ? `Pool ${pool.poolId}: ${pool.titles.length} titles, first "${pool.titles[0]?.name ?? '—'}"`
            : 'Loading pool…'}
        </Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  menu: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    ...typography.display,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  status: {
    ...typography.body,
    color: colors.textMuted,
  },
});

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { PlaceholderScreen } from './PlaceholderScreen';

/** Attributions required by TMDB and JustWatch. Keep them on this screen. */
export const AboutScreen = () => (
  <PlaceholderScreen
    title="About"
    description="FireDrift helps you pick something to watch."
    testID="screen-about"
  >
    <Text style={styles.notice}>
      This product uses the TMDB API but is not endorsed or certified by TMDB.
    </Text>
    <Text style={styles.notice}>Streaming availability data provided by JustWatch.</Text>
  </PlaceholderScreen>
);

const styles = StyleSheet.create({
  notice: {
    ...typography.caption,
    color: colors.text,
    marginBottom: spacing.md,
  },
});

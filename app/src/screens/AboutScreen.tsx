import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BUTLER_CREDITS, JUSTWATCH_CREDIT, OPEN_SOURCE, TMDB_NOTICE } from '../about/credits';
import { FocusableButton, Screen } from '../components';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { colors, spacing, typography } from '../theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tmdbLogo = require('../../assets/images/tmdb-logo.png');

/** Attributions required by TMDB and JustWatch, butler credits and licenses. Keep them here. */
export const AboutScreen = ({ navigation }: RootScreenProps<'About'>) => (
  <Screen title="About" testID="screen-about">
    <View style={styles.columns}>
      <View style={styles.column}>
        <Text style={styles.body}>FireDrift helps you pick something to watch.</Text>
        <Image source={tmdbLogo} style={styles.tmdbLogo} resizeMode="contain" accessibilityLabel="TMDB" testID="about-tmdb-logo" />
        <Text style={styles.notice}>{TMDB_NOTICE}</Text>
        <Text style={styles.notice}>{JUSTWATCH_CREDIT}</Text>
        <FocusableButton
          label="Back"
          hasTVPreferredFocus
          onPress={() => navigation.goBack()}
          style={styles.back}
          testID="button-back"
        />
      </View>

      <View style={styles.column}>
        <Text style={styles.heading}>The butler</Text>
        {BUTLER_CREDITS.map(({ what, how }) => (
          <Text key={what} style={styles.line}>
            <Text style={styles.strong}>{what}: </Text>
            {how}
          </Text>
        ))}
        <Text style={[styles.heading, styles.gap]}>Open source</Text>
        <Text style={styles.line} testID="about-licenses">
          {OPEN_SOURCE.map(({ name, license }) => `${name} (${license})`).join(' · ')}
        </Text>
      </View>
    </View>
  </Screen>
);

const styles = StyleSheet.create({
  columns: { flex: 1, flexDirection: 'row', gap: spacing.lg },
  column: { flex: 1, gap: spacing.xs },
  body: { ...typography.body, color: colors.textMuted },
  tmdbLogo: { width: 185, height: 24, marginTop: spacing.sm },
  notice: { fontSize: 16, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700', color: colors.primary },
  gap: { marginTop: spacing.sm },
  line: { fontSize: 14, color: colors.text },
  strong: { fontWeight: '700' },
  back: { alignSelf: 'flex-start', marginTop: spacing.md },
});

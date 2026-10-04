import type { ReactNode } from 'react';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, safeArea, spacing, typography } from '../theme';

export interface ScreenProps {
  title?: string;
  children?: ReactNode;
  testID?: string;
}

/** Full-screen container inside the TV safe area, with an optional title. */
export const Screen = ({ title, children, testID }: ScreenProps) => (
  <View style={styles.screen} testID={testID}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    {children}
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: safeArea.horizontal,
    paddingVertical: safeArea.vertical,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
});

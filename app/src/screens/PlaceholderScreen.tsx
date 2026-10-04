import type { ReactNode } from 'react';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@amazon-devices/react-navigation__native';
import { FocusableButton, Screen } from '../components';
import { colors, spacing, typography } from '../theme';

export interface PlaceholderScreenProps {
  title: string;
  description: string;
  testID: string;
  children?: ReactNode;
}

/** Empty screen with a focusable Back button, until its block is built. */
export const PlaceholderScreen = ({
  title,
  description,
  testID,
  children,
}: PlaceholderScreenProps) => {
  const navigation = useNavigation();

  return (
    <Screen title={title} testID={testID}>
      <Text style={styles.description}>{description}</Text>
      {children}
      <FocusableButton
        label="Back"
        hasTVPreferredFocus
        onPress={() => navigation.goBack()}
        style={styles.back}
        testID="button-back"
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  description: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  back: {
    alignSelf: 'flex-start',
  },
});

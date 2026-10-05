import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useFocusState } from '../focus';
import { colors, focus, radius, spacing, typography } from '../theme';

export interface FocusableButtonProps {
  label: string;
  /** What screen readers say, when the visible label is short. Defaults to `label`. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Takes focus when the screen opens. Use on one element per screen. */
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** D-pad button with a visible focus state (scale and ring). */
export const FocusableButton = ({
  label,
  accessibilityLabel,
  onPress,
  hasTVPreferredFocus,
  onFocus,
  style,
  testID,
}: FocusableButtonProps) => {
  const { isFocused, handleFocus, handleBlur } = useFocusState({ onFocus });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[styles.button, isFocused && styles.focused, style]}
      testID={testID}
    >
      <Text style={[styles.label, isFocused && styles.labelFocused]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: focus.ringWidth,
    borderColor: 'transparent',
  },
  focused: {
    backgroundColor: colors.primary,
    borderColor: focus.ringColor,
    transform: [{ scale: focus.scale }],
  },
  label: {
    ...typography.body,
    color: colors.text,
  },
  labelFocused: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
});

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
  /** Key down and key up of OK, for a hold (push to talk). */
  onPressIn?: () => void;
  onPressOut?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** D-pad pill button. Focus fills it with amber and lifts it. */
export const FocusableButton = ({
  label,
  accessibilityLabel,
  onPress,
  hasTVPreferredFocus,
  onFocus,
  onPressIn,
  onPressOut,
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
      onPressIn={onPressIn}
      onPressOut={onPressOut}
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
  },
  focused: {
    backgroundColor: colors.primary,
    transform: [{ scale: focus.scale }],
    ...focus.shadow,
  },
  label: {
    ...typography.subtitle,
    color: colors.text,
  },
  labelFocused: {
    color: colors.onPrimary,
  },
});

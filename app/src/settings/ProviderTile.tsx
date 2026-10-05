import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Provider } from '@firedrift/domain';
import { useFocusState } from '../focus';
import { colors, focus, radius, spacing } from '../theme';

export interface ProviderTileProps {
  provider: Provider;
  selected: boolean;
  onToggle: () => void;
  hasTVPreferredFocus?: boolean;
}

/** One service in the logo grid. OK toggles it; focus scales it and shows the ring. */
export const ProviderTile = ({ provider, selected, onToggle, hasTVPreferredFocus }: ProviderTileProps) => {
  const { isFocused, handleFocus, handleBlur } = useFocusState();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={provider.name}
      accessibilityState={{ checked: selected }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onToggle}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[styles.tile, selected && styles.selected, isFocused && styles.focused]}
      testID={`provider-${provider.providerId}`}
    >
      <Image source={{ uri: provider.logoUrl }} style={styles.logo} />
      <Text style={styles.name} numberOfLines={1}>
        {provider.name}
      </Text>
      {selected ? (
        <View style={styles.check} testID={`provider-${provider.providerId}-selected`}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    width: 104,
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: radius.md,
    borderWidth: focus.ringWidth,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.surfaceRaised, borderColor: colors.primary },
  focused: { borderColor: focus.ringColor, transform: [{ scale: focus.scale }] },
  logo: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  name: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  check: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
});

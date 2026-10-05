import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Provider } from '@firedrift/domain';
import { useFocusState } from '../focus';
import { colors, focus, fonts, radius } from '../theme';

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
      <Text style={[styles.name, isFocused && styles.nameFocused]} numberOfLines={1}>
        {provider.name}
      </Text>
      {selected ? (
        <View style={styles.check} testID={`provider-${provider.providerId}-selected`}>
          {/* A drawn tick: two strokes of an L turned 45°. */}
          <View style={styles.tick} />
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    width: 104,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: focus.ringWidth,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  // Selected: a warm outline and the tick. Focused: the amber fill, so the two never look alike.
  selected: { borderColor: 'rgba(255, 181, 71, 0.55)', backgroundColor: colors.surfaceRaised },
  focused: { backgroundColor: colors.primary, transform: [{ scale: focus.scale }], ...focus.shadow },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text, textAlign: 'center' },
  nameFocused: { color: colors.onPrimary },
  check: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 6,
    height: 10,
    marginTop: -2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.onPrimary,
    transform: [{ rotate: '45deg' }],
  },
});

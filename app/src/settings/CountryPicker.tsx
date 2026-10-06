import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FocusableButton } from '../components';
import { FocusGuideView } from '../focus';
import { colors, radius, spacing, typography } from '../theme';
import { COUNTRIES } from './settingsStore';

export interface CountryPickerProps {
  visible: boolean;
  current: string;
  onPick: (code: string) => void;
  onClose: () => void;
}

/** List of supported countries; the current one has focus. Back closes it. */
export const CountryPicker = ({ visible, current, onPick, onClose }: CountryPickerProps) => {
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FocusGuideView trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.panel}>
          <Text style={styles.title} testID="country-picker">
            Country
          </Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {COUNTRIES.map(country => (
              <FocusableButton
                key={country.code}
                label={country.code === current ? `✓ ${country.name}` : country.name}
                hasTVPreferredFocus={country.code === current}
                onPress={() => onPick(country.code)}
                style={styles.option}
                testID={`country-${country.code}`}
              />
            ))}
          </ScrollView>
        </FocusGuideView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    width: '80%',
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { ...typography.subtitle, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.xs },
  option: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});

import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { FocusableButton } from '../components';
import { FocusGuideView } from '../focus';
import { colors, radius, spacing, typography } from '../theme';

export type FeedMenuItem = 'Butler' | 'Settings' | 'About';

export interface FeedMenuProps {
  visible: boolean;
  onSelect: (item: FeedMenuItem) => void;
  onClose: () => void;
  onExit: () => void;
}

/** Opened with Back on the feed. Back again closes it. */
export const FeedMenu = ({ visible, onSelect, onClose, onExit }: FeedMenuProps) => {
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FocusGuideView trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.panel}>
          <Text style={styles.title} testID="feed-menu">
            FireDrift
          </Text>
          <FocusableButton
            label="Back to the feed"
            hasTVPreferredFocus
            onPress={onClose}
            testID="menu-feed"
          />
          <FocusableButton label="Butler" onPress={() => onSelect('Butler')} testID="menu-butler" />
          <FocusableButton
            label="Settings"
            onPress={() => onSelect('Settings')}
            testID="menu-settings"
          />
          <FocusableButton label="About" onPress={() => onSelect('About')} testID="menu-about" />
          <FocusableButton label="Exit" onPress={onExit} testID="menu-exit" />
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
    alignItems: 'flex-start',
  },
  panel: {
    height: '100%',
    width: 520,
    backgroundColor: colors.surface,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.md },
});

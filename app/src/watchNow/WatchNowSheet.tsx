import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SignalSource, TitleCard } from '@firedrift/domain';
import { FocusableButton } from '../components';
import { FocusGuideView, useFocusState } from '../focus';
import { signalQueue as defaultQueue, type SignalQueue } from '../signals';
import { colors, focus, radius, safeArea, spacing, typography } from '../theme';
import { launchService as defaultLaunch, type LaunchResult } from './launchService';
import { offerLabel, toServiceOptions, type ServiceOption } from './serviceOptions';

/** Services shown in the sheet at most. */
export const MAX_SHEET_OPTIONS = 4;

export interface WatchNowSheetProps {
  /** The title to watch; `null` hides the sheet. */
  title: TitleCard | null;
  onClose: () => void;
  /** Shown when nothing can be watched, so the feed is never blocked. */
  onNextTitle?: () => void;
  source: SignalSource;
  signals?: SignalQueue;
  launch?: (providerId: number, title: TitleCard) => Promise<LaunchResult>;
}

/**
 * FR-3: the services that offer a title, included ones first, rent and buy
 * marked. Choosing one queues a `watch_now` signal and opens the app, or
 * tells the user where to find the title when Vega cannot open it.
 */
export const WatchNowSheet = ({
  title,
  onClose,
  onNextTitle,
  source,
  signals = defaultQueue,
  launch = defaultLaunch,
}: WatchNowSheetProps) => {
  const [notOpened, setNotOpened] = useState<ServiceOption | null>(null);

  useEffect(() => setNotOpened(null), [title]);

  if (!title) return null;
  // The sheet must fit the 960×540 dp screen: the best few, included ones first.
  const options = toServiceOptions(title.providers).slice(0, MAX_SHEET_OPTIONS);

  const choose = async (option: ServiceOption) => {
    signals.enqueue({ tmdbId: title.tmdbId, type: title.type, kind: 'watch_now', source });
    const result = await launch(option.providerId, title);
    if (result.opened) onClose();
    else setNotOpened(option);
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FocusGuideView
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight
          style={styles.sheet}
        >
          <Text style={styles.title} numberOfLines={2} testID="watch-now-title">
            {notOpened ? `Watch on ${notOpened.name}` : `Watch ${title.name}`}
          </Text>

          {notOpened ? (
            <>
              <Text style={styles.message} testID="watch-now-fallback">
                Open {notOpened.name} on your Fire TV and search for “{title.name}”.
              </Text>
              <FocusableButton label="OK" hasTVPreferredFocus onPress={onClose} testID="watch-now-ok" />
            </>
          ) : options.length === 0 ? (
            <>
              <Text style={styles.message} testID="watch-now-empty">
                {title.name} is not available to stream in your country right now.
              </Text>
              <View style={styles.row}>
                {onNextTitle ? (
                  <FocusableButton
                    label="Next title"
                    hasTVPreferredFocus
                    onPress={onNextTitle}
                    testID="watch-now-next"
                  />
                ) : null}
                <FocusableButton
                  label="Close"
                  hasTVPreferredFocus={!onNextTitle}
                  onPress={onClose}
                  testID="watch-now-close"
                />
              </View>
            </>
          ) : (
            <View style={styles.list}>
              {options.map((option, index) => (
                <ServiceRow
                  key={option.providerId}
                  option={option}
                  hasTVPreferredFocus={index === 0}
                  onPress={() => choose(option)}
                />
              ))}
            </View>
          )}
        </FocusGuideView>
      </View>
    </Modal>
  );
};

const ServiceRow = ({
  option,
  hasTVPreferredFocus,
  onPress,
}: {
  option: ServiceOption;
  hasTVPreferredFocus: boolean;
  onPress: () => void;
}) => {
  const { isFocused, handleFocus, handleBlur } = useFocusState();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.name}, ${offerLabel(option)}`}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[styles.service, isFocused && styles.serviceFocused]}
      testID={`watch-now-service-${option.providerId}`}
    >
      {option.logoUrl ? (
        <Image source={{ uri: option.logoUrl }} style={styles.logo} />
      ) : (
        // No logo from TMDB: the service's initial in a disc, so every row keeps its mark.
        <View style={[styles.logo, styles.logoFallback]}>
          <Text style={styles.logoInitial}>{option.name.charAt(0)}</Text>
        </View>
      )}
      <Text style={[styles.serviceName, isFocused && styles.onAmber]} numberOfLines={1}>
        {option.name}
      </Text>
      <Text style={[styles.badge, isFocused && styles.onAmber]}>{offerLabel(option)}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // The panel slides over the right of the feed; the lit case stays in view.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13, 12, 11, 0.55)',
    alignItems: 'flex-end',
  },
  sheet: {
    height: '100%',
    width: '46%',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 217, 160, 0.18)',
    paddingLeft: spacing.xl,
    paddingRight: safeArea.horizontal + spacing.sm,
    paddingVertical: safeArea.vertical,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.md },
  list: { gap: spacing.sm },
  service: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  // A small lift: the panel's rows stay inside the title-safe edge.
  serviceFocused: {
    backgroundColor: colors.primary,
    transform: [{ scale: 1.02 }],
    ...focus.shadow,
  },
  logo: { width: 36, height: 36, borderRadius: 18 },
  logoFallback: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { ...typography.label, fontSize: 18, color: colors.text },
  serviceName: { ...typography.subtitle, color: colors.text, flex: 1 },
  badge: { ...typography.label, color: colors.textMuted },
  onAmber: { color: colors.onPrimary },
});

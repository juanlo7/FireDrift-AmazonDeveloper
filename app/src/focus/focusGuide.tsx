// Adapted from AmazonAppDev/vega-tv-interfaces-sample (src/services/focusGuide, MIT-0).
import type { ReactElement } from 'react';
import React, { useCallback, useRef, useState } from 'react';
import type { FocusGuideProps } from '@amazon-devices/react-native-kepler';
import { TVFocusGuideView, useTVEventHandler } from '@amazon-devices/react-native-kepler';
import type { HWEvent } from '@amazon-devices/react-native-kepler/Libraries/TV/TVTypes';

export type { HWEvent };

export type FocusGuideViewProps = FocusGuideProps & {
  children: ReactElement | ReactElement[];
};

/**
 * Groups focusable children. Use `autoFocus` to remember the last focused
 * child, `trapFocusUp/Down/Left/Right` to keep focus inside, and
 * `destinations` to send focus somewhere specific.
 */
export const FocusGuideView = ({ children, ...props }: FocusGuideViewProps) => (
  <TVFocusGuideView {...props}>{children}</TVFocusGuideView>
);

/** Listen to raw remote keys (`event.eventType`: `up`, `down`, `select`, `back`…). */
export const useRemoteKeys = (callback: (event: HWEvent) => void) =>
  useTVEventHandler(callback);

/** Tracks whether a focusable element has focus, for focus styles. */
export const useFocusState = ({
  onFocus,
  onBlur,
}: { onFocus?: () => void; onBlur?: () => void } = {}) => {
  const [isFocused, setIsFocused] = useState(false);
  const callbacks = useRef({ onFocus, onBlur });
  callbacks.current = { onFocus, onBlur };

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    callbacks.current.onFocus?.();
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    callbacks.current.onBlur?.();
  }, []);

  return { isFocused, handleFocus, handleBlur };
};

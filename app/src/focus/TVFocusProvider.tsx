// Adapted from AmazonAppDev/vega-tv-interfaces-sample (src/hooks/useTvFocus.tsx, MIT-0).
import type { ReactNode, RefObject } from 'react';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { View } from 'react-native';
import { findNodeHandle } from 'react-native';

type DestinationMap = Record<string, RefObject<View | null>>;

interface TVFocusContextValue {
  /** Register a focusable view under a unique key, e.g. `feed.watchNow`. */
  registerDestination: (key: string, ref: RefObject<View | null>) => void;
  unregisterDestination: (key: string) => void;
  /**
   * Native handles for registered keys, for `TVFocusGuideView destinations`
   * or `nextFocusUp/Down/Left/Right`. Unknown keys give `null`.
   */
  getNativeDestinations: (keys: string[]) => (number | null)[];
}

const TVFocusContext = createContext<TVFocusContextValue | null>(null);

/**
 * Lets components register focus destinations so other components can send
 * D-pad focus to them when native focus search picks the wrong element.
 */
export const TVFocusProvider = ({ children }: { children: ReactNode }) => {
  const [destinations, setDestinations] = useState<DestinationMap>({});

  const registerDestination = useCallback(
    (key: string, ref: RefObject<View | null>) =>
      setDestinations(prev => ({ ...prev, [key]: ref })),
    [],
  );

  const unregisterDestination = useCallback(
    (key: string) =>
      setDestinations(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      }),
    [],
  );

  const getNativeDestinations = useCallback(
    (keys: string[]) =>
      keys.map(key => {
        const view = destinations[key]?.current;
        return view ? findNodeHandle(view) : null;
      }),
    [destinations],
  );

  const value = useMemo(
    () => ({ registerDestination, unregisterDestination, getNativeDestinations }),
    [registerDestination, unregisterDestination, getNativeDestinations],
  );

  return <TVFocusContext.Provider value={value}>{children}</TVFocusContext.Provider>;
};

export const useTVFocus = (): TVFocusContextValue => {
  const context = useContext(TVFocusContext);
  if (!context) {
    throw new Error('useTVFocus must be used within a TVFocusProvider');
  }
  return context;
};

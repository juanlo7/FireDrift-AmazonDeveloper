import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { TVFocusProvider } from './focus';
import { TrailerSpike } from './spikes/TrailerSpike';
import { settingsStore } from './settings';
import { signalQueue } from './signals';
import { colors } from './theme';

export const App = () => {
  useEffect(() => {
    // Signals left from an earlier run go out as soon as the app opens.
    signalQueue.start().catch(cause => console.warn('[signals] could not start the queue', cause));
    // In case the profile never reached the backend (it was offline).
    settingsStore.sync().catch(cause => console.warn('[settings] could not send the profile', cause));
  }, []);

  return (
    <View style={styles.root}>
      {/* Settings load from the device in a few ms; they decide the first screen. */}
      <TVFocusProvider>
        <TrailerSpike />
      </TVFocusProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

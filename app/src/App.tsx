import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { TVFocusProvider } from './focus';
import { RootNavigator } from './navigation/RootNavigator';
import { settingsStore, useSettings } from './settings';
import { signalQueue } from './signals';
import { colors } from './theme';

export const App = () => {
  const settings = useSettings();

  useEffect(() => {
    // Signals left from an earlier run go out as soon as the app opens.
    signalQueue.start().catch(cause => console.warn('[signals] could not start the queue', cause));
    // In case the profile never reached the backend (it was offline).
    settingsStore.sync().catch(cause => console.warn('[settings] could not send the profile', cause));
  }, []);

  return (
    <View style={styles.root}>
      {/* Settings load from the device in a few ms; they decide the first screen. */}
      {settings ? (
        <TVFocusProvider>
          <RootNavigator firstRun={!settings.setupDone} />
        </TVFocusProvider>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

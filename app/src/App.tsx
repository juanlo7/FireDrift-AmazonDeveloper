import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { TVFocusProvider } from './focus';
import { RootNavigator } from './navigation/RootNavigator';
import { signalQueue } from './signals';
import { colors } from './theme';

export const App = () => {
  // Signals left from an earlier run go out as soon as the app opens.
  useEffect(() => {
    signalQueue.start().catch(cause => console.warn('[signals] could not start the queue', cause));
  }, []);

  return (
    <View style={styles.root}>
      <TVFocusProvider>
        <RootNavigator />
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

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TVFocusProvider } from './focus';
import { RootNavigator } from './navigation/RootNavigator';
import { colors } from './theme';

export const App = () => (
  <View style={styles.root}>
    <TVFocusProvider>
      <RootNavigator />
    </TVFocusProvider>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

import React from 'react';
import type { Theme } from '@amazon-devices/react-navigation__native';
import { NavigationContainer } from '@amazon-devices/react-navigation__native';
import type { NativeStackScreenProps } from '@amazon-devices/react-navigation__native-stack';
import { createNativeStackNavigator } from '@amazon-devices/react-navigation__native-stack';
import { AboutScreen } from '../screens/AboutScreen';
import { ButlerScreen } from '../screens/ButlerScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';

/** Every screen and its params. Add new screens here first. */
export type RootStackParamList = {
  Feed: undefined;
  Butler: undefined;
  Settings: undefined;
  About: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.surfaceRaised,
    notification: colors.primary,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

/** Feed is home. The remote's Back key pops the stack; on Feed it leaves the app. */
export const RootNavigator = () => (
  <NavigationContainer theme={navigationTheme}>
    <Stack.Navigator
      initialRouteName="Feed"
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="Butler" component={ButlerScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

/* eslint-env jest */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { App } from '../src/App';

/** The remote's Back key (see `test/mocks/backHandler.js`). */
export const pressBack = () =>
  act(() => {
    (BackHandler as unknown as { __pressBack: () => boolean }).__pressBack();
  });

/** Renders the app and skips the first-run setup if it shows, so the test starts on the feed. */
export const renderApp = async () => {
  const result = render(<App />);
  await waitFor(() => expect(screen.queryByTestId('screen-setup') ?? screen.queryByTestId('screen-feed')).toBeTruthy());
  if (screen.queryByTestId('screen-setup')) {
    fireEvent.press(screen.getByTestId('settings-skip'));
    await waitFor(() => expect(screen.getByTestId('screen-feed')).toBeTruthy());
  }
  return result;
};

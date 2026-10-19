import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { App } from '../src/App';
import { settingsStore } from '../src/settings';

// Its own file: the settings store is a module singleton, and here it must start empty.
describe('first run (FR-4)', () => {
  it('opens on the setup and goes to the feed after Skip, with the device country and all services', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('screen-setup')).toBeTruthy());
    expect(screen.queryByTestId('screen-feed')).toBeNull();

    fireEvent.press(screen.getByTestId('settings-skip'));
    await waitFor(() => expect(screen.getByTestId('feed-title')).toBeTruthy());
    expect(settingsStore.get()).toMatchObject({ services: [], showEverything: false, setupDone: true });
  });
});

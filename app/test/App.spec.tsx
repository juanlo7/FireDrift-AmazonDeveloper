import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { App } from '../src/App';

/** The remote's Back key (see `test/mocks/backHandler.js`). */
const pressBack = () =>
  act(() => {
    (BackHandler as unknown as { __pressBack: () => boolean }).__pressBack();
  });

/** Waits for the first cover, then opens the menu with Back. */
const openMenu = async () => {
  await waitFor(() => expect(screen.getByTestId('feed-title')).toBeTruthy());
  pressBack();
  await waitFor(() => expect(screen.getByTestId('feed-menu')).toBeTruthy());
};

describe('App', () => {
  it('opens on the feed and loads the pool from fixtures', async () => {
    render(<App />);
    expect(screen.getByTestId('screen-feed')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toHaveTextContent('Dark'));
  });

  it.each([
    ['menu-butler', 'screen-butler'],
    ['menu-settings', 'screen-settings'],
    ['menu-about', 'screen-about'],
  ])('%s opens %s and Back returns to the feed', async (menu, target) => {
    render(<App />);
    await openMenu();

    fireEvent.press(screen.getByTestId(menu));
    await waitFor(() => expect(screen.getByTestId(target)).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-back'));
    await waitFor(() => expect(screen.queryByTestId(target)).toBeNull());
    expect(screen.getByTestId('screen-feed')).toBeTruthy();
    expect(screen.queryByTestId('feed-menu')).toBeNull();
  });

  it('shows the TMDB and JustWatch attributions on About', async () => {
    render(<App />);
    await openMenu();
    fireEvent.press(screen.getByTestId('menu-about'));
    await waitFor(() => expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeTruthy());
    expect(screen.getByText(/JustWatch/)).toBeTruthy();
  });
});

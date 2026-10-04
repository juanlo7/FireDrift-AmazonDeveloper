import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { App } from '../src/App';

describe('App', () => {
  it('opens on the feed and loads the pool from fixtures', async () => {
    render(<App />);
    expect(screen.getByTestId('screen-feed')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('feed-status')).toHaveTextContent(/titles/));
  });

  it.each([
    ['menu-butler', 'screen-butler'],
    ['menu-settings', 'screen-settings'],
    ['menu-about', 'screen-about'],
  ])('%s opens %s and Back returns to the feed', async (menu, target) => {
    render(<App />);

    fireEvent.press(screen.getByTestId(menu));
    await waitFor(() => expect(screen.getByTestId(target)).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-back'));
    await waitFor(() => expect(screen.queryByTestId(target)).toBeNull());
    expect(screen.getByTestId('screen-feed')).toBeTruthy();
  });

  it('shows the TMDB and JustWatch attributions on About', async () => {
    render(<App />);
    fireEvent.press(screen.getByTestId('menu-about'));
    await waitFor(() => expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeTruthy());
    expect(screen.getByText(/JustWatch/)).toBeTruthy();
  });
});

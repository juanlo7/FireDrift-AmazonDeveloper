import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { pressBack, renderApp } from './renderApp';

/** Waits for the first cover, then opens the menu with Back. */
const openMenu = async () => {
  await waitFor(() => expect(screen.getByTestId('feed-title')).toBeTruthy());
  pressBack();
  await waitFor(() => expect(screen.getByTestId('feed-menu')).toBeTruthy());
};

describe('App', () => {
  it('opens on the feed and loads the pool from fixtures', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toHaveTextContent('Dark'));
  });

  it.each([
    ['menu-butler', 'screen-butler'],
    ['menu-settings', 'screen-settings'],
    ['menu-about', 'screen-about'],
  ])('%s opens %s and Back returns to the feed', async (menu, target) => {
    await renderApp();
    await openMenu();

    fireEvent.press(screen.getByTestId(menu));
    await waitFor(() => expect(screen.getByTestId(target)).toBeTruthy());

    pressBack();
    await waitFor(() => expect(screen.queryByTestId(target)).toBeNull());
    expect(screen.getByTestId('screen-feed')).toBeTruthy();
    expect(screen.queryByTestId('feed-menu')).toBeNull();
  });

  it('shows the TMDB and JustWatch attributions on About', async () => {
    await renderApp();
    await openMenu();
    fireEvent.press(screen.getByTestId('menu-about'));
    await waitFor(() => expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeTruthy());
    expect(screen.getByText(/JustWatch/)).toBeTruthy();
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProviderOffer, TitleCard } from '@firedrift/domain';
import { createMemorySignalQueue } from '../src/signals';
import { launchService, offerLabel, toServiceOptions, WatchNowSheet } from '../src/watchNow';

const title: TitleCard = require('@firedrift/domain/fixtures/rest/title.response.json');

const offer = (providerId: number, kind: ProviderOffer['offer'], name = `P${providerId}`) => ({
  providerId,
  name,
  logoUrl: 'https://image.tmdb.org/t/p/w92/x.jpg',
  offer: kind,
});

describe('toServiceOptions', () => {
  it('puts included services first and merges rent and buy of one provider', () => {
    const options = toServiceOptions([
      offer(2, 'rent', 'Apple TV'),
      offer(119, 'subscription', 'Prime'),
      offer(2, 'buy', 'Apple TV'),
    ]);
    expect(options.map(o => [o.name, offerLabel(o)])).toEqual([
      ['Prime', 'Included'],
      ['Apple TV', 'Rent · Buy'],
    ]);
  });

  it('keeps the backend order (my services first) inside each group', () => {
    const options = toServiceOptions([offer(8, 'subscription'), offer(119, 'ads')]);
    expect(options.map(o => o.providerId)).toEqual([8, 119]);
  });
});

describe('launchService', () => {
  it('opens the first candidate the system accepts', async () => {
    const linking = {
      canOpenURL: jest.fn().mockRejectedValueOnce(new Error('Can not open URL')).mockResolvedValue(true),
      openURL: jest.fn().mockResolvedValue(undefined),
    };
    const result = await launchService(8, title, linking);
    expect(result).toEqual({ opened: true, url: 'https://www.netflix.com' });
  });

  it('reports not opened when every candidate throws, as on the VVD', async () => {
    const linking = {
      canOpenURL: jest.fn().mockRejectedValue(new Error('Can not open URL')),
      openURL: jest.fn(),
    };
    const result = await launchService(8, title, linking);
    expect(result.opened).toBe(false);
    expect(linking.openURL).not.toHaveBeenCalled();
  });

  it('reports not opened for a provider without known links', async () => {
    const linking = { canOpenURL: jest.fn(), openURL: jest.fn() };
    expect(await launchService(424242, title, linking)).toEqual({ opened: false, tried: [] });
  });
});

describe('WatchNowSheet', () => {
  const setup = (card: TitleCard, opened: boolean) => {
    const signals = createMemorySignalQueue();
    const launch = jest.fn().mockResolvedValue(opened ? { opened: true, url: 'x' } : { opened: false, tried: [] });
    const onClose = jest.fn();
    const onNextTitle = jest.fn();
    render(
      <WatchNowSheet
        title={card}
        source="feed"
        signals={signals}
        launch={launch}
        onClose={onClose}
        onNextTitle={onNextTitle}
      />,
    );
    return { signals, launch, onClose, onNextTitle };
  };

  it('queues a watch_now signal and closes when the app opens', async () => {
    const { signals, launch, onClose } = setup(title, true);

    fireEvent.press(screen.getByTestId('watch-now-service-8'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(launch).toHaveBeenCalledWith(8, title);
    expect(signals.pending).toHaveLength(1);
    expect(signals.pending[0]).toMatchObject({
      tmdbId: title.tmdbId,
      type: title.type,
      kind: 'watch_now',
      source: 'feed',
    });
    expect(signals.pending[0]?.signalId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tells the user where to find the title when the app cannot be opened', async () => {
    const { onClose } = setup(title, false);

    fireEvent.press(screen.getByTestId('watch-now-service-8'));

    await waitFor(() =>
      expect(screen.getByTestId('watch-now-fallback')).toHaveTextContent(
        'Open Netflix on your Fire TV and search for “Dark”.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a clear message and a way on when nothing streams the title', () => {
    const { onNextTitle, signals } = setup({ ...title, providers: [], onMyServices: false }, true);

    expect(screen.getByTestId('watch-now-empty')).toHaveTextContent(/not available to stream/);
    fireEvent.press(screen.getByTestId('watch-now-next'));
    expect(onNextTitle).toHaveBeenCalled();
    expect(signals.pending).toHaveLength(0);
  });

  it('marks rent and buy', () => {
    setup({ ...title, providers: [offer(119, 'subscription'), offer(2, 'rent'), offer(2, 'buy')] }, true);
    expect(screen.getByLabelText('P2, Rent · Buy')).toBeTruthy();
    expect(screen.getByLabelText('P119, Included')).toBeTruthy();
  });
});

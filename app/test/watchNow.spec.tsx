import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProviderOffer, TitleCard } from '@firedrift/domain';
import { createMemorySignalQueue } from '../src/signals';
import { launchService, offerLabel, serviceLinks, toServiceOptions, WatchNowSheet } from '../src/watchNow';

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

  it('shows a service once when TMDB lists its plans separately', () => {
    const options = toServiceOptions([
      offer(8, 'subscription', 'Netflix'),
      offer(1796, 'subscription', 'Netflix Standard with Ads'),
      offer(531, 'subscription', 'Paramount Plus Premium'),
      offer(582, 'subscription', 'Paramount Plus Essential'),
    ]);
    expect(options.map(o => o.name)).toEqual(['Netflix', 'Paramount Plus Premium', 'Paramount Plus Essential']);
  });

  it('keeps the backend order (my services first) inside each group', () => {
    const options = toServiceOptions([offer(8, 'subscription'), offer(119, 'ads')]);
    expect(options.map(o => o.providerId)).toEqual([8, 119]);
  });
});

describe('serviceLinks', () => {
  it('tries the app home with pkg:// first when the component ID is known', () => {
    expect(serviceLinks(8, title, { 8: 'com.example.streaming.main' })).toEqual([
      'pkg://com.example.streaming.main',
      'https://www.netflix.com/search?q=Dark',
    ]);
  });

  it('only has web links when the component ID is unknown', () => {
    expect(serviceLinks(8, title, {})).toEqual(['https://www.netflix.com/search?q=Dark']);
    expect(serviceLinks(424242, title, {})).toEqual([]);
  });
});

describe('launchService', () => {
  const links = ['pkg://com.example.streaming.main', 'https://www.netflix.com/search?q=Dark'];

  it('stops at the first link that opens', async () => {
    const linking = { openURL: jest.fn().mockResolvedValue(undefined) };
    expect(await launchService(8, title, linking, links)).toEqual({ opened: true, url: links[0] });
    expect(linking.openURL).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next link when one fails', async () => {
    const linking = {
      openURL: jest.fn().mockRejectedValueOnce(new Error('Failed opening URL')).mockResolvedValue(undefined),
    };
    expect(await launchService(8, title, linking, links)).toEqual({ opened: true, url: links[1] });
  });

  it('reports not opened when every link fails, as on the VVD without the app', async () => {
    const linking = { openURL: jest.fn().mockRejectedValue(new Error('Failed opening URL')) };
    expect(await launchService(8, title, linking, links)).toEqual({ opened: false, tried: links });
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

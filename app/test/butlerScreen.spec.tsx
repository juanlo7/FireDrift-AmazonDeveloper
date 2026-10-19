import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AgentToAppEvent, TitleCard } from '@firedrift/domain';
import {
  butlerReducer,
  characterState,
  createSpeechPlayer,
  initialView,
  pickFromPool,
  STARTER_CHIPS,
  type AudioLike,
  type ButlerView,
} from '../src/butler';
import { pressBack, renderApp } from './renderApp';

const fixture = (name: string): AgentToAppEvent =>
  require(`@firedrift/domain/fixtures/socket/agent-to-app/${name}.json`);
const pool: { titles: TitleCard[] } = require('@firedrift/domain/fixtures/rest/pool.response.json');

const play = (...events: AgentToAppEvent[]) =>
  events.reduce<ButlerView>((view, event) => butlerReducer(view, { t: 'agent', event }), initialView);

describe('butler view', () => {
  it('follows a turn: thinking, the answer, the suggestion, chips, then idle', () => {
    let view = butlerReducer(initialView, { t: 'asked' });
    expect(characterState(view)).toBe('thinking');
    expect(view.chips).toEqual([]);

    view = [fixture('thinking'), fixture('answer-delta'), fixture('answer-delta'), fixture('suggestion'), fixture('chips')]
      .reduce<ButlerView>((v, event) => butlerReducer(v, { t: 'agent', event }), view);
    const delta = (fixture('answer-delta') as { text: string }).text;
    expect(view.answer).toBe(`${delta} ${delta}`);
    expect(view.suggestion?.title.tmdbId).toBe((fixture('suggestion') as { title: TitleCard }).title.tmdbId);
    expect(view.chips.length).toBeGreaterThan(0);

    view = butlerReducer(view, { t: 'talking', talking: true });
    expect(characterState(view)).toBe('speaking');
    view = butlerReducer(butlerReducer(view, { t: 'talking', talking: false }), { t: 'agent', event: fixture('answer-done') });
    expect(characterState(view)).toBe('idle');
    expect(characterState(butlerReducer(view, { t: 'listening', listening: true }))).toBe('listening');
    // Holding the talk button wins over speech that is still playing.
    const talking = butlerReducer(view, { t: 'talking', talking: true });
    expect(characterState(butlerReducer(talking, { t: 'listening', listening: true }))).toBe('listening');
  });

  it('keeps the fallback and its chips, and answers the next chips locally', () => {
    const view = play(fixture('fallback'));
    expect(characterState(view)).toBe('fallback');
    expect(view.answer).toBe((fixture('fallback') as { message: string }).message);
    expect(butlerReducer(view, { t: 'asked' })).toBe(view);
  });

  it('starts with chips that need no title on screen, and shows taste changes until cleared', () => {
    expect(initialView.chips).toEqual(STARTER_CHIPS);
    const view = play(fixture('weights-changed'));
    expect(view.weightChange).not.toBeNull();
    expect(butlerReducer(view, { t: 'weightsCleared' }).weightChange).toBeNull();
  });
});

describe('picks from the taste pool', () => {
  const base = pool.titles[0];
  const titles: TitleCard[] = [
    { ...base, tmdbId: 1, runtimeMinutes: 150, genres: ['Drama'] },
    { ...base, tmdbId: 2, runtimeMinutes: 140, genres: ['Comedy'] },
    { ...base, tmdbId: 3, runtimeMinutes: 90, genres: ['Drama'] },
  ];
  const current = { ...base, tmdbId: 99, runtimeMinutes: 120, genres: ['Drama'] };

  it('fits the chip when it can and never repeats a title', () => {
    const shorter = pickFromPool(titles, new Set(), current, 'shorter');
    expect(shorter?.runtimeMinutes ?? 0).toBeLessThan(120);
    const different = pickFromPool(titles, new Set(), current, 'different_genre');
    expect(different?.genres).not.toContain('Drama');

    const shown = new Set(titles.map(t => `${t.type}:${t.tmdbId}`));
    expect(pickFromPool(titles, shown, current, 'surprise_me')).toBeNull();
  });
});

describe('speech player', () => {
  const fakeAudio = () => {
    const listeners: Record<string, () => void> = {};
    const audio: AudioLike & { fire(type: string): void; played: string[]; time: number } = {
      src: '',
      autoplay: true,
      played: [],
      time: 0,
      get currentTime() {
        return this.time;
      },
      initialize: async () => undefined,
      deinitialize: async () => undefined,
      load: () => undefined,
      play: async function (this: { src: string; played: string[] }) {
        this.played.push(this.src);
      },
      pause: () => undefined,
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      },
      fire: type => listeners[type]?.(),
    };
    return audio;
  };
  const speech = (url?: string) => ({
    ...(fixture('speech') as Extract<AgentToAppEvent, { t: 'speech' }>),
    audioUrl: url,
  });
  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('plays sentences in order, reports talking and gestures, and skips missing or failed audio', async () => {
    const audio = fakeAudio();
    const talking: boolean[] = [];
    const gestures: string[] = [];
    const onIdle = jest.fn();
    const player = createSpeechPlayer(
      { onTalking: t => talking.push(t), onGesture: g => gestures.push(g), onIdle },
      () => audio,
    );

    player.enqueue(speech('https://a/1.mp3'));
    player.enqueue(speech());
    player.enqueue(speech('https://a/3.mp3'));
    await flush();
    expect(audio.played).toEqual(['https://a/1.mp3']);

    audio.time = 0.3; // seconds: inside the sentence, after the gesture
    audio.fire('timeupdate');
    expect(talking).toEqual([true]);
    expect(gestures).toEqual(speech().gestures.map(g => g.name));

    audio.fire('ended');
    await flush();
    expect(audio.played).toEqual(['https://a/1.mp3', 'https://a/3.mp3']);
    audio.fire('error');
    expect(talking).toEqual([true, false]);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});

describe('butler screen', () => {
  it('answers a chip with the fake socket: text, suggestion card and new chips', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toBeTruthy());
    pressBack();
    await waitFor(() => expect(screen.getByTestId('feed-menu')).toBeTruthy());
    fireEvent.press(screen.getByTestId('menu-butler'));
    await waitFor(() => expect(screen.getByTestId('screen-butler')).toBeTruthy());
    expect(screen.getByTestId('butler-state')).toHaveTextContent('At your service');

    fireEvent.press(screen.getByTestId('butler-chip-surprise_me'));
    await waitFor(() => expect(screen.getByTestId('butler-suggestion')).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId('butler-chip-more_like_this')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('butler-answer')).toHaveTextContent((fixture('answer-delta') as { text: string }).text);
    expect(screen.getByTestId('butler-watch-now')).toBeTruthy();
  });

  it('shows listening at once on the talk button, and a voice turn is answered as text with the chips back', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('feed-title')).toBeTruthy());
    pressBack();
    await waitFor(() => expect(screen.getByTestId('feed-menu')).toBeTruthy());
    fireEvent.press(screen.getByTestId('menu-butler'));
    await waitFor(() => expect(screen.getByTestId('screen-butler')).toBeTruthy());
    // Wait for the session to open, as the talk button does nothing before it.
    await waitFor(() => expect(screen.getByTestId('butler-talk')).toBeTruthy());
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    fireEvent(screen.getByTestId('butler-talk'), 'pressIn');
    expect(screen.getByTestId('butler-state')).toHaveTextContent('Listening');
    await new Promise<void>(resolve => setTimeout(resolve, 250)); // the silent mic gives a frame
    fireEvent(screen.getByTestId('butler-talk'), 'pressOut');

    // No Polly audio in the fixtures: the answer still shows as text.
    await waitFor(() => expect(screen.getByTestId('butler-answer')).toHaveTextContent(
      (fixture('answer-delta') as { text: string }).text), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId('butler-chip-more_like_this')).toBeTruthy(), { timeout: 5000 });
  });
});

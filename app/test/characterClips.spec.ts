import { Gesture } from '@firedrift/domain';
import {
  clipReducer,
  clipUrl,
  createClipPlayer,
  currentClip,
  initialClipView,
  stateClip,
  type ClipView,
  type VideoLike,
} from '../src/butler';

const run = (view: ClipView, ...actions: Parameters<typeof clipReducer>[1][]) =>
  actions.reduce(clipReducer, view);

describe('clip files', () => {
  it('packages every clip the app plays in app/assets/butler', () => {
    const states = ['idle', 'listening', 'thinking', 'speaking', 'fallback'] as const;
    const urls = [...states.map(state => clipUrl(stateClip(state))), ...Gesture.options.map(g => clipUrl(`gesture-${g}`))];
    // The build packages app/assets/ as /pkg/assets/.
    const missing = urls.filter(url => {
      try {
        require(url.replace('file:///pkg/', '../'));
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });
});

describe('clip selection', () => {
  it('maps each state to its looping clip, and fallback to idle', () => {
    expect(stateClip('listening')).toBe('listening');
    expect(stateClip('fallback')).toBe('idle');
    expect(currentClip({...initialClipView, state: 'speaking'})).toEqual({
      name: 'speaking',
      url: 'file:///pkg/assets/butler/speaking.mp4',
      loop: true,
    });
    expect(currentClip({...initialClipView, state: 'fallback'})?.url).toBe(
      clipUrl('idle'),
    );
  });

  it('plays a gesture once over the state, then returns to the loop', () => {
    let view = run(
      initialClipView,
      {t: 'state', state: 'speaking'},
      {t: 'gesture', gesture: 'nod'},
    );
    expect(currentClip(view)).toEqual({
      name: 'gesture-nod',
      url: clipUrl('gesture-nod'),
      loop: false,
    });

    // The state changes during the gesture: the gesture finishes first.
    view = run(view, {t: 'state', state: 'idle'});
    expect(currentClip(view)?.name).toBe('gesture-nod');
    view = run(view, {t: 'gestureEnded'});
    expect(currentClip(view)).toMatchObject({name: 'idle', loop: true});
  });

  it('skips a broken gesture clip but gives up the player on a broken state clip', () => {
    const gesturing = run(initialClipView, {t: 'gesture', gesture: 'bow'});
    const skipped = run(gesturing, {t: 'error'});
    expect(skipped.failed).toBe(false);
    expect(currentClip(skipped)?.name).toBe('idle');

    const failed = run(initialClipView, {t: 'error'});
    expect(failed.failed).toBe(true);
    expect(currentClip(failed)).toBeNull();
    // Nothing brings the player back by itself.
    expect(
      currentClip(run(failed, {t: 'state', state: 'listening'})),
    ).toBeNull();
  });
});

describe('clip player', () => {
  const fakeVideo = () => {
    const listeners: Record<string, () => void> = {};
    const video: VideoLike & {
      fire(type: string): void;
      loads: string[];
      surface: string | null;
    } = {
      src: '',
      loop: false,
      muted: false,
      autoplay: false,
      loads: [],
      surface: null,
      initialize: async () => undefined,
      deinitialize: async () => undefined,
      load() {
        this.loads.push(`${this.src} loop=${this.loop}`);
      },
      setSurfaceHandle(handle) {
        this.surface = handle;
      },
      clearSurfaceHandle() {
        this.surface = null;
      },
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      },
      fire: (type) => listeners[type]?.(),
    };
    return video;
  };
  const handlers = () => ({
    onPlaying: jest.fn(),
    onEnded: jest.fn(),
    onError: jest.fn(),
  });

  it('starts the clip asked before the surface existed, and switches clips', async () => {
    const video = fakeVideo();
    const player = createClipPlayer(handlers(), () => video);
    player.play(currentClip({...initialClipView, state: 'thinking'})!);
    await player.attach('surface-1');
    expect(video.surface).toBe('surface-1');
    expect(video.muted).toBe(true);
    expect(video.loads).toEqual([`${clipUrl('thinking')} loop=true`]);

    player.play(currentClip({...initialClipView, gesture: 'shrug'})!);
    expect(video.loads[1]).toBe(`${clipUrl('gesture-shrug')} loop=false`);
  });

  it('reports playing, ended and errors, and reports a player that cannot start', async () => {
    const video = fakeVideo();
    const h = handlers();
    const player = createClipPlayer(h, () => video);
    await player.attach('s');
    video.fire('playing');
    video.fire('ended');
    video.fire('error');
    expect(h.onPlaying).toHaveBeenCalledTimes(1);
    expect(h.onEnded).toHaveBeenCalledTimes(1);
    expect(h.onError).toHaveBeenCalledTimes(1);

    const broken = handlers();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await createClipPlayer(broken, () => {
      throw new Error('no native module');
    }).attach('s');
    expect(broken.onError).toHaveBeenCalledTimes(1);
  });
});

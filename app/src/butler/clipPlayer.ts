import type { Clip } from './clips';

/** The part of the W3C media `VideoPlayer` the clip player uses, so tests can pass a fake. */
export interface VideoLike {
  src: string;
  loop: boolean;
  muted: boolean;
  autoplay: boolean;
  initialize(): Promise<void>;
  deinitialize(): Promise<void>;
  load(): void;
  setSurfaceHandle(handle: string): void;
  clearSurfaceHandle(handle: string): void;
  addEventListener(type: string, listener: () => void): void;
}

export interface ClipPlayerHandlers {
  /** A clip is on screen: the placeholder can go. */
  onPlaying(): void;
  /** A one-shot clip ended. */
  onEnded(): void;
  /** The player or a clip failed (for example the VVD cannot decode video, spike V5). */
  onError(): void;
}

const createW3cVideo = (): VideoLike => {
  // Loaded on first use: the native module exists only on Vega.
  const { VideoPlayer } = require('@amazon-devices/react-native-w3cmedia/dist/headless');
  return new VideoPlayer() as VideoLike;
};

/**
 * The butler's one clip player (NFR-2): URL mode on one surface. `play()` can be
 * called before the surface exists; the last clip asked for starts when it does.
 */
export const createClipPlayer = (handlers: ClipPlayerHandlers, createVideo: () => VideoLike = createW3cVideo) => {
  let video: VideoLike | null = null;
  let surface: string | null = null;
  /** The surface whose player is still starting. */
  let attaching: string | null = null;
  let wanted: Clip | null = null;
  let shown: Clip | null = null;
  let disposed = false;

  const start = () => {
    if (!video || !wanted || wanted === shown) return;
    shown = wanted;
    video.loop = wanted.loop;
    video.src = wanted.url;
    video.load();
  };

  const release = async () => {
    const old = video;
    const handle = surface;
    video = null;
    surface = null;
    shown = null;
    if (!old) return;
    try {
      if (handle) old.clearSurfaceHandle(handle);
      await old.deinitialize();
    } catch {
      // The screen is closing; nothing more to do.
    }
  };

  const attach = async (handle: string) => {
    // Vega reports one surface twice; a second player on it fights the first for the frames.
    if (handle === surface || handle === attaching) return;
    attaching = handle;
    try {
      const created = createVideo();
      await created.initialize();
      if (disposed) {
        await created.deinitialize();
        return;
      }
      created.setSurfaceHandle(handle);
      created.autoplay = true;
      created.muted = true;
      created.addEventListener('playing', () => handlers.onPlaying());
      created.addEventListener('ended', () => handlers.onEnded());
      created.addEventListener('error', () => {
        console.warn('[butler] clip player error; showing the placeholder');
        shown = null;
        handlers.onError();
      });
      video = created;
      surface = handle;
      start();
    } catch (cause) {
      console.warn('[butler] clip player unavailable', cause);
      handlers.onError();
    } finally {
      attaching = null;
    }
  };

  return {
    attach,
    detach: release,
    play: (clip: Clip) => {
      wanted = clip;
      start();
    },
    dispose: () => {
      disposed = true;
      return release();
    },
  };
};

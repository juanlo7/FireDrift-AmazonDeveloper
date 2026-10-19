import type { Gesture } from '@firedrift/domain';
import type { CharacterState } from './butlerModel';

/** The clip files of `assets/butler/` (contracts.md, section 4), without `.mp4`. */
export type ClipName = 'idle' | 'listening' | 'thinking' | 'speaking' | `gesture-${Gesture}`;

/**
 * Clips are read by path from the package, not with `require()`: the app builds
 * without them, and a missing file is an error the player turns into the placeholder.
 * A plain path, not a `file://` URL: the player opens the string as a file name.
 */
export const clipUrl = (name: ClipName): string => `/pkg/assets/butler/${name}.mp4`;

/** One loop per state; `fallback` shows the `idle` clip (domain.md). */
export const stateClip = (state: CharacterState): ClipName => (state === 'fallback' ? 'idle' : state);

export interface Clip {
  name: ClipName;
  url: string;
  /** State clips loop. A gesture plays once. */
  loop: boolean;
}

export interface ClipView {
  state: CharacterState;
  /** The gesture playing now, over the state. */
  gesture: Gesture | null;
  /** The player failed on a state clip: show the placeholder figure. */
  failed: boolean;
}

export const initialClipView: ClipView = { state: 'idle', gesture: null, failed: false };

export type ClipAction =
  | { t: 'state'; state: CharacterState }
  | { t: 'gesture'; gesture: Gesture }
  | { t: 'gestureEnded' }
  | { t: 'error' };

export const clipReducer = (view: ClipView, action: ClipAction): ClipView => {
  switch (action.t) {
    case 'state':
      // A gesture in progress finishes first, then the loop of the new state starts.
      return action.state === view.state ? view : { ...view, state: action.state };
    case 'gesture':
      return { ...view, gesture: action.gesture };
    case 'gestureEnded':
      return view.gesture ? { ...view, gesture: null } : view;
    case 'error':
      // A broken gesture clip is skipped; a broken state clip means no usable player.
      return view.gesture ? { ...view, gesture: null } : { ...view, failed: true };
  }
};

/** What the one clip player must play now, or `null` to show the placeholder. */
export const currentClip = (view: ClipView): Clip | null => {
  if (view.failed) return null;
  if (view.gesture) {
    const name: ClipName = `gesture-${view.gesture}`;
    return { name, url: clipUrl(name), loop: false };
  }
  const name = stateClip(view.state);
  return { name, url: clipUrl(name), loop: true };
};

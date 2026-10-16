import type { AgentToAppEvent, Chip, TitleCard } from '@firedrift/domain';

type WeightsChangedEvent = Extract<AgentToAppEvent, { t: 'weights.changed' }>;

/** The character's states (domain.md): one clip loop each. */
export type CharacterState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'fallback';

export interface Suggestion {
  title: TitleCard;
  reason: string;
}

export interface ButlerView {
  /** What the butler said in the current turn, without gesture markers. */
  answer: string;
  /** What the user said, when the turn started with the voice. */
  heard: string;
  suggestion: Suggestion | null;
  chips: Chip[];
  /** The last taste change, offered with Undo and Reset. */
  weightChange: WeightsChangedEvent['change'] | null;
  /** The agent is answering: from the user's input to `answer.done`. */
  waiting: boolean;
  /** Polly words are being said. */
  talking: boolean;
  /** The talk button is held (push to talk, #60). */
  listening: boolean;
  /** Set by `fallback`: the session is over and chips come from the taste algorithm. */
  fallback: { reason: string; message: string } | null;
}

/** Before the first turn: what the agent offers without a title on screen (`agent/brain/chips.py`). */
export const STARTER_CHIPS: Chip[] = [
  { id: 'surprise_me', label: 'Surprise me' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'different_genre', label: 'Different genre' },
];

export const initialView: ButlerView = {
  answer: '',
  heard: '',
  suggestion: null,
  chips: STARTER_CHIPS,
  weightChange: null,
  waiting: false,
  talking: false,
  listening: false,
  fallback: null,
};

export type ButlerAction =
  | { t: 'agent'; event: AgentToAppEvent }
  | { t: 'asked' }
  | { t: 'talking'; talking: boolean }
  | { t: 'listening'; listening: boolean }
  | { t: 'suggested'; suggestion: Suggestion }
  | { t: 'weightsCleared' };

/** Speech events go to the audio player, not to the view. */
export const butlerReducer = (view: ButlerView, action: ButlerAction): ButlerView => {
  switch (action.t) {
    case 'asked':
      // In fallback the chips stay: the app answers them from the taste algorithm.
      return view.fallback ? view : { ...view, answer: '', heard: '', waiting: true, chips: [] };
    case 'talking':
      return { ...view, talking: action.talking };
    case 'listening':
      return { ...view, listening: action.listening };
    case 'suggested':
      return { ...view, suggestion: action.suggestion };
    case 'weightsCleared':
      return { ...view, weightChange: null };
    case 'agent':
      break;
  }
  const event = action.event;
  switch (event.t) {
    case 'transcript':
      return { ...view, heard: event.text };
    case 'thinking':
      return { ...view, waiting: true };
    case 'answer.delta':
      return { ...view, answer: view.answer ? `${view.answer} ${event.text}` : event.text };
    case 'suggestion':
      return { ...view, suggestion: { title: event.title, reason: event.reason } };
    case 'chips':
      return { ...view, chips: event.chips };
    case 'weights.changed':
      return { ...view, weightChange: event.change };
    case 'answer.done':
      return { ...view, waiting: false };
    case 'fallback':
      return {
        ...view,
        waiting: false,
        answer: event.message,
        chips: event.chips,
        fallback: { reason: event.reason, message: event.message },
      };
    default:
      return view;
  }
};

/** The character follows the turn: listening, then talking, then waiting; fallback is sticky. */
export const characterState = (view: ButlerView): CharacterState => {
  if (view.listening) return 'listening';
  if (view.talking) return 'speaking';
  if (view.fallback) return 'fallback';
  if (view.waiting) return 'thinking';
  return 'idle';
};

const sharesGenre = (a: TitleCard, b: TitleCard) => a.genres.some(genre => b.genres.includes(genre));

/**
 * Without the agent, a chip picks the next title from a taste pool: "Shorter"
 * looks for a shorter one, "Different genre" for no shared genre, "More like
 * this" for a shared one. If none fits, any title not shown yet.
 */
export const pickFromPool = (
  pool: TitleCard[],
  shown: ReadonlySet<string>,
  current: TitleCard | null,
  chipId: string,
): TitleCard | null => {
  const fresh = pool.filter(title => !shown.has(`${title.type}:${title.tmdbId}`));
  const fits: Record<string, (title: TitleCard) => boolean> = {
    shorter: title =>
      !current?.runtimeMinutes || (title.runtimeMinutes ?? Infinity) < current.runtimeMinutes,
    different_genre: title => !current || !sharesGenre(title, current),
    more_like_this: title => !current || sharesGenre(title, current),
  };
  const fit = fits[chipId];
  return (fit && fresh.find(fit)) || fresh[0] || null;
};

export const FALLBACK_REASONS: Record<string, string> = {
  shorter: 'A shorter pick from your taste.',
  different_genre: 'Something different, from your taste.',
  more_like_this: 'Close to the last one, from your taste.',
};

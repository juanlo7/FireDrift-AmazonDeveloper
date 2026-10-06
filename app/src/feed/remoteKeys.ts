import type { HWEvent } from '../focus';

/** What a remote key does on the feed (FR-1). Back opens the menu through `BackHandler`. */
export type FeedCommand = 'next' | 'previous' | 'like' | 'skip' | 'watchNow';

const KEY_COMMANDS: Record<string, FeedCommand> = {
  down: 'next',
  up: 'previous',
  right: 'like',
  left: 'skip',
  // The remote's OK sends `select`; Enter on the virtual device's keyboard sends `enter`.
  select: 'watchNow',
  enter: 'watchNow',
};

/** Maps a key press to a feed command. Key releases (`eventKeyAction` 1) do nothing. */
export const feedCommandFor = (event: HWEvent): FeedCommand | null =>
  event.eventKeyAction === 1 ? null : (KEY_COMMANDS[event.eventType] ?? null);

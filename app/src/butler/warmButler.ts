import type { AgentToAppEvent } from '@firedrift/domain';
import type { ButlerHandlers, ButlerSession, ButlerSessionInfo, OpenButlerSession } from './butlerSocket';

/** The agent closes a session after 10 idle minutes; a warm one is not handed out after this. */
export const WARM_FOR_MS = 9 * 60_000;

const sameInfo = (a: ButlerSessionInfo, b: ButlerSessionInfo) =>
  a.profileId === b.profileId &&
  a.country === b.country &&
  a.hasMic === b.hasMic &&
  [...a.services].sort().join(',') === [...b.services].sort().join(',');

interface WarmSession {
  info: ButlerSessionInfo;
  session: ButlerSession;
  openedAt: number;
  events: AgentToAppEvent[];
  audio: ArrayBuffer[];
  handlers: ButlerHandlers | null;
  dead: boolean;
}

/**
 * Keeps one butler session open ahead of time. A new session waits about 9 s
 * for sign-in and for AgentCore to start it; opened while the user browses the
 * feed, the butler screen gets it ready and its first answer only waits for
 * the model. `open` hands out the warm session when it matches and is alive,
 * or opens a new one.
 */
export const createWarmButler = (openSession: OpenButlerSession, now: () => number = Date.now) => {
  let warm: WarmSession | null = null;

  const usable = (info: ButlerSessionInfo) =>
    warm !== null && !warm.dead && now() - warm.openedAt < WARM_FOR_MS && sameInfo(warm.info, info);

  const discard = () => {
    if (warm && !warm.dead) warm.session.end();
    warm = null;
  };

  /** Opens a session in the background, unless a matching one is already warm. */
  const prepare = (info: ButlerSessionInfo) => {
    if (usable(info)) return;
    discard();
    const slot: WarmSession = {
      info,
      openedAt: now(),
      events: [],
      audio: [],
      handlers: null,
      dead: false,
      session: undefined as unknown as ButlerSession,
    };
    slot.session = openSession(info, {
      onEvent: event => {
        if (slot.handlers) return slot.handlers.onEvent(event);
        // Before the screen takes it, a fallback means the session is over or the
        // butler is off: the screen opens its own and gets the same answer.
        if (event.t === 'fallback') slot.dead = true;
        else slot.events.push(event);
      },
      onAudio: chunk => (slot.handlers ? slot.handlers.onAudio?.(chunk) : slot.audio.push(chunk)),
    });
    warm = slot;
  };

  const open: OpenButlerSession = (info, handlers) => {
    if (!usable(info)) {
      discard();
      return openSession(info, handlers);
    }
    const slot = warm!;
    warm = null;
    slot.handlers = handlers;
    slot.events.splice(0).forEach(handlers.onEvent);
    slot.audio.splice(0).forEach(chunk => handlers.onAudio?.(chunk));
    return slot.session;
  };

  return { prepare, open };
};

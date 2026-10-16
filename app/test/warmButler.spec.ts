import type { AgentToAppEvent } from '@firedrift/domain';
import { createWarmButler, WARM_FOR_MS } from '../src/butler/warmButler';
import type { ButlerHandlers, ButlerSessionInfo, OpenButlerSession } from '../src/butler/butlerSocket';

const INFO: ButlerSessionInfo = {
  profileId: '3f2b8c1e-5d4a-4f6b-9c7e-1a2b3c4d5e6f',
  country: 'ES',
  services: [8, 337],
  hasMic: false,
};

const fakeOpen = () => {
  const opened: { info: ButlerSessionInfo; handlers: ButlerHandlers; ended: boolean; sent: string[] }[] = [];
  const open: OpenButlerSession = (info, handlers) => {
    const entry = { info, handlers, ended: false, sent: [] as string[] };
    opened.push(entry);
    return {
      send: event => entry.sent.push(event.t),
      sendAudio: () => undefined,
      end: () => {
        entry.ended = true;
      },
    };
  };
  return { open, opened };
};

describe('warm butler', () => {
  it('hands the warm session to the screen with what arrived before', () => {
    const { open, opened } = fakeOpen();
    const warm = createWarmButler(open);
    warm.prepare(INFO);
    opened[0].handlers.onEvent({ t: 'chips', chips: [] });
    opened[0].handlers.onAudio?.(new ArrayBuffer(4));

    const events: AgentToAppEvent[] = [];
    const audio: ArrayBuffer[] = [];
    const session = warm.open({ ...INFO, services: [337, 8] }, { onEvent: e => events.push(e), onAudio: a => audio.push(a) });
    opened[0].handlers.onEvent({ t: 'answer.done' });
    session.send({ t: 'chip.select', chipId: 'surprise_me' });

    expect(opened).toHaveLength(1);
    expect(events.map(e => e.t)).toEqual(['chips', 'answer.done']);
    expect(audio).toHaveLength(1);
    expect(opened[0].sent).toEqual(['chip.select']);
  });

  it('keeps one warm session and does not hand it out twice', () => {
    const { open, opened } = fakeOpen();
    const warm = createWarmButler(open);
    warm.prepare(INFO);
    warm.prepare(INFO);
    warm.open(INFO, { onEvent: () => undefined });
    warm.open(INFO, { onEvent: () => undefined });
    expect(opened).toHaveLength(2);
  });

  it('opens a new session when the settings changed, the warm one expired or it fell back', () => {
    let time = 0;
    const { open, opened } = fakeOpen();
    const warm = createWarmButler(open, () => time);

    warm.prepare(INFO);
    warm.open({ ...INFO, country: 'US' }, { onEvent: () => undefined });
    expect(opened).toHaveLength(2);
    expect(opened[0].ended).toBe(true);

    warm.prepare(INFO);
    time = WARM_FOR_MS;
    warm.open(INFO, { onEvent: () => undefined });
    expect(opened).toHaveLength(4);
    expect(opened[2].ended).toBe(true);

    warm.prepare(INFO);
    opened[4].handlers.onEvent({ t: 'fallback', reason: 'disabled', message: 'off', chips: [] });
    const events: AgentToAppEvent[] = [];
    warm.open(INFO, { onEvent: e => events.push(e) });
    expect(opened).toHaveLength(6);
    expect(events).toEqual([]);
  });

  it('replaces a warm session when warmed with other settings', () => {
    const { open, opened } = fakeOpen();
    const warm = createWarmButler(open);
    warm.prepare(INFO);
    warm.prepare({ ...INFO, hasMic: true });
    expect(opened).toHaveLength(2);
    expect(opened[0].ended).toBe(true);
  });
});

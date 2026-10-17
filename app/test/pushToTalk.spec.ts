import {
  createFakeButlerSocket,
  createPushToTalk,
  type ButlerAppEvent,
  type MicStream,
} from '../src/butler';

const pcm = (bytes = 3200) => new ArrayBuffer(bytes);
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const setup = (mic: MicStream | null | 'throws', hasSession = true) => {
  const sent: ButlerAppEvent[] = [];
  const audio: ArrayBuffer[] = [];
  const log: string[] = [];
  const session = {
    send: (event: ButlerAppEvent) => {
      sent.push(event);
      log.push(event.t);
    },
    sendAudio: (chunk: ArrayBuffer) => audio.push(chunk),
  };
  const openMic = jest.fn(async () => {
    if (mic === 'throws') throw new Error('no device');
    return mic;
  });
  const talk = createPushToTalk({
    openMic,
    getSession: () => (hasSession ? session : null),
    onListening: (listening) => log.push(`listening:${listening}`),
    onSent: () => log.push('sent'),
    releaseMs: 700,
  });
  return {talk, sent, audio, log, openMic};
};

/** A mic that gives one chunk per read, until closed. */
const steadyMic = () => {
  const mic = {
    reads: 0,
    closed: false,
    read: jest.fn(async () => {
      mic.reads += 1;
      await Promise.resolve();
      return pcm();
    }),
    close: jest.fn(async () => {
      mic.closed = true;
    }),
  };
  return mic;
};

describe('push to talk', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.useRealTimers());

  it('shows listening on key down, before the mic opens or anything is sent', () => {
    const {talk, log, openMic} = setup(steadyMic());
    talk.press();
    expect(log).toEqual(['listening:true']);
    expect(openMic).toHaveBeenCalledTimes(1);
    talk.release();
  });

  it('sends audio.start, the frames and audio.end, then reports the turn as sent', async () => {
    const mic = steadyMic();
    const {talk, sent, audio, log} = setup(mic);
    talk.press({autoRelease: false});
    await flush();
    expect(sent).toEqual([
      {t: 'audio.start', format: 'pcm16', sampleRate: 16000},
    ]);
    expect(audio.length).toBeGreaterThan(0);

    talk.release();
    await flush();
    expect(mic.closed).toBe(true);
    expect(sent.map((e) => e.t)).toEqual(['audio.start', 'audio.end']);
    expect(log).toEqual([
      'listening:true',
      'audio.start',
      'listening:false',
      'audio.end',
      'sent',
    ]);
  });

  it('opens one mic for repeated key-down events and releases when repeats stop', async () => {
    const {talk, openMic, log} = setup(steadyMic());
    talk.press();
    jest.advanceTimersByTime(300);
    talk.press();
    jest.advanceTimersByTime(300);
    talk.press();
    expect(openMic).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(699);
    expect(talk.isHolding()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(talk.isHolding()).toBe(false);
    expect(log).toContain('listening:false');
  });

  it('degrades silently with no mic: listening goes back and nothing is sent', async () => {
    for (const mic of [null, 'throws'] as const) {
      const {talk, sent, log} = setup(mic);
      talk.press();
      await flush();
      expect(log).toEqual(['listening:true', 'listening:false']);
      expect(sent).toEqual([]);
    }
  });

  it('sends nothing if the key is let go before the mic is ready or the mic reads nothing', async () => {
    const mic = steadyMic();
    const {talk, sent} = setup(mic);
    talk.press({autoRelease: false});
    talk.release();
    await flush();
    expect(sent).toEqual([]);
    expect(mic.closed).toBe(true);

    const dead = {
      read: async () => {
        throw new Error('error in audio record stream read');
      },
      close: async () => undefined,
    };
    const second = setup(dead);
    second.talk.press();
    await flush();
    expect(second.sent).toEqual([]);
    expect(second.log).toEqual(['listening:true', 'listening:false']);
  });

  it('does nothing when there is no session (fallback)', () => {
    const {talk, log, openMic} = setup(steadyMic(), false);
    talk.press();
    expect(log).toEqual([]);
    expect(openMic).not.toHaveBeenCalled();
  });
});

describe('fake butler socket with audio', () => {
  it('answers a voice turn after audio, and ignores an empty press', () => {
    jest.useFakeTimers();
    const events: string[] = [];
    const open = createFakeButlerSocket({stepMs: 10});
    const session = open(
      {profileId: 'p', country: 'US', services: [], hasMic: true},
      {onEvent: (event) => events.push(event.t)},
    );
    session.send({t: 'audio.start', format: 'pcm16', sampleRate: 16000});
    session.send({t: 'audio.end'});
    jest.advanceTimersByTime(1000);
    expect(events).toEqual([]);

    session.send({t: 'audio.start', format: 'pcm16', sampleRate: 16000});
    session.sendAudio(pcm());
    session.send({t: 'audio.end'});
    jest.advanceTimersByTime(1000);
    expect(events[0]).toBe('transcript');
    expect(events).toContain('answer.done');
    session.end();
    jest.useRealTimers();
  });
});

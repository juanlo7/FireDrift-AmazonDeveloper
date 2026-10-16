import type { AgentToAppEvent } from '@firedrift/domain';
import {
  base64Url,
  createButlerConnector,
  createButlerSocket,
  createDeviceAuth,
  createFakeButlerSocket,
  FALLBACK_CHIPS,
  makeDevicePassword,
  MAX_FRAME_BYTES,
  runtimeUrl,
  splitFrames,
  type ButlerSessionInfo,
  type WebSocketLike,
} from '../src/butler';
import { config } from '../src/config';
import { createMemoryStore } from '../src/storage';

const PROFILE_ID = '3f2b8c1e-5d4a-4f6b-9c7e-1a2b3c4d5e6f';
const INFO: ButlerSessionInfo = { profileId: PROFILE_ID, country: 'ES', services: [8, 337], hasMic: false };
const RUNTIME_ARN = 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/firedrift_butler-AbC';
const SOCKET_URL = `wss://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/${RUNTIME_ARN}/ws`;

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('device sign-in', () => {
  const auth = (overrides: { status?: number; body: object }[]) => {
    const calls: { target: string; body: any }[] = [];
    const fetchImpl = jest.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ target: init.headers['X-Amz-Target'].split('.').pop()!, body: JSON.parse(init.body) });
      const next = overrides.shift() ?? { body: {} };
      return { ok: (next.status ?? 200) < 300, status: next.status ?? 200, json: async () => next.body };
    });
    return { calls, fetchImpl };
  };
  const tokens = (access: string, refresh?: string) => ({
    body: { AuthenticationResult: { AccessToken: access, ExpiresIn: 3600, RefreshToken: refresh } },
  });

  it('signs up on first use, keeps the password and refresh token, and reuses the token', async () => {
    const store = createMemoryStore();
    const { calls, fetchImpl } = auth([{ body: {} }, tokens('access-1', 'refresh-1')]);
    const { getAccessToken } = createDeviceAuth({
      clientId: 'client',
      region: 'us-east-1',
      store,
      getProfileId: async () => PROFILE_ID,
      fetchImpl,
    });

    await expect(getAccessToken()).resolves.toBe('access-1');
    await expect(getAccessToken()).resolves.toBe('access-1');

    expect(calls.map(c => c.target)).toEqual(['SignUp', 'InitiateAuth']);
    expect(calls[0].body).toMatchObject({ ClientId: 'client', Username: PROFILE_ID });
    expect(calls[1].body.AuthParameters).toEqual({ USERNAME: PROFILE_ID, PASSWORD: calls[0].body.Password });
    expect(store.data['firedrift.butler.password']).toBe(calls[0].body.Password);
    expect(store.data['firedrift.butler.refreshToken']).toBe('refresh-1');
  });

  it('refreshes an expiring token, and signs in with the password when the refresh fails', async () => {
    let time = 0;
    const store = createMemoryStore({
      'firedrift.butler.password': 'Aa1-saved-password-0123456789',
      'firedrift.butler.refreshToken': 'refresh-old',
    });
    const { calls, fetchImpl } = auth([
      tokens('access-1'),
      { status: 400, body: { __type: 'NotAuthorizedException', message: 'Refresh Token has expired' } },
      tokens('access-2', 'refresh-2'),
    ]);
    const { getAccessToken } = createDeviceAuth({
      clientId: 'client',
      region: 'us-east-1',
      store,
      getProfileId: async () => PROFILE_ID,
      fetchImpl,
      now: () => time,
    });

    await expect(getAccessToken()).resolves.toBe('access-1');
    time = 3600_000;
    await expect(getAccessToken()).resolves.toBe('access-2');

    expect(calls.map(c => c.body.AuthFlow)).toEqual(['REFRESH_TOKEN_AUTH', 'REFRESH_TOKEN_AUTH', 'USER_PASSWORD_AUTH']);
    expect(store.data['firedrift.butler.refreshToken']).toBe('refresh-2');
  });

  it('signs up again when the saved password no longer works', async () => {
    const store = createMemoryStore({ 'firedrift.butler.password': 'Aa1-saved-password-0123456789' });
    const { calls, fetchImpl } = auth([
      { status: 400, body: { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' } },
      { body: {} },
      tokens('access-1', 'refresh-1'),
    ]);
    const { getAccessToken } = createDeviceAuth({
      clientId: 'client',
      region: 'us-east-1',
      store,
      getProfileId: async () => PROFILE_ID,
      fetchImpl,
    });

    await expect(getAccessToken()).resolves.toBe('access-1');
    expect(calls.map(c => c.target)).toEqual(['InitiateAuth', 'SignUp', 'InitiateAuth']);
  });

  it('makes passwords the pool policy accepts', () => {
    for (let i = 0; i < 50; i++) {
      const password = makeDevicePassword();
      expect(password).toHaveLength(32);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });
});

class FakeWebSocket implements WebSocketLike {
  binaryType = 'blob';
  readyState = 0;
  sent: (string | ArrayBuffer)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  closedWith: number | undefined;

  constructor(readonly url: string, readonly protocols?: string[]) {}

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  get frames() {
    return this.sent.filter((f): f is string => typeof f === 'string').map(f => JSON.parse(f).t);
  }
}

describe('butler socket', () => {
  const connect = (getAccessToken: () => Promise<string> = async () => 'a.b.c') => {
    const sockets: FakeWebSocket[] = [];
    const events: AgentToAppEvent[] = [];
    const audio: ArrayBuffer[] = [];
    const open = createButlerSocket({
      url: SOCKET_URL,
      getAccessToken,
      createWebSocket: (url, protocols) => {
        const ws = new FakeWebSocket(url, protocols);
        sockets.push(ws);
        return ws;
      },
    });
    const session = open(INFO, { onEvent: e => events.push(e), onAudio: chunk => audio.push(chunk) });
    return { session, sockets, events, audio };
  };

  it('signs in with subprotocols on the encoded Runtime URL and sends session.start first', async () => {
    const { session, sockets } = connect();
    session.send({ t: 'chip.select', chipId: 'surprise_me' });
    await flush();
    const ws = sockets[0];

    expect(ws.url).toBe(
      `wss://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/${encodeURIComponent(RUNTIME_ARN)}/ws`,
    );
    expect(ws.protocols).toEqual([`base64UrlBearerAuthorization.${base64Url('a.b.c')}`, 'base64UrlBearerAuthorization']);
    expect(ws.binaryType).toBe('arraybuffer');
    expect(ws.sent).toHaveLength(0);

    ws.open();
    expect(JSON.parse(ws.sent[0] as string)).toEqual({ t: 'session.start', ...INFO });
    expect(ws.frames).toEqual(['session.start', 'chip.select']);
  });

  it('sends events and microphone audio in frames under the Runtime limit', async () => {
    const { session, sockets } = connect();
    await flush();
    sockets[0].open();

    session.send({ t: 'audio.start', format: 'pcm16', sampleRate: 16000 });
    session.sendAudio(new ArrayBuffer(MAX_FRAME_BYTES * 2 + 10));
    session.send({ t: 'audio.end' });
    session.send({ t: 'suggestion.feedback', tmdbId: 550, type: 'movie', kind: 'like' });

    const binary = sockets[0].sent.filter((f): f is ArrayBuffer => typeof f !== 'string');
    expect(binary.map(f => f.byteLength)).toEqual([MAX_FRAME_BYTES, MAX_FRAME_BYTES, 10]);
    expect(sockets[0].frames).toEqual(['session.start', 'audio.start', 'audio.end', 'suggestion.feedback']);
  });

  it('passes every agent event and binary speech audio to the handlers', async () => {
    const { sockets, events, audio } = connect();
    await flush();
    sockets[0].open();
    const speech = require('@firedrift/domain/fixtures/socket/agent-to-app/speech.json');

    sockets[0].receive(JSON.stringify(speech));
    sockets[0].receive(new ArrayBuffer(8));
    sockets[0].receive('not json');
    sockets[0].receive(JSON.stringify({ t: 'answer.done' }));

    expect(events).toEqual([speech, { t: 'answer.done' }]);
    expect(events[0]).toHaveProperty('gestures');
    expect(audio).toHaveLength(1);
  });

  it('turns a closed socket into one fallback with chips', async () => {
    const { sockets, events } = connect();
    await flush();
    sockets[0].open();
    sockets[0].drop();
    sockets[0].onerror?.(new Error('again'));

    expect(events).toEqual([{ t: 'fallback', reason: 'error', message: expect.any(String), chips: FALLBACK_CHIPS }]);
  });

  it('falls back when sign-in fails, without opening a socket', async () => {
    const { sockets, events } = connect(async () => {
      throw new Error('no network');
    });
    await flush();

    expect(sockets).toHaveLength(0);
    expect(events.map(e => e.t)).toEqual(['fallback']);
  });

  it('ends with session.end and no fallback', async () => {
    const { session, sockets, events } = connect();
    await flush();
    sockets[0].open();
    session.end();
    sockets[0].drop(1000);

    expect(sockets[0].frames).toEqual(['session.start', 'session.end']);
    expect(sockets[0].closedWith).toBe(1000);
    expect(events).toEqual([]);
  });

  it('encodes like base64url without padding', () => {
    expect(base64Url('')).toBe('');
    expect(base64Url('a')).toBe('YQ');
    expect(base64Url('ab')).toBe('YWI');
    expect(base64Url('abc')).toBe('YWJj');
    expect(base64Url('?>?>')).toBe('Pz4_Pg');
  });

  it('keeps an already encoded Runtime URL and splits nothing from empty audio', () => {
    expect(runtimeUrl(runtimeUrl(SOCKET_URL))).toBe(runtimeUrl(SOCKET_URL));
    expect(runtimeUrl('ws://localhost:8080/ws')).toBe('ws://localhost:8080/ws');
    expect(splitFrames(new ArrayBuffer(0))).toEqual([]);
  });
});

describe('fake butler socket', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = (options = {}) => {
    const events: AgentToAppEvent[] = [];
    const session = createFakeButlerSocket({ stepMs: 10, ...options })(INFO, { onEvent: e => events.push(e) });
    return { session, events, kinds: () => events.map(e => e.t) };
  };

  it('replays a chip turn from the fixtures', () => {
    const { session, kinds } = run();
    session.send({ t: 'chip.select', chipId: 'surprise_me' });
    jest.runAllTimers();
    expect(kinds()).toEqual(['thinking', 'answer.delta', 'speech', 'suggestion', 'chips', 'answer.done']);
  });

  it('starts a voice turn with the transcript and sends weights.changed for taste chips', () => {
    const { session, kinds } = run();
    session.send({ t: 'audio.start', format: 'pcm16', sampleRate: 16000 });
    session.sendAudio(new ArrayBuffer(3200));
    session.send({ t: 'audio.end' });
    jest.runAllTimers();
    expect(kinds()[0]).toBe('transcript');

    const taste = run();
    taste.session.send({ t: 'chip.select', chipId: 'shorter' });
    jest.runAllTimers();
    expect(taste.kinds()).toContain('weights.changed');
  });

  it('answers with a fallback when asked to, and stops on end', () => {
    const { session, events } = run({ fallback: 'cap' });
    session.send({ t: 'chip.select', chipId: 'surprise_me' });
    jest.runAllTimers();
    expect(events).toEqual([expect.objectContaining({ t: 'fallback', reason: 'cap' })]);

    const ended = run();
    ended.session.send({ t: 'chip.select', chipId: 'surprise_me' });
    ended.session.end();
    jest.runAllTimers();
    expect(ended.events).toEqual([]);
  });
});

describe('butler mode', () => {
  it('switches from fake to real with one config value', async () => {
    jest.useFakeTimers();
    const fake = createButlerConnector({ ...config, butlerMode: 'fake' });
    const events: AgentToAppEvent[] = [];
    fake(INFO, { onEvent: e => events.push(e) }).send({ t: 'chip.select', chipId: 'surprise_me' });
    jest.runAllTimers();
    expect(events.at(-1)?.t).toBe('answer.done');
    jest.useRealTimers();

    const real = createButlerConnector({ ...config, butlerMode: 'real', butlerSocketUrl: '' });
    const realEvents: AgentToAppEvent[] = [];
    real(INFO, { onEvent: e => realEvents.push(e) });
    await flush();
    expect(realEvents.map(e => e.t)).toEqual(['fallback']);
  });
});

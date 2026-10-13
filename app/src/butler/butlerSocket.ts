import type { AgentToAppEvent, AppToAgentEvent, Chip, FallbackReason } from '@firedrift/domain';

type SessionStartEvent = Extract<AppToAgentEvent, { t: 'session.start' }>;
type FallbackEvent = Extract<AgentToAppEvent, { t: 'fallback' }>;

/** `session.start` without its tag: who is talking and what they can watch. */
export type ButlerSessionInfo = Omit<SessionStartEvent, 't'>;

/** Every app → agent event except `session.start`, which opening the session sends. */
export type ButlerAppEvent = Exclude<AppToAgentEvent, SessionStartEvent>;

export interface ButlerHandlers {
  /** Every agent → app event, and a `fallback` made here when the socket fails or closes. */
  onEvent(event: AgentToAppEvent): void;
  /** Speech audio in binary frames, when the agent does not send `audioUrl`. */
  onAudio?(chunk: ArrayBuffer): void;
}

export interface ButlerSession {
  send(event: ButlerAppEvent): void;
  /** Microphone PCM between `audio.start` and `audio.end`, split into frames the Runtime accepts. */
  sendAudio(pcm: ArrayBuffer): void;
  /** Sends `session.end` and closes. No `fallback` follows. */
  end(): void;
}

/** One butler session per screen visit (contracts.md, section 3). */
export type OpenButlerSession = (info: ButlerSessionInfo, handlers: ButlerHandlers) => ButlerSession;

/** AgentCore Runtime drops WebSocket frames over 32 KB. */
export const MAX_FRAME_BYTES = 32 * 1024;

/** Mirrors `fallback_chips()` in `agent/brain/chips.py`: the app serves them from the taste algorithm. */
export const FALLBACK_CHIPS: Chip[] = [
  { id: 'more_like_this', label: 'More like this' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'different_genre', label: 'Different genre' },
];

export const fallbackEvent = (
  reason: FallbackReason = 'error',
  message = 'The butler is away for a moment. Here are some picks for you.',
): FallbackEvent => ({ t: 'fallback', reason, message, chips: FALLBACK_CHIPS });

/** The part of the WebSocket API the client uses, so tests can pass a fake. */
export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  onclose: ((event: { code: number; reason?: string }) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;

const OPEN = 1;

/** The Runtime ARN goes URL-encoded in the path (`agent/server/fake_client.py`). */
export const runtimeUrl = (url: string): string => {
  const marker = '/runtimes/';
  const at = url.indexOf(marker);
  if (at < 0) return url;
  const rest = url.slice(at + marker.length);
  const ws = rest.indexOf('/ws');
  const arn = ws < 0 ? rest : rest.slice(0, ws);
  const tail = ws < 0 ? '' : rest.slice(ws);
  return `${url.slice(0, at + marker.length)}${encodeURIComponent(decodeURIComponent(arn))}${tail}`;
};

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url without padding of an ASCII string (a JWT is ASCII). */
export const base64Url = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const chunk = text.slice(i, i + 3);
    let bits = 0;
    for (let j = 0; j < 3; j++) bits = bits * 256 + (j < chunk.length ? chunk.charCodeAt(j) : 0);
    const sextets = [18, 12, 6, 0].map(shift => Math.floor(bits / 2 ** shift) % 64);
    out += sextets
      .slice(0, chunk.length + 1)
      .map(sextet => BASE64URL[sextet])
      .join('');
  }
  return out;
};

/**
 * React Native's WebSocket cannot be trusted to send custom headers on Vega,
 * so the token goes as subprotocols, the way AgentCore Runtime accepts it.
 */
export const bearerSubprotocols = (token: string): string[] => [
  `base64UrlBearerAuthorization.${base64Url(token)}`,
  'base64UrlBearerAuthorization',
];

export const splitFrames = (pcm: ArrayBuffer, max = MAX_FRAME_BYTES): ArrayBuffer[] => {
  const frames: ArrayBuffer[] = [];
  for (let at = 0; at < pcm.byteLength; at += max) frames.push(pcm.slice(at, at + max));
  return frames;
};

export interface ButlerSocketOptions {
  /** `ButlerWebSocketUrl` from the CDK stack output. */
  url: string;
  getAccessToken: () => Promise<string>;
  createWebSocket?: WebSocketFactory;
}

/**
 * The real butler socket on AgentCore Runtime. Frames sent before the socket
 * opens wait in order. If sign-in fails, the socket errors, or it closes before
 * `end()`, the handlers get one `fallback` and the session is over: the screen
 * switches to chips served by the taste algorithm.
 */
export const createButlerSocket = ({
  url,
  getAccessToken,
  createWebSocket = (target, protocols) => new WebSocket(target, protocols) as unknown as WebSocketLike,
}: ButlerSocketOptions): OpenButlerSession => (info, handlers) => {
  const queue: (string | ArrayBuffer)[] = [JSON.stringify({ t: 'session.start', ...info })];
  let socket: WebSocketLike | null = null;
  let over = false;

  const fail = (why: unknown) => {
    if (over) return;
    over = true;
    console.warn('[butler] socket failed', why);
    socket?.close();
    handlers.onEvent(fallbackEvent());
  };

  const transmit = (frame: string | ArrayBuffer) => {
    if (over) return;
    if (socket?.readyState === OPEN) socket.send(frame);
    else queue.push(frame);
  };

  const onMessage = ({ data }: { data: unknown }) => {
    if (over) return;
    if (typeof data !== 'string') {
      if (data instanceof ArrayBuffer) handlers.onAudio?.(data);
      return;
    }
    let event: AgentToAppEvent;
    try {
      event = JSON.parse(data);
    } catch {
      console.warn('[butler] dropped a frame that is not JSON');
      return;
    }
    handlers.onEvent(event);
  };

  (async () => {
    if (!url) throw new Error('config.butlerSocketUrl is empty');
    const token = await getAccessToken();
    if (over) return;
    const ws = createWebSocket(runtimeUrl(url), bearerSubprotocols(token));
    socket = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      for (const frame of queue.splice(0)) ws.send(frame);
    };
    ws.onmessage = onMessage;
    ws.onerror = error => fail(error);
    ws.onclose = event => fail(`closed with code ${event.code}`);
  })().catch(fail);

  return {
    send: event => transmit(JSON.stringify(event)),
    sendAudio: pcm => splitFrames(pcm).forEach(transmit),
    end: () => {
      if (over) return;
      if (socket?.readyState === OPEN) socket.send(JSON.stringify({ t: 'session.end' }));
      over = true;
      socket?.close(1000);
    },
  };
};

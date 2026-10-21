/**
 * App configuration. Change `apiMode` to switch the whole app from the
 * fixtures in `packages/domain/fixtures/` to the real backend.
 */
export type ApiMode = 'mock' | 'real';
export type ButlerMode = 'fake' | 'real';

export interface AppConfig {
  /** `mock` reads fixtures; `real` calls `apiBaseUrl`. */
  apiMode: ApiMode;
  /** HTTP API Gateway URL from the CDK stack output, without a trailing slash. */
  apiBaseUrl: string;
  /** Abort a REST call after this many milliseconds. */
  apiTimeoutMs: number;
  /**
   * Extra Vega component IDs for Watch now, by TMDB provider ID. For tests
   * with `tools/fake-streaming-app` only, e.g. `{ 8: 'com.firedrift.fakestreaming.main' }`.
   */
  serviceAppOverrides: Record<number, string>;
  /** `fake` replays the socket fixtures; `real` connects to `butlerSocketUrl`. */
  butlerMode: ButlerMode;
  /** `ButlerWebSocketUrl` from the CDK stack output. */
  butlerSocketUrl: string;
  /** `UserPoolClientId` from the CDK stack output: device sign-in for the butler. */
  cognitoClientId: string;
  awsRegion: string;
}

// The URLs and client ID are the public outputs of the shared `FireDrift-dev` stack, which
// stays up for judging until Nov 20, 2026. Set both modes to 'real' to use it.
export const config: AppConfig = {
  apiMode: 'mock',
  apiBaseUrl: 'https://au0oai7ui3.execute-api.us-east-1.amazonaws.com',
  apiTimeoutMs: 8000,
  serviceAppOverrides: {},
  butlerMode: 'fake',
  butlerSocketUrl:
    'wss://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:380301678488:runtime/firedrift_butler_FireDrift_dev-PtFBk3EIRJ/ws',
  cognitoClientId: '1estri2tochp2rnh5m17sjifus',
  awsRegion: 'us-east-1',
};

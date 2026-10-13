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

export const config: AppConfig = {
  apiMode: 'mock',
  apiBaseUrl: '',
  apiTimeoutMs: 8000,
  serviceAppOverrides: {},
  butlerMode: 'fake',
  butlerSocketUrl: '',
  cognitoClientId: '',
  awsRegion: 'us-east-1',
};

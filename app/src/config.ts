/**
 * App configuration. Change `apiMode` to switch the whole app from the
 * fixtures in `packages/domain/fixtures/` to the real backend.
 */
export type ApiMode = 'mock' | 'real';

export interface AppConfig {
  /** `mock` reads fixtures; `real` calls `apiBaseUrl`. */
  apiMode: ApiMode;
  /** HTTP API Gateway URL from the CDK stack output, without a trailing slash. */
  apiBaseUrl: string;
  /** Abort a REST call after this many milliseconds. */
  apiTimeoutMs: number;
}

export const config: AppConfig = {
  apiMode: 'mock',
  apiBaseUrl: '',
  apiTimeoutMs: 8000,
};

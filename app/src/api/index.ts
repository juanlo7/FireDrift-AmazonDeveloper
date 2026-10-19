import type { AppConfig } from '../config';
import { config } from '../config';
import type { ApiClient } from './client';
import { createHttpClient } from './httpClient';
import { createMockClient } from './mockClient';

export * from './client';
export { createHttpClient } from './httpClient';
export { createMockClient } from './mockClient';

export const createApiClient = (appConfig: AppConfig): ApiClient =>
  appConfig.apiMode === 'mock'
    ? createMockClient()
    : createHttpClient({ baseUrl: appConfig.apiBaseUrl, timeoutMs: appConfig.apiTimeoutMs });

/** The app-wide client. Mock or real depends on `config.apiMode`. */
export const api: ApiClient = createApiClient(config);

import type {
  PoolResponse,
  ProvidersResponse,
  SignalsResponse,
  TitleResponse,
  WeightsResponse,
} from '@firedrift/domain';
import type { ApiClient } from './client';
import { DEFAULT_POOL_SIZE } from './client';

// Fixtures are the shared mocks of every contract (`packages/domain/fixtures/`).
const pool: PoolResponse = require('@firedrift/domain/fixtures/rest/pool.response.json');
const providers: ProvidersResponse = require('@firedrift/domain/fixtures/rest/providers.response.json');
const signals: SignalsResponse = require('@firedrift/domain/fixtures/rest/signals.response.json');
const title: TitleResponse = require('@firedrift/domain/fixtures/rest/title.response.json');
const weights: WeightsResponse = require('@firedrift/domain/fixtures/rest/weights.response.json');

/** Same shape as the real client, served from fixtures. No network. */
export const createMockClient = (): ApiClient => ({
  health: async () => ({ ok: true }),
  getProviders: async () => providers,
  putProfile: async () => undefined,
  getPool: async (_profileId, size = DEFAULT_POOL_SIZE) => ({
    ...pool,
    titles: pool.titles.slice(0, size),
  }),
  postSignals: async (_profileId, body) => ({
    ...signals,
    accepted: body.signals.length,
    duplicates: 0,
  }),
  getTitle: async (type, tmdbId) =>
    pool.titles.find(t => t.type === type && t.tmdbId === tmdbId) ?? title,
  getWeights: async () => weights,
  undoWeights: async () => weights,
  resetWeights: async () => ({ ...weights, lastChange: null }),
});

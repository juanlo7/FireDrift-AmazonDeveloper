import { ApiRequestError, createApiClient, createHttpClient, createMockClient } from '../src/api';
import { config } from '../src/config';

const PROFILE_ID = '00000000-0000-4000-8000-000000000000';

describe('mock client', () => {
  const client = createMockClient();

  it('serves the pool fixture, cut to the requested size', async () => {
    const pool = await client.getPool(PROFILE_ID, 1);
    expect(pool.poolId).toBeTruthy();
    expect(pool.titles).toHaveLength(1);
  });

  it('counts every posted signal as accepted', async () => {
    const result = await client.postSignals(PROFILE_ID, {
      signals: [
        {
          signalId: '3f1c9a52-8a8e-4b7e-9a51-1d2c3b4a5f60',
          tmdbId: 70523,
          type: 'series',
          kind: 'like',
          source: 'feed',
          at: '2026-10-04T10:00:00Z',
        },
      ],
    });
    expect(result).toEqual({ accepted: 1, duplicates: 0 });
  });

  it('finds a title from the pool by type and id', async () => {
    const pool = await client.getPool(PROFILE_ID);
    const first = pool.titles[0]!;
    const title = await client.getTitle(first.type, first.tmdbId, {
      country: 'ES',
      profileId: PROFILE_ID,
    });
    expect(title.tmdbId).toBe(first.tmdbId);
  });
});

describe('createApiClient', () => {
  it('uses fixtures in mock mode', async () => {
    const client = createApiClient({ ...config, apiMode: 'mock', apiBaseUrl: '', apiTimeoutMs: 100 });
    await expect(client.health()).resolves.toEqual({ ok: true });
  });

  it('fails clearly in real mode without a base URL', async () => {
    const client = createApiClient({ ...config, apiMode: 'real', apiBaseUrl: '', apiTimeoutMs: 100 });
    await expect(client.health()).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('http client', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const respond = (status: number, body: unknown) =>
    jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });

  it('builds the contract path and parses JSON', async () => {
    const fetchMock = respond(200, { poolId: 'p1', algorithmVersion: 'v1', titles: [] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000 });

    const pool = await client.getPool(PROFILE_ID, 5);

    expect(pool.poolId).toBe('p1');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test/profiles/${PROFILE_ID}/pool?size=5`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns nothing on 204', async () => {
    globalThis.fetch = respond(204, null) as unknown as typeof fetch;
    const client = createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000 });
    await expect(
      client.putProfile(PROFILE_ID, { country: 'ES', services: [], showEverything: false }),
    ).resolves.toBeUndefined();
  });

  it('maps the contract error body to ApiRequestError', async () => {
    globalThis.fetch = respond(429, {
      error: { code: 'throttled', message: 'Too many requests' },
    }) as unknown as typeof fetch;
    const client = createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000 });

    const error = await client.health().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'throttled', status: 429 });
  });
});

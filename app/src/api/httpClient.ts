import type { ApiClient } from './client';
import { ApiRequestError, DEFAULT_POOL_SIZE } from './client';

interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

/** Calls the FireDrift HTTP API. */
export const createHttpClient = ({ baseUrl, timeoutMs }: HttpClientOptions): ApiClient => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    if (!baseUrl) {
      throw new ApiRequestError('not_configured', 'config.apiBaseUrl is empty', 0);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new ApiRequestError(
        timedOut ? 'timeout' : 'network',
        timedOut ? `${method} ${path} timed out` : String(error),
        0,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = payload?.error;
      throw new ApiRequestError(
        typeof error?.code === 'string' ? error.code : 'http_error',
        typeof error?.message === 'string' ? error.message : `HTTP ${response.status}`,
        response.status,
      );
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };

  const profilePath = (profileId: string) => `/profiles/${encodeURIComponent(profileId)}`;

  return {
    health: () => request('GET', '/health'),
    getProviders: country =>
      request('GET', `/providers?country=${encodeURIComponent(country)}`),
    putProfile: (profileId, body) => request('PUT', profilePath(profileId), body),
    getPool: (profileId, size = DEFAULT_POOL_SIZE) =>
      request('GET', `${profilePath(profileId)}/pool?size=${size}`),
    postSignals: (profileId, body) =>
      request('POST', `${profilePath(profileId)}/signals`, body),
    getTitle: (type, tmdbId, { country, profileId }) =>
      request(
        'GET',
        `/titles/${type}/${tmdbId}?country=${encodeURIComponent(country)}` +
          `&profileId=${encodeURIComponent(profileId)}`,
      ),
    getWeights: profileId => request('GET', `${profilePath(profileId)}/weights`),
    undoWeights: profileId => request('POST', `${profilePath(profileId)}/weights/undo`),
    resetWeights: profileId => request('POST', `${profilePath(profileId)}/weights/reset`),
  };
};

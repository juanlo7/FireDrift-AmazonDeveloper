import type {
  HealthResponse,
  PoolResponse,
  ProfilePutBody,
  ProvidersResponse,
  SignalsBody,
  SignalsResponse,
  TitleResponse,
  TitleType,
  WeightsResponse,
} from '@firedrift/domain';

/** The REST API of `docs/contracts.md`, section 2. One method per route. */
export interface ApiClient {
  health(): Promise<HealthResponse>;
  getProviders(country: string): Promise<ProvidersResponse>;
  putProfile(profileId: string, body: ProfilePutBody): Promise<void>;
  getPool(profileId: string, size?: number): Promise<PoolResponse>;
  postSignals(profileId: string, body: SignalsBody): Promise<SignalsResponse>;
  getTitle(
    type: TitleType,
    tmdbId: number,
    params: { country: string; profileId: string },
  ): Promise<TitleResponse>;
  getWeights(profileId: string): Promise<WeightsResponse>;
  undoWeights(profileId: string): Promise<WeightsResponse>;
  resetWeights(profileId: string): Promise<WeightsResponse>;
}

/** Default pool size for `GET /profiles/{profileId}/pool`. */
export const DEFAULT_POOL_SIZE = 20;

/** An error response (`{ error: { code, message } }`), a timeout or a network failure. */
export class ApiRequestError extends Error {
  constructor(
    /** Contract error code, or `timeout` / `network` / `not_configured`. */
    readonly code: string,
    message: string,
    /** HTTP status, or `0` when the request never got a response. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

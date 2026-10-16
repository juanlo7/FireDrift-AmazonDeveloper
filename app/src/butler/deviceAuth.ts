import type { KeyValueStore } from '../storage';

const PASSWORD_KEY = 'firedrift.butler.password';
const REFRESH_TOKEN_KEY = 'firedrift.butler.refreshToken';
/** Ask for a new access token this long before the old one expires. */
const EXPIRY_MARGIN_MS = 60_000;

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export interface DeviceAuthOptions {
  /** `UserPoolClientId` from the CDK stack output. */
  clientId: string;
  region: string;
  store: KeyValueStore;
  getProfileId: () => Promise<string>;
  fetchImpl?: Fetch;
  now?: () => number;
  random?: () => number;
}

/** A Cognito error response (`__type` is the exception name) or a network failure. */
export class DeviceAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DeviceAuthError';
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 32 characters with upper case, lower case and digits, as the pool policy asks.
 * Only signs in an anonymous profile, so `Math.random` is strong enough.
 */
export const makeDevicePassword = (random: () => number = Math.random): string => {
  const pick = (chars: string) => chars[Math.floor(random() * chars.length)];
  const rest = Array.from({ length: 29 }, () => pick(ALPHABET)).join('');
  return `${pick(ALPHABET.slice(0, 26))}${pick(ALPHABET.slice(26, 52))}${pick(ALPHABET.slice(52))}${rest}`;
};

/**
 * Device sign-in for the butler socket (`agent/README.md`, "On AWS"). The TV
 * has no login: on first use it signs up with its profile ID and a random
 * password it keeps, then signs in for a 1 hour access token. Unsigned HTTPS
 * calls to Cognito; no AWS credentials on the device.
 */
export const createDeviceAuth = ({
  clientId,
  region,
  store,
  getProfileId,
  fetchImpl = fetch as unknown as Fetch,
  now = Date.now,
  random = Math.random,
}: DeviceAuthOptions) => {
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const call = async (action: string, body: object): Promise<any> => {
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await fetchImpl(`https://cognito-idp.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new DeviceAuthError('network', String(cause));
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(payload.__type ?? `HTTP ${response.status}`).split('#').pop() as string;
      throw new DeviceAuthError(code, String(payload.message ?? code));
    }
    return payload;
  };

  const keep = async (result: any): Promise<string> => {
    const token: string = result.AuthenticationResult.AccessToken;
    cached = { token, expiresAt: now() + result.AuthenticationResult.ExpiresIn * 1000 };
    const refresh: string | undefined = result.AuthenticationResult.RefreshToken;
    if (refresh) await store.set(REFRESH_TOKEN_KEY, refresh);
    return token;
  };

  const signIn = async (profileId: string, password: string) =>
    keep(
      await call('InitiateAuth', {
        ClientId: clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: profileId, PASSWORD: password },
      }),
    );

  const signUpAndSignIn = async (profileId: string): Promise<string> => {
    const password = makeDevicePassword(random);
    await call('SignUp', { ClientId: clientId, Username: profileId, Password: password });
    await store.set(PASSWORD_KEY, password);
    return signIn(profileId, password);
  };

  const fetchToken = async (): Promise<string> => {
    const refresh = await store.get(REFRESH_TOKEN_KEY);
    if (refresh) {
      try {
        return await keep(
          await call('InitiateAuth', {
            ClientId: clientId,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: { REFRESH_TOKEN: refresh },
          }),
        );
      } catch (error) {
        if (error instanceof DeviceAuthError && error.code === 'network') throw error;
        // An expired or revoked refresh token: sign in with the password again.
      }
    }
    const profileId = await getProfileId();
    const password = await store.get(PASSWORD_KEY);
    if (!password) return signUpAndSignIn(profileId);
    try {
      return await signIn(profileId, password);
    } catch (error) {
      // With preventUserExistenceErrors a missing user also reads as NotAuthorized.
      if (error instanceof DeviceAuthError && error.code === 'NotAuthorizedException') {
        return signUpAndSignIn(profileId);
      }
      throw error;
    }
  };

  /** A valid access token for the butler socket. Signs up on first use. */
  const getAccessToken = (): Promise<string> => {
    if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > now()) return Promise.resolve(cached.token);
    pending ??= fetchToken().finally(() => {
      pending = null;
    });
    return pending;
  };

  return { getAccessToken };
};

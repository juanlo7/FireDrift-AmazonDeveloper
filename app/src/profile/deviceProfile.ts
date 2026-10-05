import type { ProfilePutBody } from '@firedrift/domain';
import type { ApiClient } from '../api/client';
import { uuidv4 } from '../signals/ids';
import { deviceStore, type KeyValueStore } from '../storage';

const PROFILE_ID_KEY = 'firedrift.profileId';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The anonymous device profile: a UUID made on first run and kept on the device.
 * The same ID names the device in Cognito for the butler (#61).
 */
export const createDeviceProfile = (store: KeyValueStore) => {
  let profileId: Promise<string> | undefined;

  const getProfileId = (): Promise<string> =>
    (profileId ??= (async () => {
      const saved = await store.get(PROFILE_ID_KEY);
      if (saved && UUID_PATTERN.test(saved)) return saved;
      const created = uuidv4();
      await store.set(PROFILE_ID_KEY, created);
      return created;
    })());

  /**
   * Saves country and services (`PUT /profiles`). Never throws: until it
   * succeeds the backend uses its defaults, so the feed does not wait for it.
   */
  const ensureProfile = async (api: ApiClient, body: ProfilePutBody): Promise<boolean> => {
    try {
      await api.putProfile(await getProfileId(), body);
      return true;
    } catch (cause) {
      console.warn('[profile] could not save the profile', cause);
      return false;
    }
  };

  return { getProfileId, ensureProfile };
};

export const deviceProfile = createDeviceProfile(deviceStore);

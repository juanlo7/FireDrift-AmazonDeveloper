import type { AppConfig } from '../config';
import { config } from '../config';
import { deviceProfile } from '../profile';
import { settingsStore } from '../settings';
import { deviceStore } from '../storage';
import { createButlerSocket, type ButlerSessionInfo, type OpenButlerSession } from './butlerSocket';
import { createDeviceAuth } from './deviceAuth';
import { createFakeButlerSocket } from './fakeButlerSocket';
import { createWarmButler } from './warmButler';

export * from './butlerModel';
export * from './butlerSocket';
export * from './CharacterSlot';
export * from './clipPlayer';
export * from './clips';
export * from './deviceAuth';
export * from './fakeButlerSocket';
export * from './micCapture';
export * from './pushToTalk';
export * from './speechPlayer';
export * from './speechSync';
export * from './warmButler';

export const createButlerConnector = (appConfig: AppConfig): OpenButlerSession =>
  appConfig.butlerMode === 'fake'
    ? createFakeButlerSocket()
    : createButlerSocket({
        url: appConfig.butlerSocketUrl,
        getAccessToken: createDeviceAuth({
          clientId: appConfig.cognitoClientId,
          region: appConfig.awsRegion,
          store: deviceStore,
          getProfileId: deviceProfile.getProfileId,
        }).getAccessToken,
      });

const warmButler = createWarmButler(createButlerConnector(config));

/**
 * `session.start` for this device: its profile and settings. The butler screen
 * and the warm-up must use the same values, or the warm session is not used.
 */
export const butlerSessionInfo = async (hasMic = false): Promise<ButlerSessionInfo> => {
  const settings = settingsStore.get() ?? (await settingsStore.load());
  return {
    profileId: await deviceProfile.getProfileId(),
    country: settings.country,
    services: settings.services,
    hasMic,
  };
};

/** Opens a butler session, warm if one is ready. Fake or real depends on `config.butlerMode`. */
export const openButlerSession: OpenButlerSession = warmButler.open;

/** Starts a butler session in the background so the screen does not wait for it. Never throws. */
export const prepareButlerSession = (hasMic = false): void => {
  butlerSessionInfo(hasMic)
    .then(warmButler.prepare)
    .catch(cause => console.warn('[butler] could not warm a session', cause));
};

import type { AppConfig } from '../config';
import { config } from '../config';
import { deviceProfile } from '../profile';
import { deviceStore } from '../storage';
import { createButlerSocket, type OpenButlerSession } from './butlerSocket';
import { createDeviceAuth } from './deviceAuth';
import { createFakeButlerSocket } from './fakeButlerSocket';

export * from './butlerSocket';
export * from './deviceAuth';
export * from './fakeButlerSocket';

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

/** Opens a butler session. Fake or real depends on `config.butlerMode`. */
export const openButlerSession: OpenButlerSession = createButlerConnector(config);

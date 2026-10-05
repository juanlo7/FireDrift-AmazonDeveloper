import { AppState } from 'react-native';
import { api } from '../api';
import { deviceProfile } from '../profile';
import { deviceStore } from '../storage';
import { createBatchQueue } from './batchQueue';

export * from './queue';
export * from './batchQueue';
export * from './coverDwell';
export { uuidv4 } from './ids';

/** The app's signal queue: batched to the backend, kept on the device until sent. */
export const signalQueue = createBatchQueue({
  api,
  store: deviceStore,
  getProfileId: deviceProfile.getProfileId,
  appState: AppState,
});

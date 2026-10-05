import { useEffect, useState } from 'react';
import { api } from '../api';
import { deviceProfile } from '../profile';
import { deviceStore } from '../storage';
import { createSettingsStore, type Settings, type SettingsStore } from './settingsStore';

export * from './settingsStore';
export * from './ServicesForm';

/** The app's settings, on the device and in the backend profile. */
export const settingsStore = createSettingsStore({
  store: deviceStore,
  sendProfile: body => deviceProfile.ensureProfile(api, body),
});

/** Current settings (`null` while they load); re-renders when they are saved. */
export const useSettings = (store: SettingsStore = settingsStore): Settings | null => {
  const [settings, setSettings] = useState<Settings | null>(store.get());
  useEffect(() => {
    let mounted = true;
    store.load().then(loaded => mounted && setSettings(loaded));
    const unsubscribe = store.subscribe(setSettings);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [store]);
  return settings;
};

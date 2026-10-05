import type { ProfilePutBody } from '@firedrift/domain';
import type { KeyValueStore } from '../storage';

const SETTINGS_KEY = 'firedrift.settings';

/** FR-4: what the user picked, kept on the device and sent with `PUT /profiles`. */
export interface Settings extends ProfilePutBody {
  /** The first-run services screen was finished or skipped. */
  setupDone: boolean;
}

/** Countries with TMDB watch-provider data that the country picker offers. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'ES', name: 'Spain' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'JP', name: 'Japan' },
];

/** Used when the device region is unknown or not in `COUNTRIES`. */
export const FALLBACK_COUNTRY = 'US';

export const countryName = (code: string) => COUNTRIES.find(c => c.code === code)?.name ?? code;

/** The region of a locale such as `en-US` or `es_ES`, if FireDrift supports it. */
export const countryFromLocale = (locale: string | undefined): string => {
  const region = locale?.match(/[-_]([A-Za-z]{2})(?:$|[-_@.])/)?.[1]?.toUpperCase();
  return region && COUNTRIES.some(c => c.code === region) ? region : FALLBACK_COUNTRY;
};

const readDeviceLocale = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
};

/** Skipping the setup gives this: the device country and all services (FR-4). */
export const defaultSettings = (locale = readDeviceLocale()): Settings => ({
  country: countryFromLocale(locale),
  services: [],
  showEverything: false,
  setupDone: false,
});

const parse = (raw: string | null): Settings | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Settings>;
    if (typeof value.country !== 'string' || !/^[A-Z]{2}$/.test(value.country)) return null;
    return {
      country: value.country,
      services: Array.isArray(value.services) ? value.services.filter(Number.isInteger) : [],
      showEverything: value.showEverything === true,
      setupDone: value.setupDone === true,
    };
  } catch {
    return null;
  }
};

export interface SettingsDeps {
  store: KeyValueStore;
  /** Sends the profile to the backend. Never throws; `false` when it failed. */
  sendProfile: (body: ProfilePutBody) => Promise<boolean>;
  locale?: string;
}

/**
 * The settings on the device. `save` keeps them, sends them to the backend
 * and tells every subscriber (the feed reloads its pool).
 */
export const createSettingsStore = ({ store, sendProfile, locale }: SettingsDeps) => {
  let current: Settings | null = null;
  let loading: Promise<Settings> | undefined;
  const listeners = new Set<(settings: Settings) => void>();

  /** Reads the device once; later calls give the current settings (also after a save). */
  const load = async (): Promise<Settings> => {
    loading ??= store
      .get(SETTINGS_KEY)
      .catch(() => null)
      .then(raw => {
        current ??= parse(raw) ?? defaultSettings(locale);
        return current;
      });
    await loading;
    return current!;
  };

  const toBody = ({ country, services, showEverything }: Settings): ProfilePutBody => ({
    country,
    services,
    showEverything,
  });

  const save = async (next: Settings): Promise<Settings> => {
    current = { ...next, services: [...new Set(next.services)] };
    try {
      await store.set(SETTINGS_KEY, JSON.stringify(current));
    } catch (cause) {
      console.warn('[settings] could not keep the settings on the device', cause);
    }
    await sendProfile(toBody(current));
    listeners.forEach(listener => listener(current!));
    return current;
  };

  /** Sends the saved profile again, e.g. at start in case an earlier send failed. */
  const sync = async () => {
    const settings = await load();
    if (settings.setupDone) await sendProfile(toBody(settings));
  };

  const subscribe = (listener: (settings: Settings) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { load, save, sync, subscribe, get: () => current };
};

export type SettingsStore = ReturnType<typeof createSettingsStore>;

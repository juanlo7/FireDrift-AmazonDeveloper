import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

/** Small string store on the device. Survives app restarts. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export const deviceStore: KeyValueStore = {
  get: key => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};

/** For tests: lives as long as the object. */
export const createMemoryStore = (initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} => {
  const data = { ...initial };
  return {
    data,
    get: async key => data[key] ?? null,
    set: async (key, value) => {
      data[key] = value;
    },
  };
};

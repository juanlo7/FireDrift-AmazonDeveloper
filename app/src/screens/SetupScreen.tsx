import React, { useState } from 'react';
import { api } from '../api';
import { Screen } from '../components';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { ServicesForm, settingsStore, useSettings, type Settings } from '../settings';

/**
 * First run (FR-4): pick services and country, or skip with the device
 * country and all services. Either way the feed opens; nothing blocks.
 */
export const SetupScreen = ({ navigation }: RootScreenProps<'Setup'>) => {
  const settings = useSettings();
  const [saving, setSaving] = useState(false);

  const finish = async (next: Settings) => {
    setSaving(true);
    // The profile reaches the backend before the feed asks for its first pool.
    await settingsStore.save({ ...next, setupDone: true });
    navigation.reset({ index: 0, routes: [{ name: 'Feed' }] });
  };

  return (
    <Screen testID="screen-setup">
      {settings ? (
        <ServicesForm
          api={api}
          initial={settings}
          mode="setup"
          onSave={finish}
          onSkip={() => finish({ ...settings, services: [], showEverything: false })}
          saving={saving}
        />
      ) : null}
    </Screen>
  );
};

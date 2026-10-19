import React, { useState } from 'react';
import { api } from '../api';
import { Screen } from '../components';
import type { RootScreenProps } from '../navigation/RootNavigator';
import { ServicesForm, settingsStore, useSettings, type Settings } from '../settings';

/** FR-4 settings: country, services and "show everything". Save goes back to the feed. */
export const SettingsScreen = ({ navigation }: RootScreenProps<'Settings'>) => {
  const settings = useSettings();
  const [saving, setSaving] = useState(false);

  const save = async (next: Settings) => {
    setSaving(true);
    await settingsStore.save(next);
    navigation.goBack();
  };

  return (
    <Screen testID="screen-settings">
      {settings ? <ServicesForm api={api} initial={settings} mode="settings" onSave={save} saving={saving} /> : null}
    </Screen>
  );
};

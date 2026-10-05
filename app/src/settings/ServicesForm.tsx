import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Provider } from '@firedrift/domain';
import type { ApiClient } from '../api';
import { FocusableButton } from '../components';
import { FocusGuideView } from '../focus';
import { colors, spacing, typography } from '../theme';
import { CountryPicker } from './CountryPicker';
import { ProviderTile } from './ProviderTile';
import { countryName, type Settings } from './settingsStore';

/**
 * The grid shows the country's best-known services (TMDB display order), two
 * rows of six. No scroll view: on the VVD it keeps D-pad Down from reaching
 * the buttons below the grid.
 */
export const MAX_PROVIDERS = 12;

/**
 * Not subscriptions the user "has": add-on channels sold inside another service
 * ("MGM+ Amazon Channel"), rent-and-buy stores and JustWatch's own channel.
 */
const NOT_A_SERVICE =
  /\b(amazon|apple tv|roku premium) channels?\b|^amazon video$|\bstore$|google play|fandango|justwatch/i;

export const pickProviders = (providers: Provider[]) =>
  providers.filter(p => !NOT_A_SERVICE.test(p.name)).slice(0, MAX_PROVIDERS);

export interface ServicesFormProps {
  api: ApiClient;
  initial: Settings;
  /** `setup` is the first run (Done / Skip); `settings` edits later (Save). */
  mode: 'setup' | 'settings';
  onSave: (settings: Settings) => void;
  /** Setup only: keep the device country and all services. */
  onSkip?: () => void;
  saving?: boolean;
}

/**
 * FR-4: country, a logo grid of services (OK toggles) and "show everything".
 * Nothing here blocks: without services the feed uses all of them.
 */
export const ServicesForm = ({ api, initial, mode, onSave, onSkip, saving }: ServicesFormProps) => {
  const [country, setCountry] = useState(initial.country);
  const [services, setServices] = useState<number[]>(initial.services);
  const [showEverything, setShowEverything] = useState(initial.showEverything);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickingCountry, setPickingCountry] = useState(false);

  const loadProviders = useCallback(() => {
    setProviders(null);
    setError(null);
    api
      .getProviders(country)
      .then(response => setProviders(pickProviders(response.providers)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [api, country]);

  useEffect(loadProviders, [loadProviders]);

  const toggle = (providerId: number) =>
    setServices(prev =>
      prev.includes(providerId) ? prev.filter(id => id !== providerId) : [...prev, providerId],
    );

  const save = () => onSave({ country, services, showEverything, setupDone: true });
  const picked = services.length;

  return (
    <View style={styles.form} testID="services-form">
      <Text style={styles.title}>{mode === 'setup' ? 'Which services do you have?' : 'Settings'}</Text>
      <Text style={styles.hint} testID="services-hint">
        {picked === 0
          ? mode === 'setup'
            ? 'Pick your services, or skip: FireDrift will use all of them.'
            : 'No services picked: FireDrift uses all of them. Back leaves without saving.'
          : `${picked} service${picked === 1 ? '' : 's'} picked. The feed shows what you can watch on them.`}
      </Text>

      <View style={styles.grid}>
        {error ? (
          <View style={styles.row}>
            <Text style={styles.hint} testID="providers-error">
              Could not load the services: {error}
            </Text>
            <FocusableButton label="Try again" onPress={loadProviders} testID="providers-retry" />
          </View>
        ) : providers === null ? (
          <Text style={styles.hint}>Loading services…</Text>
        ) : (
          providers.map((provider, i) => (
            <ProviderTile
              key={provider.providerId}
              provider={provider}
              selected={services.includes(provider.providerId)}
              onToggle={() => toggle(provider.providerId)}
              hasTVPreferredFocus={i === 0}
            />
          ))
        )}
      </View>

      <FocusGuideView autoFocus style={styles.row}>
        {[
          <FocusableButton
            key="save"
            label={saving ? 'Saving…' : mode === 'setup' ? 'Done' : 'Save'}
            onPress={() => !saving && save()}
            style={styles.button}
            testID="settings-save"
          />,
          ...(mode === 'setup' && onSkip
            ? [
                <FocusableButton
                  key="skip"
                  label="Skip"
                  onPress={() => !saving && onSkip()}
                  style={styles.button}
                  testID="settings-skip"
                />,
              ]
            : []),
          <FocusableButton
            key="country"
            label={`Country: ${country}`}
            accessibilityLabel={`Country: ${countryName(country)}`}
            onPress={() => setPickingCountry(true)}
            style={styles.button}
            testID="settings-country"
          />,
          <FocusableButton
            key="show-all"
            label={`Show all: ${showEverything ? 'On' : 'Off'}`}
            onPress={() => setShowEverything(v => !v)}
            style={styles.button}
            testID="settings-show-everything"
          />,
        ]}
      </FocusGuideView>

      <CountryPicker
        visible={pickingCountry}
        current={country}
        onClose={() => setPickingCountry(false)}
        onPick={code => {
          setPickingCountry(false);
          setCountry(code);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center', gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  button: { paddingHorizontal: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.md },
});

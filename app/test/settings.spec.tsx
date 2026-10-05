import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProfilePutBody } from '@firedrift/domain';
import { createMockClient } from '../src/api';
import {
  COUNTRIES,
  countryFromLocale,
  createSettingsStore,
  defaultSettings,
  FALLBACK_COUNTRY,
  ServicesForm,
  type Settings,
} from '../src/settings';
import { createMemoryStore } from '../src/storage';

const setup = (data: Record<string, string> = {}, sent: ProfilePutBody[] = [], ok = true) => {
  const store = createMemoryStore(data);
  const settings = createSettingsStore({
    store,
    sendProfile: async body => {
      sent.push(body);
      return ok;
    },
    locale: 'es-ES',
  });
  return { store, settings, sent };
};

describe('countryFromLocale', () => {
  it.each([
    ['en-US', 'US'],
    ['es_ES', 'ES'],
    ['es-MX', 'MX'],
    ['pt-BR', 'BR'],
    ['en-GB@calendar=gregorian', 'GB'],
  ])('%s → %s', (locale, country) => expect(countryFromLocale(locale)).toBe(country));

  it(`falls back to ${FALLBACK_COUNTRY} for an unknown or unsupported region`, () => {
    expect(countryFromLocale(undefined)).toBe(FALLBACK_COUNTRY);
    expect(countryFromLocale('en')).toBe(FALLBACK_COUNTRY);
    expect(countryFromLocale('xx-ZZ')).toBe(FALLBACK_COUNTRY);
  });

  it('only offers two-letter country codes', () => {
    for (const { code } of COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/);
  });
});

describe('settings store', () => {
  it('starts with the device country and all services, setup not done', async () => {
    const { settings } = setup();
    expect(await settings.load()).toEqual({ country: 'ES', services: [], showEverything: false, setupDone: false });
  });

  it('keeps the settings on the device, sends the profile and tells subscribers', async () => {
    const { settings, store, sent } = setup();
    const heard: Settings[] = [];
    settings.subscribe(s => heard.push(s));

    await settings.save({ country: 'US', services: [8, 119, 8], showEverything: false, setupDone: true });

    expect(sent).toEqual([{ country: 'US', services: [8, 119], showEverything: false }]);
    expect(heard).toHaveLength(1);
    const reloaded = createSettingsStore({ store, sendProfile: async () => true });
    expect(await reloaded.load()).toEqual({ country: 'US', services: [8, 119], showEverything: false, setupDone: true });
  });

  it('load gives the saved settings, not the first read', async () => {
    const { settings } = setup();
    await settings.load();
    await settings.save({ country: 'GB', services: [8], showEverything: false, setupDone: true });
    expect(await settings.load()).toMatchObject({ country: 'GB', services: [8] });
  });

  it('saves on the device even when the backend is down', async () => {
    const { settings, store } = setup({}, [], false);
    await settings.save({ country: 'GB', services: [8], showEverything: true, setupDone: true });
    expect(JSON.parse(store.data['firedrift.settings']!)).toMatchObject({ country: 'GB' });
  });

  it('ignores broken saved data', async () => {
    const { settings } = setup({ 'firedrift.settings': '{"country":"spain"' });
    expect(await settings.load()).toEqual(defaultSettings('es-ES'));
  });

  it('sync sends the saved profile again only after the setup', async () => {
    const before = setup();
    await before.settings.sync();
    expect(before.sent).toEqual([]);

    const saved = JSON.stringify({ country: 'ES', services: [8], showEverything: false, setupDone: true });
    const after = setup({ 'firedrift.settings': saved });
    await after.settings.sync();
    expect(after.sent).toEqual([{ country: 'ES', services: [8], showEverything: false }]);
  });
});

describe('ServicesForm', () => {
  const initial: Settings = { country: 'ES', services: [], showEverything: false, setupDone: false };

  it('shows the logo grid, toggles services with OK and saves them', async () => {
    const onSave = jest.fn();
    render(<ServicesForm api={createMockClient()} initial={initial} mode="setup" onSave={onSave} onSkip={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('provider-8')).toBeTruthy());

    fireEvent.press(screen.getByTestId('provider-8'));
    fireEvent.press(screen.getByTestId('provider-119'));
    fireEvent.press(screen.getByTestId('provider-119'));
    expect(screen.getByTestId('provider-8-selected')).toBeTruthy();
    expect(screen.queryByTestId('provider-119-selected')).toBeNull();
    expect(screen.getByTestId('services-hint')).toHaveTextContent(/1 service picked/);

    fireEvent.press(screen.getByTestId('settings-show-everything'));
    fireEvent.press(screen.getByTestId('settings-save'));
    expect(onSave).toHaveBeenCalledWith({ country: 'ES', services: [8], showEverything: true, setupDone: true });
  });

  it('changes the country from the picker and loads its services', async () => {
    const api = createMockClient();
    const getProviders = jest.spyOn(api, 'getProviders');
    const onSave = jest.fn();
    render(<ServicesForm api={api} initial={initial} mode="settings" onSave={onSave} />);
    await waitFor(() => expect(screen.getByTestId('provider-8')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-country'));
    fireEvent.press(screen.getByTestId('country-US'));
    await waitFor(() => expect(getProviders).toHaveBeenLastCalledWith('US'));
    expect(screen.getByTestId('settings-country')).toHaveTextContent(/Country: US/);

    fireEvent.press(screen.getByTestId('settings-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ country: 'US' }));
  });

  it('never blocks: when services fail to load, Skip still works', async () => {
    const api = { ...createMockClient(), getProviders: jest.fn().mockRejectedValue(new Error('offline')) };
    const onSkip = jest.fn();
    render(<ServicesForm api={api} initial={initial} mode="setup" onSave={jest.fn()} onSkip={onSkip} />);
    await waitFor(() => expect(screen.getByTestId('providers-error')).toHaveTextContent(/offline/));
    fireEvent.press(screen.getByTestId('settings-skip'));
    expect(onSkip).toHaveBeenCalled();
  });
});

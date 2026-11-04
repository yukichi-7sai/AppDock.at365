import { createInstance } from 'i18next';
import type japanese from '../../resources/translations/host.json';
import { hostResources } from '#host-translations';
import {
  defaultHostLanguage,
  effectiveHostLanguage,
  hostLanguages,
  type HostLanguage,
} from './host-language';

export type HostTextKey = keyof typeof japanese;
export type HostTextValues = Record<string, string | number>;
export type HostTranslator = (key: HostTextKey, values?: HostTextValues) => string;

export function createHostI18n(language: HostLanguage = effectiveHostLanguage()) {
  const instance = createInstance();
  void instance.init({
    lng: effectiveHostLanguage(language),
    load: 'currentOnly',
    fallbackLng: defaultHostLanguage,
    supportedLngs: [...hostLanguages],
    resources: Object.fromEntries(
      hostLanguages.map((code) => [code, { host: { ...hostResources[code] } }]),
    ),
    ns: ['host'],
    defaultNS: 'host',
    keySeparator: false,
    initAsync: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false, skipOnVariables: true },
  });
  return instance;
}

export const hostI18n = createHostI18n();

/** Translate only owned resource keys. User names, paths and external messages are values. */
export function getHostTranslator(language?: HostLanguage): HostTranslator {
  return (key, values) => hostI18n.t(key, { ...values, lng: effectiveHostLanguage(language) });
}

export const hostText = getHostTranslator();

export function updaterWindowMessages() {
  const prefix = 'services.updaterWindow.';
  return Object.fromEntries(
    (Object.keys(hostResources.ja) as HostTextKey[])
      .filter((key) => key.startsWith(prefix))
      .map((key) => [key.slice(prefix.length), hostText(key)]),
  );
}

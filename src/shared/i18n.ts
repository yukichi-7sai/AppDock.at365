import { createInstance } from 'i18next';
import japanese from './locales/ja/host.json';
import { defaultHostLanguage, hostLanguages, type HostLanguage } from './host-language';

export type HostTextKey = keyof typeof japanese;
export type HostTextValues = Record<string, string | number>;
export type HostTranslator = (key: HostTextKey, values?: HostTextValues) => string;

/** Bundled resources initialize synchronously; no network, detector or writable language pack. */
export function createHostI18n(language: HostLanguage = defaultHostLanguage) {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: defaultHostLanguage,
    supportedLngs: [...hostLanguages],
    resources: { ja: { host: { ...japanese } } },
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

const hostI18n = createHostI18n();

/** Translate only owned resource keys. User names, paths and external messages are values. */
export function getHostTranslator(language: HostLanguage = defaultHostLanguage): HostTranslator {
  return (key, values) => hostI18n.t(key, { ...values, lng: language });
}

export const hostText = getHostTranslator();

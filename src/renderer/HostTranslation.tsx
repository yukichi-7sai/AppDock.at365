import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createHostI18n, type HostTranslator } from '../shared/i18n';
import { defaultHostLanguage, type HostLanguage } from '../shared/host-language';

const HostTranslationContext = createContext(createHostI18n());

export function HostTranslationProvider({
  language = defaultHostLanguage,
  children,
}: {
  language?: HostLanguage;
  children: ReactNode;
}) {
  const instance = useMemo(() => createHostI18n(language), [language]);
  return (
    <HostTranslationContext.Provider value={instance}>{children}</HostTranslationContext.Provider>
  );
}

export function useHostTranslation(): { t: HostTranslator; language: HostLanguage } {
  const instance = useContext(HostTranslationContext);
  const { t } = useTranslation('host', { i18n: instance, useSuspense: false });
  return { t: (key, values) => t(key, values), language: instance.language as HostLanguage };
}

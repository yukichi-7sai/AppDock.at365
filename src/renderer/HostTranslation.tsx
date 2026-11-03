import { createContext, Fragment, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { hostI18n, type HostTranslator, type HostTextKey } from '../shared/i18n';
import { effectiveHostLanguage, type HostLanguage } from '../shared/host-language';

const HostTranslationContext = createContext<HostLanguage | undefined>(undefined);

export function HostTranslationProvider({
  language,
  children,
}: {
  language?: HostLanguage;
  children: ReactNode;
}) {
  const current = useSyncExternalStore(window.appdockAppearance.onChanged, effectiveHostLanguage);
  const selected = effectiveHostLanguage(language ?? current);
  return (
    <HostTranslationContext.Provider value={selected}>{children}</HostTranslationContext.Provider>
  );
}

export function useHostTranslation(): { t: HostTranslator; language: HostLanguage } {
  const language = useContext(HostTranslationContext) ?? effectiveHostLanguage();
  const { t } = useTranslation('host', { i18n: hostI18n, lng: language, useSuspense: false });
  return { t: (key, values) => t(key, values), language };
}

/** Insert React nodes after translation; neither resources nor user values are parsed as HTML. */
export function HostMessage({
  message,
  values,
}: {
  message: HostTextKey;
  values: Record<string, ReactNode>;
}) {
  const { t } = useHostTranslation();
  const entries = Object.entries(values);
  const text = t(
    message,
    Object.fromEntries(entries.map(([key], index) => [key, `\uE000${index}\uE001`])),
  );
  return text
    .split(/(\uE000\d+\uE001)/)
    .map((part, index) => (
      <Fragment key={index}>
        {/^\uE000\d+\uE001$/.test(part) ? entries[Number(part.slice(1, -1))]?.[1] : part}
      </Fragment>
    ));
}

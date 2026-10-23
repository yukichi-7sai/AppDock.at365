import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createHostI18n, type HostTranslator, type HostTextKey } from '../shared/i18n';
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

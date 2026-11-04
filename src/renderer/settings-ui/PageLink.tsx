import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { pageLinkKey, type PageLinkTarget } from '../../shared/description-text';
import type { PageReference } from '../../shared/page-links';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import { useOptionalSettingsControls } from './api';
import { useSettingsFeedback } from './SettingsStatus';
import './command-link.css';

const References = createContext<ReadonlyMap<string, PageReference>>(new Map());
export function PageReferencesProvider({
  references = [],
  children,
}: {
  references?: PageReference[];
  children: ReactNode;
}) {
  const index = useMemo(
    () => new Map(references.map((ref) => [pageLinkKey(ref), ref])),
    [references],
  );
  return <References.Provider value={index}>{children}</References.Provider>;
}
export const usePageReferences = () => useContext(References);
export function PageLink({
  kind,
  id,
  focusFallback,
}: PageLinkTarget & {
  focusFallback?: () => HTMLElement | null;
}) {
  const { t } = useHostTranslation();
  const page = usePageReferences().get(pageLinkKey({ kind, id }));
  const controls = useOptionalSettingsControls();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const fallback = useRef(focusFallback);
  fallback.current = focusFallback;
  useLayoutEffect(() => {
    if (!busy && error) {
      const target = button.current?.checkVisibility() ? button.current : fallback.current?.();
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
  }, [busy, error]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useSettingsFeedback({ error, target: page?.title ?? id });
  if (!page)
    return <span className="command-reference-missing">{t('pages.link.unknown', { id })}</span>;
  if (!page.available)
    return (
      <span className="command-reference-missing" title={page.disabledReason}>
        {t('pages.link.disabled', { title: page.title, reason: page.disabledReason ?? '' })}
      </span>
    );
  if (!controls?.openPageLink) return <span>{page.title}</span>;
  const label = t('pages.link.open', { title: page.title });
  return (
    <button
      ref={button}
      type="button"
      className="command-link"
      title={label}
      aria-label={label}
      data-testid={`page-link:${pageLinkKey({ kind, id })}`}
      disabled={busy}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError('');
        void controls.openPageLink!({ kind, id })
          .catch((reason) => {
            if (live.current) setError(reason instanceof Error ? reason.message : String(reason));
          })
          .finally(() => {
            pending.current = false;
            if (live.current) setBusy(false);
          });
      }}
    >
      <Icon name={kind === 'setting' ? 'settings' : 'file'} size={14} />
      <span>{page.title}</span>
    </button>
  );
}

import { useHostTranslation } from '../HostTranslation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SettingsError } from './SettingsError';

type Feedback = {
  error?: string;
  target?: string;
  message?: string;
  busy?: boolean;
  retry?: { label: string; run(): void };
};
type Scope = { errorId: string; publish(id: string, feedback?: Feedback): void };
const SettingsStatusContext = createContext<Scope | null>(null);
const SettingsStatusEntries = createContext<Feedback[]>([]);
export const SettingsFieldTarget = createContext<string | undefined>(undefined);

/** Each page and modal owns its errors, including content rendered through portals. */
export function SettingsStatusProvider({
  children,
  error,
  target,
  busy,
  message,
}: Feedback & { children: ReactNode }) {
  const errorId = useId();
  const [entries, setEntries] = useState<Record<string, Feedback>>({});
  const publish = useCallback((id: string, feedback?: Feedback) => {
    setEntries((current) => {
      const next = { ...current };
      if (feedback) next[id] = feedback;
      else delete next[id];
      return next;
    });
  }, []);
  const scope = useMemo(() => ({ errorId, publish }), [errorId, publish]);
  return (
    <SettingsStatusContext.Provider value={scope}>
      <SettingsFieldTarget.Provider value={undefined}>
        <SettingsStatusEntries.Provider
          value={[{ error, target, busy, message }, ...Object.values(entries)]}
        >
          {children}
        </SettingsStatusEntries.Provider>
      </SettingsFieldTarget.Provider>
    </SettingsStatusContext.Provider>
  );
}

/** Report state without adding a display area to the calling screen. */
export function useSettingsFeedback({
  error,
  target,
  message,
  busy,
  onRetry,
  retryLabel,
}: Omit<Feedback, 'retry'> & { onRetry?(): void; retryLabel?: string }) {
  const { t } = useHostTranslation();
  const scope = useContext(SettingsStatusContext);
  retryLabel ??= t('common.retry');
  const inheritedTarget = useContext(SettingsFieldTarget);
  target ??= inheritedTarget;
  const id = useId();
  const publish = scope?.publish;
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  const retry = useCallback(() => retryRef.current?.(), []);
  const canRetry = !!onRetry;
  useEffect(() => {
    if (!publish || (!error && !message && !busy)) return;
    publish(id, {
      error,
      target,
      message,
      busy,
      retry: error && canRetry ? { label: retryLabel, run: retry } : undefined,
    });
    return () => publish(id);
  }, [publish, id, error, target, message, busy, canRetry, retryLabel, retry]);
  return scope?.errorId;
}

/** Common page layouts can collapse the visual row while keeping live announcements. */
export function SettingsStatusArea({
  action,
  collapseWhenEmpty = false,
}: {
  action?: ReactNode;
  collapseWhenEmpty?: boolean;
}) {
  const { t } = useHostTranslation();
  const scope = useContext(SettingsStatusContext);
  const entries = useContext(SettingsStatusEntries);
  const errors = [
    ...new Set(
      entries
        .filter((entry) => entry.error)
        .map((entry) => (entry.target ? `${entry.target}: ${entry.error}` : entry.error!)),
    ),
  ];
  const messages = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.message ? [entry.message] : entry.busy ? [t('common.processing')] : [],
      ),
    ),
  ];
  return (
    <>
      {(!collapseWhenEmpty || errors.length > 0 || action) && (
        <div className="settings-status-area">
          <SettingsError id={scope?.errorId ?? 'settings-error'} error={errors.join('\n')} />
          {entries
            .filter((entry) => entry.error && entry.retry)
            .map((entry, index) => (
              <button key={index} type="button" disabled={entry.busy} onClick={entry.retry!.run}>
                {entry.retry!.label}
              </button>
            ))}
          {action}
        </div>
      )}
      <span className="sr-only" role="status" aria-atomic="true">
        {messages.join('、')}
      </span>
    </>
  );
}

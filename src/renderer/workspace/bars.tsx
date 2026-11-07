import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HostTranslationProvider, useHostTranslation } from '../HostTranslation';
import { hostText } from '../../shared/i18n';
import { Icon } from '../../shared/ui-icons';
import { shortcutFromEvent } from '../../shared/commands';
import type { WindowBarApi, WindowBarModel } from '../../shared/window-bars';
import './bars.css';

declare global {
  interface Window {
    appdockBar: WindowBarApi;
  }
}
const api = window.appdockBar;
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';
const controls = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (e) => e.getClientRects().length && getComputedStyle(e).visibility === 'visible' && !e.disabled,
  );
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function App() {
  const { t } = useHostTranslation();
  const [model, setModel] = useState<WindowBarModel>();
  const [session, setSession] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const latest = useRef<WindowBarModel | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const accept = (next: WindowBarModel) => {
      if (
        !live ||
        (latest.current?.region === next.region && latest.current.revision > next.revision)
      )
        return;
      if (latest.current?.update.busy !== next.update.busy) setError('');
      latest.current = next;
      document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
      setModel(next);
    };
    const unsubscribe = api.onChanged(accept);
    void api
      .connect()
      .then((connection) => {
        if (live) {
          accept(connection.snapshot);
          setSession(connection.sessionId);
        }
      })
      .catch(() => setError(hostText('workspace.bars.connectFailed')));
    const focus = api.onFocus((edge) => {
      const items = controls();
      (edge === 'first' ? items[0] : items.at(-1))?.focus();
    });
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      const items = controls();
      if (event.key === 'Tab') {
        if (
          event.shiftKey
            ? document.activeElement === items[0]
            : document.activeElement === items.at(-1)
        ) {
          event.preventDefault();
          void api.focusHost(event.shiftKey ? 'before' : 'after');
        }
        return;
      }
      const key = shortcutFromEvent(event);
      if (key)
        void api.shortcut(key).catch(() => setError(hostText('workspace.bars.shortcutFailed')));
    };
    document.addEventListener('keydown', keys);
    return () => {
      live = false;
      unsubscribe();
      focus();
      document.removeEventListener('keydown', keys);
    };
  }, []);
  useEffect(() => {
    if (session && model)
      void api.ready(session).catch(() => setError(hostText('workspace.bars.readyFailed')));
  }, [session, !!model]);
  const act = (operation: keyof WindowBarModel['actions']) => {
    const actionId = model?.actions[operation];
    if (!actionId || pending) return;
    setError('');
    setPending(true);
    void api
      .invoke({ sessionId: session, actionId, requestId: crypto.randomUUID() })
      .catch(() => setError(hostText('workspace.bars.operationFailed')))
      .finally(() => setPending(false));
  };
  if (!model) return null;
  const progress = model.update.progress;
  const updateOperation = model.update.busy && (
    <section
      className={`update-operation${error ? ' has-error' : ''}`}
      aria-label={t('workspace.bars.updateProgress')}
    >
      <Icon name="refresh" size={14} />
      <span
        className="update-operation-message"
        role={error ? 'alert' : 'status'}
        title={error || model.update.phase}
      >
        {error || model.update.phase}
      </span>
      {progress && (
        <>
          <progress
            aria-label={t('workspace.bars.downloadProgress', { name: progress.name })}
            max={progress.totalBytes ?? 1}
            value={
              progress.totalBytes
                ? Math.min(progress.receivedBytes, progress.totalBytes)
                : undefined
            }
          />
          <small>
            {progress.index}/{progress.count} · {megabytes(progress.receivedBytes)}
            {progress.totalBytes ? ` / ${megabytes(progress.totalBytes)}` : ''}
          </small>
        </>
      )}
      <button
        className="text-button"
        disabled={!model.actions.cancel}
        onClick={() => {
          const actionId = model.actions.cancel;
          if (actionId)
            void api
              .invoke({ sessionId: session, actionId, requestId: crypto.randomUUID() })
              .catch(() => setError(hostText('workspace.bars.cancelFailed')));
        }}
      >
        {t('common.cancel')}
      </button>
    </section>
  );
  if (model.region === 'titlebar')
    return (
      <header className="titlebar">
        <div className="titlebar-navigation">
          {(['back', 'forward'] as const).map((direction) => (
            <button
              key={direction}
              data-direction={direction}
              disabled={!model.actions[direction]}
              aria-label={direction === 'back' ? t('navigation.back') : t('navigation.forward')}
              title={direction === 'back' ? t('navigation.back') : t('navigation.forward')}
              onClick={() => act(direction)}
            >
              <Icon name="arrow" size={22} />
            </button>
          ))}
        </div>
        <div className="title-brand">
          <span className="brand-mark small">
            <span />
            <span />
            <span />
          </span>
          <span>
            AppDock<span className="muted">.at365</span>
          </span>
        </div>
        <button className="titlebar-search" onClick={() => act('palette')}>
          <Icon name="search" size={15} /> {t('commands.palette.search')}{' '}
          {model.paletteKey && <kbd>{model.paletteKey}</kbd>}
        </button>
        <button
          className="titlebar-notifications"
          data-testid="notification-center"
          data-active={model.activeNotificationCount > 0 || undefined}
          aria-label={t('workspace.bars.openNotifications', {
            count: model.activeNotificationCount,
          })}
          title={t('workspace.bars.notifications', { count: model.activeNotificationCount })}
          onClick={() => act('notifications')}
        >
          <Icon name="bell" size={17} />
        </button>
        <div className="window-controls">
          {(['minimize', 'maximize', 'close'] as const).map((operation, i) => (
            <button
              key={operation}
              aria-label={
                [
                  t('workspace.bars.minimize'),
                  model.maximized ? t('workspace.bars.restore') : t('workspace.bars.maximize'),
                  t('common.close'),
                ][i]
              }
              className={operation === 'close' ? 'window-close' : ''}
              onClick={() => act(operation)}
            >
              <Icon name={(['minus', 'square', 'close'] as const)[i]} size={14} />
            </button>
          ))}
        </div>
        {error && !model.update.busy && (
          <span className="bar-error" role="alert" title={error}>
            {error}
          </span>
        )}
        {updateOperation}
      </header>
    );
  return (
    <footer className="statusbar">
      <span
        className="statusbar-jobs"
        data-attention={model.jobs.attention > 0}
        title={t('generationJobs.countDetails', model.jobs)}
        role="status"
      >
        {t('generationJobs.counts', model.jobs)}
        {model.jobs.attention > 0 && <span>{t('generationJobs.attentionCount', model.jobs)}</span>}
      </span>
      <span className="statusbar-activity">
        <i />
        {t('workspace.bars.runningApplets', { count: model.runningApplets })}
      </span>
      <span>
        AppDock.at365 <span className="muted">v{model.version}</span>
        <span className="version-check">
          <button
            className="text-button"
            disabled={pending || !model.actions.update}
            title={model.update.blocked ? t('workspace.bars.updateBlocked') : undefined}
            onClick={() => act('update')}
          >
            {pending ? t('images.working') : t('workspace.bars.update')}
          </button>
        </span>
      </span>
      {error && !model.update.busy && (
        <span className="bar-error" role="alert" title={error}>
          {error}
        </span>
      )}
    </footer>
  );
}
createRoot(document.getElementById('root')!).render(
  <HostTranslationProvider>
    <App />
  </HostTranslationProvider>,
);

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../../src/shared/ui-icons';
import { shortcutFromEvent } from '../../src/shared/commands';
import type { ShellBarApi, ShellBarModel } from '../../src/shared/shell-bars';
import './bars.css';

declare global {
  interface Window {
    appdockBar: ShellBarApi;
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
  const [model, setModel] = useState<ShellBarModel>();
  const [session, setSession] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const latest = useRef<ShellBarModel | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const accept = (next: ShellBarModel) => {
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
      .catch(() => setError('画面を接続できません。Shellを再試行してください。'));
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
        void api.shortcut(key).catch(() => setError('ショートカットを実行できませんでした。'));
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
      void api.ready(session).catch(() => setError('画面を表示できませんでした。'));
  }, [session, !!model]);
  const act = (operation: keyof ShellBarModel['actions']) => {
    const actionId = model?.actions[operation];
    if (!actionId || pending) return;
    setError('');
    setPending(true);
    void api
      .invoke({ sessionId: session, actionId, requestId: crypto.randomUUID() })
      .catch(() =>
        setError('操作を完了できませんでした。ログと通信環境を確認して、もう一度お試しください。'),
      )
      .finally(() => setPending(false));
  };
  if (!model) return null;
  const progress = model.update.progress;
  const updateOperation = model.update.busy && (
    <section className={`update-operation${error ? ' has-error' : ''}`} aria-label="更新の進捗">
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
            aria-label={`${progress.name}の取得状況`}
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
              .catch(() => setError('更新をキャンセルできませんでした。'));
        }}
      >
        キャンセル
      </button>
    </section>
  );
  if (model.region === 'titlebar')
    return (
      <header className="titlebar">
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
          <Icon name="search" size={15} /> コマンドを検索{' '}
          {model.paletteKey && <kbd>{model.paletteKey}</kbd>}
        </button>
        <button
          className="titlebar-notifications"
          data-testid="notification-center"
          data-active={model.activeNotificationCount > 0 || undefined}
          aria-label={`通知センターを開く（アクティブ ${model.activeNotificationCount}件）`}
          title={`通知センター（アクティブ ${model.activeNotificationCount}件）`}
          onClick={() => act('notifications')}
        >
          <Icon name="bell" size={17} />
        </button>
        <div className="window-controls">
          {(['minimize', 'maximize', 'close'] as const).map((operation, i) => (
            <button
              key={operation}
              aria-label={['最小化', model.maximized ? '元に戻す' : '最大化', '閉じる'][i]}
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
      <span className="statusbar-activity">
        <i />
        実行中 {model.runningApplets} Applet
      </span>
      <span>
        AppDock.at365 <span className="muted">v{model.version}</span>
        <span className="version-check">
          <button
            className="text-button"
            disabled={pending || !model.actions.update}
            title={model.update.blocked ? '設定の処理が完了するまでお待ちください。' : undefined}
            onClick={() => act('update')}
          >
            {pending ? '処理中…' : 'AppDockを更新'}
          </button>
        </span>
      </span>
      {error && !model.update.busy && (
        <span className="bar-error" role="alert" title={error}>
          {error}
        </span>
      )}
      <button onClick={() => act('palette')}>
        <Icon name="command" size={12} />
        コマンドパレット
        {model.paletteKey && <kbd>{model.paletteKey}</kbd>}
      </button>
    </footer>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  LogFilters,
  ShellPageAction,
  ShellPageApi,
  ShellPageModel,
  LogPageModel,
} from '../../src/shared/shell-pages';
import { shortcutFromEvent } from '../../src/shared/commands';
import { Icon } from '../../src/shared/ui-icons';
import './logs.css';
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';
declare global {
  interface Window {
    appdockPage: ShellPageApi;
  }
}
const api = window.appdockPage;
function App() {
  const [model, setModel] = useState<LogPageModel>();
  const [session, setSession] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<LogFilters>({ source: '', level: 'all', text: '' });
  const pending = useRef(0);
  const latest = useRef<ShellPageModel | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const accept = (next: ShellPageModel) => {
      if (live && next.kind === 'logs') {
        if (latest.current?.id === next.id && latest.current.revision > next.revision) return;
        latest.current = next;
        document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
        setModel(next);
        if (!pending.current) setFilters(next.content.filters);
      }
    };
    const unsubscribe = api.onChanged(accept);
    void api
      .connect()
      .then((c) => {
        if (live) {
          accept(c.snapshot);
          setSession(c.sessionId);
        }
      })
      .catch((e) => setError(String(e)));
    const focus = api.onFocus((edge) => {
      const controls = [...document.querySelectorAll<HTMLElement>('button, input, select')];
      (edge === 'first' ? controls[0] : controls.at(-1))?.focus();
    });
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      if (event.key === 'Tab') {
        const controls = [
          ...document.querySelectorAll<HTMLElement>('button, input, select'),
        ].filter((e) => !e.matches(':disabled'));
        if (
          event.shiftKey
            ? document.activeElement === controls[0]
            : document.activeElement === controls.at(-1)
        ) {
          event.preventDefault();
          void api.focusHost(event.shiftKey ? 'before' : 'after');
        }
        return;
      }
      if (
        !event.ctrlKey &&
        !event.altKey &&
        event.target instanceof Element &&
        event.target.closest('input, select, textarea')
      )
        return;
      const key = shortcutFromEvent(event);
      if (key) void api.shortcut(key).catch((e) => setError(String(e)));
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
    if (session && model) void api.ready(session).catch((e) => setError(String(e)));
  }, [session, !!model]);
  const act = (action: ShellPageAction) => {
    setError('');
    void api.act(action).catch((e) => setError(String(e)));
  };
  const change = (next: LogFilters) => {
    setFilters(next);
    if (!model) return;
    pending.current++;
    void api
      .act({ id: model.id, type: 'filters', filters: next })
      .catch((e) => setError(String(e)))
      .finally(() => {
        pending.current--;
      });
  };
  if (!model) return error ? <p role="alert">{error}</p> : null;
  const content = model.content;
  return (
    <main className="logs-page" data-embedded={content.scope.type !== 'all'}>
      <div className="page-heading compact">
        {content.scope.type === 'all' ? <h1>ログ</h1> : <h3>ログ</h3>}
        <button className="secondary" onClick={() => act({ id: model.id, type: 'open-directory' })}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3 7V5h6l2 2h10v13H3Z" />
          </svg>
          保存先を開く
        </button>
      </div>
      <div className="log-toolbar">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          aria-label="ログを検索"
          placeholder="ログを検索…"
          value={filters.text}
          maxLength={4000}
          onChange={(e) => change({ ...filters, text: e.target.value })}
        />
        {content.scope.type === 'all' && (
          <div className="log-source-filter">
            <select
              aria-label="ログのApplet"
              value={filters.source}
              onChange={(e) => change({ ...filters, source: e.target.value })}
            >
              <option value="">すべてのログ</option>
              {content.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {filters.source && (
              <button
                type="button"
                className="log-filter-clear"
                title="Appletの絞り込みを解除"
                aria-label="Appletの絞り込みを解除"
                onClick={() => change({ ...filters, source: '' })}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        )}
        <select
          aria-label="ログレベル"
          value={filters.level}
          onChange={(e) => change({ ...filters, level: e.target.value as LogFilters['level'] })}
        >
          <option value="all">すべてのレベル</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <span>{content.entries.length} 件</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="log-table">
        <div className="log-head">
          <span>TIME</span>
          <span>LEVEL</span>
          <span>SOURCE / MESSAGE</span>
        </div>
        {[...content.entries].reverse().map((l, i) => (
          <div className="log-row" key={i}>
            <time>{new Date(l.time).toLocaleTimeString('ja-JP')}</time>
            <span className={`log-level ${l.level}`}>{l.level}</span>
            <div>
              <span>{l.source}</span>
              <p>{l.message}</p>
            </div>
          </div>
        ))}
        {!content.entries.length && <div className="empty">該当するログはありません。</div>}
      </div>
      <p className="footnote">
        画面には直近{content.limit}件を表示します。ファイルログは1MBでローテーションします。
      </p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

import { useEffect, useRef, useState } from 'react';
import type {
  LogFilters,
  HostPageAction,
  HostPageModel,
  LogPageModel,
} from '../../shared/host-pages';
import { Icon } from '../../shared/ui-icons';
import './logs.css';
const api = window.dock.pages;
export function LogPage({ initialModel }: { initialModel: LogPageModel }) {
  const [model, setModel] = useState<LogPageModel>(initialModel);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<LogFilters>({ source: '', level: 'all', text: '' });
  const pending = useRef(0);
  const latest = useRef<LogPageModel | undefined>(initialModel);
  useEffect(() => {
    const live = true;
    const accept = (next: HostPageModel) => {
      if (live && next.kind === 'logs') {
        if (latest.current?.id === next.id && latest.current.revision > next.revision) return;
        latest.current = next;
        setModel(next);
        if (!pending.current) setFilters(next.content.filters);
      }
    };
    accept(initialModel);
  }, [initialModel]);
  const act = (action: HostPageAction) => {
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
    <section className="logs-page" data-embedded={content.scope.type !== 'all'}>
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
    </section>
  );
}

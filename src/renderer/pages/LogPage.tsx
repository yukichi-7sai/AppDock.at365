import { useEffect, useRef, useState } from 'react';
import type {
  LogFilters,
  HostPageAction,
  HostPageModel,
  LogPageModel,
} from '../../shared/host-pages';
import { Icon } from '../../shared/ui-icons';
import { FilterSelect } from '../settings-ui/FilterSelect';
import './logs.css';
const api = window.dock.pages;
export function LogPage({ initialModel }: { initialModel: LogPageModel }) {
  const [model, setModel] = useState<LogPageModel>(initialModel);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<LogFilters>(initialModel.content.filters);
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
  const clearFilters = () =>
    change({
      source: content.scope.type === 'all' ? '' : filters.source,
      level: 'all',
      category: 'all',
      text: '',
    });
  const filtered =
    !!filters.text ||
    (content.scope.type === 'all' && !!filters.source) ||
    filters.level !== 'all' ||
    filters.category !== 'all';
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
        <div className="log-search">
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
            type="search"
            aria-label="ログを検索"
            placeholder="ログを検索…"
            value={filters.text}
            maxLength={4000}
            onChange={(e) => change({ ...filters, text: e.target.value })}
          />
        </div>
        <div className="log-filter-row">
          {content.scope.type === 'all' && (
            <div className="log-source-filter">
              <FilterSelect
                allValue=""
                aria-label="ログのApplet"
                value={filters.source}
                onChange={(e) => change({ ...filters, source: e.target.value })}
              >
                <option value="">すべてのApplet・本体</option>
                {content.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </FilterSelect>
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
          <FilterSelect
            aria-label="ログの種類"
            value={filters.category}
            onChange={(e) =>
              change({ ...filters, category: e.target.value as LogFilters['category'] })
            }
          >
            <option value="all">すべての種類</option>
            <option value="normal">通常</option>
            <option value="audit">監査</option>
          </FilterSelect>
          <FilterSelect
            aria-label="ログレベル"
            value={filters.level}
            onChange={(e) => change({ ...filters, level: e.target.value as LogFilters['level'] })}
          >
            <option value="all">すべてのレベル</option>
            <option value="standard">Info以上</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </FilterSelect>
          <button type="button" className="log-reset" disabled={!filtered} onClick={clearFilters}>
            <Icon name="close" size={16} />
            絞り込みを解除
          </button>
        </div>
      </div>
      <div className="log-summary" aria-live="polite">
        <span>{content.entries.length} 件</span>
        {filters.category === 'normal' && <span>監査の警告・エラーも表示します</span>}
      </div>
      {error && <p role="alert">{error}</p>}
      {content.storage && (
        <div className="log-storage" role="status" data-mode={content.storage.mode}>
          <span>
            {content.storage.mode === 'memory'
              ? 'ファイルへ保存できません。画面内のログだけ保持しています。'
              : content.storage.mode === 'local'
                ? 'このPCに退避中（同期されません）'
                : '端末別の共有ログ'}
          </span>
          {content.storage.mode !== 'memory' && <span>{content.storage.directory}</span>}
        </div>
      )}
      <div className="log-table" role="table" aria-label="ログ一覧">
        <div className="log-head" role="row">
          <span role="columnheader">時刻</span>
          <span role="columnheader">レベル・種類</span>
          <span role="columnheader">提供元 / メッセージ</span>
        </div>
        {[...content.entries].reverse().map((l, i) => (
          <div className="log-row" role="row" key={i}>
            <time role="cell" dateTime={l.time} title={new Date(l.time).toLocaleString('ja-JP')}>
              {new Date(l.time).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3,
              })}
            </time>
            <div className="log-badges" role="cell">
              <span className={`log-level ${l.level}`}>{l.level}</span>
              <span className="log-kind" data-category={l.category ?? 'normal'}>
                {l.category === 'audit' ? '監査' : '通常'}
              </span>
            </div>
            <div role="cell">
              <span>{l.source}</span>
              <p>{l.message}</p>
            </div>
          </div>
        ))}
        {!content.entries.length && <div className="empty">該当するログはありません。</div>}
      </div>
      <p className="footnote">
        直近{content.limit}
        件から絞り込んで表示します。Debug・監査もファイルに記録されます。ファイルログは1MBでローテーションします。
      </p>
    </section>
  );
}

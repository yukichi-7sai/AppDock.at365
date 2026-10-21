import { useEffect, useRef, useState } from 'react';
import type { HostPageModel } from '../../shared/host-pages';
import type {
  NotificationCenterModel,
  NotificationCenterOperation,
  NotificationCenterFilters,
} from '../../shared/notification-center';
import './notification-center.css';
const api = window.dock.pages;
const states = {
  active: 'アクティブ',
  resolved: '解消済み',
  dismissed: '閉じた通知',
  expired: '期限切れ',
  withdrawn: '撤回',
  interrupted: '前回の起動で終了',
};
const reasons: Record<string, string> = {
  'source-stopped': '発行元が停止しました',
  'type-disabled': '通知設定でオフにしました',
  'applet-disabled': 'Applet通知の共通設定でオフにしました',
  'type-removed': '通知種類の定義がなくなりました',
  'type-definition-changed': '通知種類の定義が変わりました',
  'no-available-targets': '選択した通知先を利用できません',
};
const levels = { info: '情報', warning: '警告', error: 'エラー' };
export function NotificationCenterPage({
  initialModel,
}: {
  initialModel: NotificationCenterModel;
}) {
  const [model, setModel] = useState<NotificationCenterModel>(initialModel),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]),
    [pending, setPending] = useState(false);
  const [filters, setFilters] = useState<NotificationCenterFilters>();
  const acceptModel = useRef<(next: HostPageModel) => void>(() => {});
  const latest = useRef<NotificationCenterModel | undefined>(initialModel),
    filterRequests = useRef(0);
  useEffect(() => {
    const live = true;
    const accept = (next: HostPageModel) => {
      if (
        !live ||
        next.kind !== 'notifications' ||
        (latest.current?.id === next.id && latest.current.revision > next.revision)
      )
        return;
      latest.current = next;
      setModel(next);
      if (!filterRequests.current) setFilters(next.content.filters);
      setSelected((ids) => ids.filter((id) => next.content.items.some((i) => i.id === id)));
    };
    acceptModel.current = accept;
    accept(initialModel);
  }, [initialModel]);
  const act = async (action: NotificationCenterOperation) => {
    const current = latest.current;
    if (!current) return;
    setError('');
    setPending(true);
    try {
      await api.act({ id: current.id, type: 'notifications', action });
    } catch (e) {
      setError(String(e));
    } finally {
      // A completed operation may precede the host's aggregated change event.
      // Refresh through the same public bridge before enabling another operation.
      await api
        .get(current.id)
        .then((next) => {
          if (next) acceptModel.current(next);
        })
        .catch(() => {});
      setPending(false);
    }
  };
  const change = (next: NotificationCenterFilters) => {
    setFilters(next);
    setSelected([]);
    setError('');
    const current = latest.current;
    if (!current) return;
    filterRequests.current++;
    void api
      .act({ id: current.id, type: 'notifications', action: { type: 'filters', filters: next } })
      .catch((e) => setError(String(e)))
      .finally(() => {
        filterRequests.current--;
      });
  };
  if (!model || !filters) return error ? <p role="alert">{error}</p> : null;
  const c = model.content,
    history = filters.tab === 'history';
  const filterPending = JSON.stringify(filters) !== JSON.stringify(c.filters);
  const selectedPersistent = c.items.some(
    (i) => selected.includes(i.id) && i.historyPolicy === 'persistent',
  );
  return (
    <section className="notification-center">
      <header>
        <h1>通知センター</h1>
        <span className="muted">未読 {c.unreadCount}件</span>
      </header>
      <nav aria-label="通知の表示">
        <button aria-pressed={!history} onClick={() => change({ ...filters, tab: 'active' })}>
          アクティブ {c.activeCount}
        </button>
        <button aria-pressed={history} onClick={() => change({ ...filters, tab: 'history' })}>
          履歴 {c.historyCount}
        </button>
      </nav>
      <div className="notification-filters">
        <input
          aria-label="通知を検索"
          placeholder="通知を検索…"
          value={filters.text}
          maxLength={1000}
          onChange={(e) => change({ ...filters, text: e.target.value })}
        />
        <select
          aria-label="通知レベル"
          value={filters.level}
          onChange={(e) => change({ ...filters, level: e.target.value as any })}
        >
          <option value="all">すべてのレベル</option>
          {Object.entries(levels).map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select
          aria-label="通知の発行元"
          value={filters.source}
          onChange={(e) => change({ ...filters, source: e.target.value })}
        >
          <option value="">すべての発行元</option>
          {c.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {history && (
          <select
            aria-label="通知の状態"
            value={filters.status}
            onChange={(e) => change({ ...filters, status: e.target.value as any })}
          >
            <option value="all">すべての状態</option>
            {Object.entries(states)
              .filter(([id]) => id !== 'active')
              .map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
          </select>
        )}
        <label>
          <input
            type="checkbox"
            checked={filters.unread}
            onChange={(e) => change({ ...filters, unread: e.target.checked })}
          />
          未読のみ
        </label>
      </div>
      {(c.saveError || !c.writable) && (
        <p role="status">
          {!c.writable
            ? '通知履歴の保存形式が未対応です。保存が必要な既読・削除は利用できません。'
            : '通知履歴を保存できませんでした。保存先を確認してから再試行してください。'}
        </p>
      )}
      {error && (
        <p className="center-error" role="alert">
          {error}
          <button onClick={() => void act({ type: 'refresh' })}>再読み込み</button>
        </p>
      )}
      <div className="notification-tools">
        <button
          disabled={
            pending || filterPending || !selected.length || (!c.writable && selectedPersistent)
          }
          onClick={() => void act({ type: 'read', ids: selected, token: c.token })}
        >
          選択した通知を既読
        </button>
        <button
          disabled={
            pending ||
            filterPending ||
            !c.total ||
            (!c.writable && c.items.some((i) => i.historyPolicy === 'persistent'))
          }
          onClick={() => void act({ type: 'read', scope: 'filtered', token: c.token })}
        >
          この条件の通知を既読
        </button>
        {history && (
          <>
            <button
              disabled={
                pending || filterPending || !selected.length || (!c.writable && selectedPersistent)
              }
              onClick={() => void act({ type: 'delete', ids: selected, token: c.token })}
            >
              選択した履歴を削除
            </button>
            <button
              disabled={pending || filterPending || !c.total || !c.writable}
              onClick={() => void act({ type: 'delete', scope: 'filtered', token: c.token })}
            >
              この条件の履歴を削除
            </button>
            <button
              disabled={pending || filterPending || !c.historyCount || !c.writable}
              onClick={() => void act({ type: 'delete', scope: 'all', token: c.token })}
            >
              履歴をすべて削除
            </button>
          </>
        )}
      </div>
      <div className="notification-list" aria-label={history ? '通知履歴' : 'アクティブな通知'}>
        {!c.items.length && <p className="muted">該当する通知はありません。</p>}
        {c.items.map((i) => (
          <article
            key={i.id}
            className={'center-card level-' + i.level}
            data-notification-id={i.id}
          >
            <div className="center-card-heading">
              <input
                type="checkbox"
                aria-label={i.title + 'を選択'}
                checked={selected.includes(i.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked ? [...ids, i.id] : ids.filter((id) => id !== i.id),
                  )
                }
              />
              <strong>{i.title}</strong>
              {!i.read && <span className="unread-mark">未読</span>}
              <span className="center-card-level">{levels[i.level]}</span>
            </div>
            <p className="notification-body">{i.body}</p>
            <p className="muted">
              {i.ownerTitle} · {i.typeTitle} · {states[i.status]} ·{' '}
              {new Date(i.endedAt ?? i.createdAt).toLocaleString()}
              {i.endReason && ' · ' + (reasons[i.endReason] ?? '通知の方針が変わりました')}
            </p>
            <div className="center-card-actions">
              {!i.read && (
                <button
                  disabled={
                    pending || filterPending || (!c.writable && i.historyPolicy === 'persistent')
                  }
                  onClick={() => void act({ type: 'read', ids: [i.id], token: c.token })}
                >
                  既読にする
                </button>
              )}
              {i.status === 'active' ? (
                <>
                  {i.actions.map((a) => (
                    <button
                      key={a.id}
                      disabled={a.disabled || i.busy || pending}
                      onClick={() =>
                        void act({
                          type: 'act',
                          request: {
                            notificationId: i.id,
                            revision: i.revision,
                            requestId: crypto.randomUUID(),
                            type: 'invoke',
                            actionId: a.id,
                          },
                        })
                      }
                    >
                      {a.label}
                    </button>
                  ))}
                  {i.dismissible && (
                    <button
                      disabled={i.busy || pending}
                      onClick={() =>
                        void act({
                          type: 'act',
                          request: {
                            notificationId: i.id,
                            revision: i.revision,
                            requestId: crypto.randomUUID(),
                            type: 'dismiss',
                          },
                        })
                      }
                    >
                      閉じる
                    </button>
                  )}
                </>
              ) : (
                <button
                  disabled={
                    pending || filterPending || (!c.writable && i.historyPolicy === 'persistent')
                  }
                  onClick={() => void act({ type: 'delete', ids: [i.id], token: c.token })}
                >
                  履歴を削除
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {history && (
        <footer className="center-pagination">
          <span>
            {c.total ? c.offset + 1 : 0}〜{Math.min(c.offset + c.items.length, c.total)} / {c.total}
            件
          </span>
          <button
            disabled={pending || filterPending || !c.offset}
            onClick={() => void act({ type: 'refresh' })}
          >
            最初へ
          </button>
          <button
            disabled={pending || filterPending || !c.nextCursor}
            onClick={() => void act({ type: 'page', cursor: c.nextCursor! })}
          >
            次の50件
          </button>
        </footer>
      )}
    </section>
  );
}

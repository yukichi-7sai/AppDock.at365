import { hostText } from '../../shared/i18n';
import { NotificationDismissButton } from '../../../ui/notifications/DismissButton';
import { useEffect, useRef, useState } from 'react';
import type { HostPageModel } from '../../shared/host-pages';
import type {
  NotificationCenterModel,
  NotificationCenterOperation,
  NotificationCenterFilters,
} from '../../shared/notification-center';
import './notification-center.css';
import { FilterSelect } from '../settings-ui/FilterSelect';
const api = window.dock.pages;
const states = {
  active: hostText('notifications.active'),
  resolved: hostText('notifications.resolved'),
  dismissed: hostText('notifications.dismissed'),
  expired: hostText('notifications.expired'),
  withdrawn: hostText('notifications.withdrawn'),
};
const reasons: Record<string, string> = {
  'source-stopped': hostText('notifications.sourceStopped'),
  'type-disabled': hostText('notifications.typeDisabled'),
  'applet-disabled': hostText('notifications.appletDisabled'),
  'type-removed': hostText('notifications.typeRemoved'),
  'type-definition-changed': hostText('notifications.typeChanged'),
  'no-available-targets': hostText('notifications.noTargets'),
};
const levels = {
  info: hostText('notifications.info'),
  warning: hostText('notifications.warning'),
  error: hostText('notifications.error'),
};
export function NotificationCenterPage({
  initialModel,
}: {
  initialModel: NotificationCenterModel;
}) {
  const [model, setModel] = useState<NotificationCenterModel>(initialModel),
    [error, setError] = useState('');
  const [pending, setPending] = useState(false);
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
  return (
    <section className="notification-center" data-testid="notification-center">
      <header>
        <h1>{hostText('notifications.title')}</h1>
        <span className="muted">{hostText('notifications.sessionHint')}</span>
      </header>
      <nav aria-label={hostText('notifications.display')} data-testid="notification-tabs">
        <button aria-pressed={!history} onClick={() => change({ ...filters, tab: 'active' })}>
          {hostText('notifications.active')} {c.activeCount}
        </button>
        <button aria-pressed={history} onClick={() => change({ ...filters, tab: 'history' })}>
          {hostText('notifications.history')} {c.historyCount}
        </button>
      </nav>
      <div className="notification-filters" data-testid="notification-filters">
        <input
          data-testid="notification-search"
          aria-label={hostText('notifications.search')}
          placeholder={hostText('notifications.searchPlaceholder')}
          value={filters.text}
          maxLength={1000}
          onChange={(e) => change({ ...filters, text: e.target.value })}
        />
        <FilterSelect
          aria-label={hostText('notifications.level')}
          value={filters.level}
          onChange={(e) => change({ ...filters, level: e.target.value as any })}
        >
          <option value="all">{hostText('notifications.allLevels')}</option>
          {Object.entries(levels).map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          allValue=""
          aria-label={hostText('notifications.source')}
          value={filters.source}
          onChange={(e) => change({ ...filters, source: e.target.value })}
        >
          <option value="">{hostText('notifications.allSources')}</option>
          {c.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </FilterSelect>
        {history && (
          <FilterSelect
            aria-label={hostText('notifications.state')}
            value={filters.status}
            onChange={(e) => change({ ...filters, status: e.target.value as any })}
          >
            <option value="all">{hostText('notifications.allStates')}</option>
            {Object.entries(states)
              .filter(([id]) => id !== 'active')
              .map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
          </FilterSelect>
        )}
      </div>
      {error && (
        <p className="center-error" role="alert">
          {error}
          <button onClick={() => void act({ type: 'refresh' })}>
            {hostText('notifications.refresh')}
          </button>
        </p>
      )}
      <div
        className="notification-list"
        aria-label={
          history ? hostText('notifications.historyList') : hostText('notifications.activeList')
        }
      >
        {!c.items.length && <p className="muted">{hostText('notifications.empty')}</p>}
        {c.items.map((i) => (
          <div key={i.id} className="notification-row" data-testid="notification-row">
            <div className="notification-row-controls">
              {i.status === 'active' && i.dismissible && (
                <NotificationDismissButton
                  title={i.title}
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
                />
              )}
            </div>
            <article
              className={'center-card level-' + i.level}
              data-testid="notification-card"
              data-notification-id={i.id}
            >
              <div className="center-card-heading">
                <strong>{i.title}</strong>
                <span className="center-card-level">{levels[i.level]}</span>
              </div>
              <p className="notification-body">{i.body}</p>
              <p className="muted">
                {i.ownerTitle} · {i.typeTitle} · {states[i.status]} ·{' '}
                {new Date(i.endedAt ?? i.createdAt).toLocaleString()}
                {i.endReason &&
                  ' · ' + (reasons[i.endReason] ?? hostText('notifications.policyChanged'))}
              </p>
              {i.status === 'active' && i.actions.length > 0 && (
                <div className="center-card-actions">
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
                </div>
              )}
            </article>
          </div>
        ))}
      </div>
      {history && (
        <footer className="center-pagination">
          <span>
            {hostText('notifications.pageRange', {
              start: c.total ? c.offset + 1 : 0,
              end: Math.min(c.offset + c.items.length, c.total),
              count: c.total,
            })}
          </span>
          <button
            disabled={pending || filterPending || !c.offset}
            onClick={() => void act({ type: 'refresh' })}
          >
            {hostText('notifications.first')}
          </button>
          <button
            disabled={pending || filterPending || !c.nextCursor}
            onClick={() => void act({ type: 'page', cursor: c.nextCursor! })}
          >
            {hostText('notifications.next')}
          </button>
        </footer>
      )}
    </section>
  );
}

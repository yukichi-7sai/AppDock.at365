import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NotificationDismissButton } from '../../ui/notifications/DismissButton';
import type {
  NotificationBannerApi,
  NotificationBannerModel,
  NotificationItem,
} from '../../src/shared/notifications';
import './notifications.css';
declare global {
  interface Window {
    appdockNotifications: NotificationBannerApi;
  }
}
const api = window.appdockNotifications;
const labels = { info: 'インフォメーション', warning: '警告', error: 'エラー' };
function App() {
  const [model, setModel] = useState<NotificationBannerModel>();
  const [session, setSession] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const lane = useRef<HTMLDivElement>(null);
  const focused = useRef<string | null>(null);
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState({ text: '', urgent: false });
  useEffect(() => {
    let live = true;
    const accept = (next: NotificationBannerModel) => {
      if (!live) return;
      document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
      setModel((old) =>
        old && old.sessionId === next.sessionId && old.revision > next.revision ? old : next,
      );
      const fresh = next.items.filter((i) => !announced.current.has(i.id));
      fresh.forEach((i) => announced.current.add(i.id));
      if (fresh.length)
        setAnnouncement({
          text: fresh.map((i) => labels[i.level] + '、' + i.title).join('。'),
          urgent: fresh.some((i) => i.level === 'error'),
        });
    };
    const stop = api.onChanged(accept);
    void api
      .connect()
      .then((c) => {
        accept(c.snapshot);
        if (live) setSession(c.sessionId);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
      stop();
    };
  }, []);
  useLayoutEffect(() => {
    if (session && model) void api.ready(session).catch((e) => setError(String(e)));
  }, [session, !!model]);
  useEffect(
    () =>
      api.onFocus(() => lane.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()),
    [],
  );
  useLayoutEffect(() => {
    const element = lane.current;
    if (!element) return;
    const update = () =>
      void api
        .resize(Math.max(1, Math.ceil(element.getBoundingClientRect().height)))
        .catch(() => {});
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [model, expanded, error]);
  const act = (item: NotificationItem, type: 'invoke' | 'dismiss', actionId?: string) => {
    setError('');
    void api
      .act({
        notificationId: item.id,
        revision: item.revision,
        requestId: crypto.randomUUID(),
        type,
        actionId,
      })
      .catch((e) => setError(String(e)));
  };
  if (!model) return null;
  const all = model.items;
  const pinned = focused.current && all.findIndex((i) => i.id === focused.current) >= 3;
  const items = expanded || pinned ? all : all.slice(0, 3);
  return (
    <div
      ref={lane}
      className={'notification-lane ' + (model.surface === 'desktop' ? 'desktop-lane' : '')}
      style={{ maxHeight: model.viewport.maxHeight }}
      onFocusCapture={(e) => {
        focused.current =
          (e.target as HTMLElement).closest<HTMLElement>('[data-notification-id]')?.dataset
            .notificationId ?? null;
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused.current = null;
      }}
      onKeyDown={(e) => {
        if (e.isDefaultPrevented() || e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          void api.focusHost();
        }
        if (e.key === 'Tab') {
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          if (
            e.shiftKey
              ? document.activeElement === buttons[0]
              : document.activeElement === buttons.at(-1)
          ) {
            e.preventDefault();
            void api.focusHost();
          }
        }
      }}
    >
      <div
        className="sr-only"
        aria-live={announcement.urgent ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {announcement.text}
      </div>
      {items.map((item) => (
        <section
          key={item.id}
          className={
            'notification-card level-' + item.level + (item.dismissible ? ' dismissible' : '')
          }
          data-notification-id={item.id}
          role="region"
          aria-label={item.title}
        >
          <div className="notification-copy">
            <span className="notification-level">
              <span aria-hidden="true">
                {item.level === 'info' ? 'ⓘ' : item.level === 'warning' ? '⚠' : '⛔'}
              </span>{' '}
              {labels[item.level]}
            </span>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
          {item.actions.length > 0 && (
            <div className="notification-actions">
              {item.actions.map((action) => (
                <button
                  key={action.id}
                  className={action.primary ? 'primary' : ''}
                  disabled={item.busy || action.disabled}
                  onClick={() => act(item, 'invoke', action.id)}
                >
                  {item.busy && action.primary ? '処理中…' : action.label}
                </button>
              ))}
            </div>
          )}
          {item.dismissible && (
            <NotificationDismissButton
              title={item.title}
              disabled={item.busy}
              onClick={() => act(item, 'dismiss')}
            />
          )}
        </section>
      ))}
      {all.length > 3 && (
        <button className="notification-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? '折りたたむ' : 'ほか' + (all.length - 3) + '件を表示'}
        </button>
      )}
      {model.surface === 'desktop' && (
        <button
          className="notification-more"
          onClick={() => void api.openCenter().catch((e) => setError(String(e)))}
        >
          通知センターを開く（{all.length}件）
        </button>
      )}
      {error && all.length > 0 && (
        <p className="notification-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

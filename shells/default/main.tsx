import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { RibbonView, ShellApi } from '../../src/shared/shell';
import './style.css';
import './ribbon-items.css';
import './ribbon-badges.css';
import { RibbonIcon, ribbonLabel } from './RibbonButton';
import { OverlayApp } from './OverlayApp';
import './ribbon-group.css';
declare global {
  interface Window {
    appdockShell: ShellApi;
  }
}
const api = window.appdockShell;
function App() {
  const [model, setModel] = useState<RibbonView>();
  const [error, setError] = useState('');
  const [session, setSession] = useState('');
  useEffect(() => {
    const invalidate = () => {
      void api.invalidateAnchor().catch(() => {});
    };
    window.addEventListener('resize', invalidate);
    const observer = new ResizeObserver(invalidate);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', invalidate);
      observer.disconnect();
    };
  }, []);
  useEffect(
    () =>
      api.onFocus((edge) => {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        (edge === 'first' ? buttons[0] : buttons.at(-1))?.focus();
      }),
    [],
  );
  useEffect(() => {
    let live = true;
    const accept = (next: RibbonView) => {
      if (live)
        setModel((current) =>
          current && current.epoch === next.epoch && current.revision > next.revision
            ? current
            : next,
        );
    };
    const unsubscribe = api.onChanged(accept);
    void api
      .connect()
      .then((connection) => {
        if (!live) return;
        accept(connection.snapshot);
        setSession(connection.sessionId);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (session && model) void api.ready(session).catch((e) => setError(String(e)));
  }, [session, !!model]);
  useEffect(() => {
    document.documentElement.dataset.theme = model?.dark ? 'dark' : 'light';
  }, [model?.dark]);
  const invoke = (actionId: string, button?: HTMLButtonElement) => {
    if (!model) return;
    setError('');
    void api
      .invoke({
        epoch: model.epoch,
        requestId: crypto.randomUUID(),
        actionId,
        ...(button
          ? {
              anchor: (() => {
                const r = button.getBoundingClientRect();
                const x = Math.max(0, r.x),
                  y = Math.max(0, r.y);
                return {
                  x,
                  y,
                  width: Math.min(innerWidth, r.right) - x,
                  height: Math.min(innerHeight, r.bottom) - y,
                };
              })(),
            }
          : {}),
      })
      .catch((e) => setError(String(e)));
  };
  const item = (item: RibbonView['items'][number]): React.ReactNode => {
    if (item.kind === 'group')
      return (
        <div
          className="ribbon-group"
          key={item.id}
          data-expanded={item.expanded}
          data-colored={!!item.color}
          data-expansion={item.expansion}
          style={{ '--ribbon-group-color': item.color || 'transparent' } as React.CSSProperties}
        >
          <button
            data-ribbon-id={item.id}
            className={item.selected ? 'active' : ''}
            title={item.disabledReason || ribbonLabel(item)}
            aria-label={ribbonLabel(item)}
            aria-expanded={item.expanded}
            aria-controls={item.expansion === 'persistent' ? `children-${item.id}` : undefined}
            aria-haspopup={item.expansion === 'temporary' ? 'dialog' : undefined}
            disabled={!item.enabled}
            onClick={(e) => invoke(item.actionId!, e.currentTarget)}
            onKeyDown={(e) => {
              if (
                (e.key === 'ArrowRight' && !item.expanded) ||
                (e.key === 'ArrowLeft' && item.expanded)
              ) {
                e.preventDefault();
                invoke(item.actionId!, e.currentTarget);
              }
            }}
          >
            <RibbonIcon item={item} asset={api.asset} />
            <span className="ribbon-disclosure" aria-hidden="true">
              {item.expanded ? '−' : '+'}
            </span>
          </button>
          {item.expansion === 'persistent' && item.expanded && (
            <div
              id={`children-${item.id}`}
              role="group"
              aria-label={item.title}
              className="ribbon-children"
            >
              {item.children?.map(renderItem)}
            </div>
          )}
        </div>
      );
    return item.kind === 'separator' ? (
      <div
        key={item.id}
        className="ribbon-separator"
        role="separator"
        data-ribbon-id={item.id}
        aria-label={item.title}
      />
    ) : (
      <button
        key={item.id}
        data-ribbon-id={item.id}
        title={item.disabledReason || (item.badge ? ribbonLabel(item) : item.tooltip)}
        aria-label={ribbonLabel(item)}
        aria-current={item.selected ? 'page' : undefined}
        aria-expanded={
          item.id === 'ribbon-display-mode' ? model?.displayMode === 'expanded' : undefined
        }
        disabled={!item.enabled}
        className={`${item.selected ? 'active' : ''}${item.id === 'ribbon-display-mode' ? ' ribbon-mode-toggle' : ''}`}
        onClick={() => invoke(item.actionId!)}
      >
        <RibbonIcon item={item} asset={api.asset} />
      </button>
    );
  };
  const renderItem = item;
  return (
    <aside
      className="activity-rail ribbon-surface"
      data-display-mode={model?.displayMode ?? 'compact'}
      aria-label="リボン"
      data-revision={model?.revision}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const buttons = [
          ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        if (e.target === (e.shiftKey ? buttons[0] : buttons.at(-1))) {
          e.preventDefault();
          void api.focusHost(e.shiftKey ? 'before' : 'after');
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (model && model.contextActionEnabled !== false) invoke(model.contextActionId);
      }}
    >
      <div
        className="ribbon-buttons ribbon-top"
        aria-label="上寄せのリボン"
        onScroll={() => {
          void api.invalidateAnchor().catch(() => {});
        }}
      >
        {model?.items.filter((i) => i.placement === 'top').map(item)}
      </div>
      <div className="rail-spacer" />
      <div
        className="ribbon-buttons ribbon-bottom"
        aria-label="下寄せのリボン"
        onScroll={() => {
          void api.invalidateAnchor().catch(() => {});
        }}
      >
        {model?.items.filter((i) => i.placement === 'bottom').map(item)}
      </div>
      {error && (
        <button
          className="error"
          title={error}
          onClick={() => setError('')}
          aria-label="操作エラー"
        >
          !
        </button>
      )}
    </aside>
  );
}
createRoot(document.getElementById('root')!).render(
  window.appdockOverlay ? <OverlayApp /> : <App />,
);

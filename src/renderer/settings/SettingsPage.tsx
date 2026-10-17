import { registerSettingsInputs } from '../settings-input-flush';
import { useEffect, useRef, useState } from 'react';
import type { SettingsPageModel, SettingsPageOperation } from '../../shared/settings-page';
import { SettingsControlsProvider } from '../settings-ui/api';
import { SettingsViewClient } from './runtime';
import { SettingsForm } from './SettingsForm';
import { SettingsIndex } from './SettingsIndex';
import { SettingsPageLayout } from './SettingsPageLayout';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import '../settings-ui/controls.css';
import './settings.css';
export function SettingsPage({
  context = 'full',
  pageId,
  sidebarWidth = 280,
}: {
  context?: 'full' | 'applet';
  pageId?: string;
  sidebarWidth?: number;
}) {
  const [model, setModel] = useState<SettingsPageModel>();
  const [error, setError] = useState('');
  const [movement, setMovement] = useState({ id: '', text: '' });
  const client = useRef<SettingsViewClient | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [controls, setControls] = useState<ReturnType<SettingsViewClient['controls']>>();
  useEffect(() => {
    let live = true;
    let connectionId: string | undefined;
    const transport = window.dock.settingsPage;
    const unsubscribe = transport.onChanged((connection) => {
      if (live && connection.connectionId === connectionId)
        client.current?.accept(connection.snapshot);
    });
    void transport
      .open({
        id: crypto.randomUUID(),
        kind: 'settings',
        route: context === 'full' ? 'settings' : 'extensions',
        context,
        pageId,
        sidebarWidth,
        hostWidth: window.innerWidth,
      })
      .then((connection) => {
        connectionId = connection.connectionId;
        if (!live) {
          void transport.close(connectionId);
          return;
        }
        const c = new SettingsViewClient(setModel, setError, transport, connectionId);
        client.current = c;
        c.accept(connection.snapshot);
        setControls(c.controls());
        // Refresh after binding to cover changes arriving during open.
        void transport
          .get(connectionId)
          .then((m) => {
            if (live) c.accept(m);
          })
          .catch((e) => {
            if (live) setError(String(e));
          });
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    const flush = registerSettingsInputs(() => client.current?.flush() ?? Promise.resolve());
    const resize = () => {
      const c = client.current;
      if (c) void c.act({ kind: 'viewport', width: window.innerWidth }).catch(() => {});
    };
    window.addEventListener('resize', resize);
    return () => {
      live = false;
      unsubscribe();
      flush();
      window.removeEventListener('resize', resize);
      if (connectionId) void transport.close(connectionId);
      client.current = null;
    };
  }, [context, pageId]);
  const c = client.current;
  useEffect(() => {
    const move = model?.content.move;
    if (!c || !move || move.completed || model.content.editing.mode !== 'form') return;
    let done = false,
      highlight: ReturnType<typeof setTimeout> | undefined;
    let target: HTMLElement | null = null;
    const reveal = () => {
      if (done || c.model?.content.move?.id !== move.id) return;
      target =
        surface.current?.querySelector<HTMLElement>(
          `[data-setting-item="${CSS.escape(move.itemId)}"]`,
        ) ?? null;
      if (!target) return;
      done = true;
      observer.disconnect();
      for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement)
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      target.focus({ preventScroll: true });
      target.classList.add('setting-highlight');
      highlight = setTimeout(() => target?.classList.remove('setting-highlight'), 2000);
      setMovement({
        id: move.id,
        text: `${model.content.page.items.find((i) => i.id === move.itemId)?.title ?? '設定項目'}へ移動しました。`,
      });
      void c.act({ kind: 'moved', requestId: move.id, pageId: move.pageId }).catch(() => {});
    };
    const observer = new MutationObserver(reveal);
    observer.observe(surface.current!, { childList: true, subtree: true });
    const frame = requestAnimationFrame(reveal);
    const timeout = setTimeout(() => {
      observer.disconnect();
      if (!done) setError('設定項目の表示を待てませんでした。検索結果を選び直してください。');
    }, 5000);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      clearTimeout(highlight);
      observer.disconnect();
      target?.classList.remove('setting-highlight');
    };
  }, [model?.content.move?.id, model?.content.page.id, model?.content.editing.mode]);
  const act = (operation: SettingsPageOperation) => void c?.act(operation).catch(() => {});
  if (!model || !c || !controls) return <p role="status">設定を読み込んでいます…{error}</p>;
  const { page, navigation, editing } = model.content;
  const editor = c.editor(model);
  const resize = (width: number) => {
    const value = Math.round(Math.max(220, Math.min(480, width)));
    setModel({ ...model, content: { ...model.content, sidebarWidth: value } });
    act({ kind: 'sidebar-width', width: value });
  };
  return (
    <SettingsControlsProvider api={controls}>
      <div
        ref={surface}
        data-settings-connection={model.id}
        className={`settings-surface ${context}`}
        data-compact={model.content.hostWidth <= 760}
      >
        {context === 'full' && (
          <aside
            className="sidebar settings-categories"
            style={{ width: Math.min(model.content.sidebarWidth, model.content.hostWidth * 0.4) }}
            aria-label="設定一覧"
          >
            <h2>設定</h2>
            <SettingsIndex content={model.content} act={act} />
            <div
              className="sidebar-resizer"
              role="separator"
              tabIndex={0}
              aria-label="設定一覧の幅を変更"
              aria-orientation="vertical"
              aria-valuemin={220}
              aria-valuemax={480}
              aria-valuenow={model.content.sidebarWidth}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                drag.current = {
                  x: e.clientX,
                  width: e.currentTarget.parentElement!.getBoundingClientRect().width,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (drag.current) resize(drag.current.width + e.clientX - drag.current.x);
              }}
              onPointerUp={(e) => {
                drag.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onLostPointerCapture={() => (drag.current = null)}
              onKeyDown={(e) => {
                const width = {
                  ArrowLeft: model.content.sidebarWidth - 10,
                  ArrowRight: model.content.sidebarWidth + 10,
                  Home: 220,
                  End: 480,
                }[e.key];
                if (width !== undefined) {
                  e.preventDefault();
                  resize(width);
                }
              }}
            />
          </aside>
        )}
        <SettingsPageLayout
          page={page}
          mode={editing.mode}
          pending={editing.pending}
          error={error || editing.error || ''}
          onMode={(mode) => act({ kind: 'edit', action: { type: 'mode', value: mode } })}
          storage={model.content.auxiliary.storage}
          onLocalSettings={(enabled) =>
            void c.invoke('set-local-settings', [enabled]).catch((error) => setError(String(error)))
          }
          onOpenFile={(scope) =>
            void c.invoke('open-settings', [scope]).catch((error) => setError(String(error)))
          }
          onReload={() => act({ kind: 'edit', action: { type: 'reload' } })}
          announcement={
            <span key={movement.id} className="settings-live" role="status" aria-live="polite">
              {movement.text}
            </span>
          }
        >
          {page.unavailableReason ? (
            <p role="status">{page.unavailableReason}</p>
          ) : editing.mode === 'json' ? (
            <SettingsTextarea
              aria-label="設定JSON"
              value={c.text(model)}
              spellCheck={false}
              onChange={(e) => {
                c.setText(e.target.value);
              }}
            />
          ) : (
            <SettingsForm
              model={model}
              editor={editor}
              select={(pageId) => act({ kind: 'select', pageId })}
              invoke={c.invoke}
            />
          )}
        </SettingsPageLayout>
      </div>
    </SettingsControlsProvider>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsPageModel, SettingsPageOperation } from '../../src/shared/settings-page';
import type { ShellPageApi } from '../../src/shared/shell-pages';
import { configureSettingsControls } from '../../src/shared/settings-ui/api';
import { shortcutFromEvent } from '../../src/shared/commands';
import { SettingsViewClient } from './settings/runtime';
import { SettingsForm } from './settings/SettingsForm';
import { SettingsIndex } from './settings/SettingsIndex';
import { SettingsPageLayout } from './settings/SettingsPageLayout';
import { SettingsTextarea } from '../../src/shared/settings-ui/SettingsInput';
import '../../src/shared/settings-ui/controls.css';
import './settings.css';
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';
declare global {
  interface Window {
    appdockPage: ShellPageApi;
  }
}
function App() {
  const [model, setModel] = useState<SettingsPageModel>();
  const [error, setError] = useState('');
  const [movement, setMovement] = useState({ id: '', text: '' });
  const client = useRef<SettingsViewClient | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  if (!client.current) {
    client.current = new SettingsViewClient((next) => {
      document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
      setModel(next);
    }, setError);
    configureSettingsControls(client.current.controls());
  }
  const c = client.current;
  useEffect(() => {
    const unsubscribe = window.appdockPage.onChanged((m) => c.accept(m));
    void window.appdockPage
      .connect()
      .then((connection) => {
        c.accept(connection.snapshot);
        return window.appdockPage.ready(connection.sessionId);
      })
      .catch((e) => setError(String(e)));
    const elements = () =>
      [
        ...document.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]'),
      ].filter((e) => !e.matches(':disabled') && e.getClientRects().length);
    const focus = window.appdockPage.onFocus((edge) => {
      const list = elements();
      (edge === 'first' ? list[0] : list.at(-1))?.focus();
    });
    const flush = window.appdockPage.onFlush((id) => {
      void c.flush().then(() => window.appdockPage.flushed(id));
    });
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      if (event.key === 'Tab') {
        const list = elements();
        if (
          event.shiftKey
            ? document.activeElement === list[0]
            : document.activeElement === list.at(-1)
        ) {
          event.preventDefault();
          void window.appdockPage.focusHost(event.shiftKey ? 'before' : 'after');
        }
        return;
      }
      if (
        !event.ctrlKey &&
        !event.altKey &&
        event.target instanceof Element &&
        event.target.closest('input,select,textarea')
      )
        return;
      const key = shortcutFromEvent(event);
      if (key) void window.appdockPage.shortcut(key).catch((e) => setError(String(e)));
    };
    document.addEventListener('keydown', keys);
    return () => {
      unsubscribe();
      focus();
      flush();
      document.removeEventListener('keydown', keys);
    };
  }, []);
  useEffect(() => {
    const move = model?.content.move;
    if (!move || move.completed || model.content.editing.mode !== 'form') return;
    let done = false,
      highlight: ReturnType<typeof setTimeout> | undefined;
    let target: HTMLElement | null = null;
    const reveal = () => {
      if (done || c.model?.content.move?.id !== move.id) return;
      target = document.querySelector<HTMLElement>(
        `[data-setting-item="${CSS.escape(move.itemId)}"]`,
      );
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
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
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
  const act = (operation: SettingsPageOperation) => void c.act(operation).catch(() => {});
  if (!model) return <p role="status">設定を読み込んでいます…{error}</p>;
  const { page, navigation, editing, context } = model.content;
  const editor = c.editor(model);
  const resize = (width: number) => {
    const value = Math.round(Math.max(220, Math.min(480, width)));
    setModel({ ...model, content: { ...model.content, sidebarWidth: value } });
    act({ kind: 'sidebar-width', width: value });
  };
  return (
    <div className={`settings-surface ${context}`} data-compact={model.content.hostWidth <= 760}>
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
  );
}
createRoot(document.getElementById('root')!).render(<App />);

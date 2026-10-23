import { registerSettingsInputs } from '../settings-input-flush';
import { useEffect, useRef, useState } from 'react';
import type { SettingsPageModel, SettingsPageOperation } from '../../shared/settings-page';
import { SettingsControlsProvider } from '../settings-ui/api';
import { SettingsHintsContext } from '../settings-ui/SettingsHints';
import { SettingsViewClient } from './runtime';
import { SettingsForm } from './SettingsForm';
import { SettingsIndex } from './SettingsIndex';
import { SettingsPageLayout } from './SettingsPageLayout';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsStatusProvider, SettingsStatusArea } from '../settings-ui/SettingsStatus';
import {
  CommandSettingsNavigation,
  type CommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';
import '../settings-ui/controls.css';
import './settings.css';
export function SettingsPage({
  ready,
  context = 'full',
  pageId,
  sidebarWidth = 280,
}: {
  ready: boolean;
  context?: 'full' | 'applet';
  pageId?: string;
  sidebarWidth?: number;
}) {
  const [model, setModel] = useState<SettingsPageModel>();
  const [error, setError] = useState('');
  const [commandTarget, setCommandTarget] = useState<CommandSettingsTarget>();
  const commandNavigationRequest = useRef(0);
  const [movement, setMovement] = useState({ id: '', text: '' });
  const [confirmation, setConfirmation] = useState<{
    kind: 'reset' | 'storage';
    model: SettingsPageModel;
  }>();
  const [disposition, setDisposition] = useState<'keep' | 'share' | 'clear'>('keep');
  const client = useRef<SettingsViewClient | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [controls, setControls] = useState<ReturnType<SettingsViewClient['controls']>>();
  useEffect(() => {
    // Restored local navigation can render before startup and main-side routing are ready.
    if (!ready) return;
    setError('');
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
  }, [ready, context, pageId]);
  const c = client.current;
  useEffect(() => {
    const move = model?.content.move;
    if (!ready || !c || !move || move.completed || model.content.editing.mode !== 'form') return;
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
  }, [ready, model?.content.move?.id, model?.content.page.id, model?.content.editing.mode]);
  const act = (operation: SettingsPageOperation) => {
    if (operation.kind === 'select' || operation.kind === 'move') {
      commandNavigationRequest.current++;
      setCommandTarget(undefined);
    }
    void c?.act(operation).catch(() => {});
  };
  const confirm = async (kind: 'reset' | 'storage') => {
    try {
      const current = await c?.preparePageChange();
      if (current) {
        setDisposition('keep');
        setConfirmation({ kind, model: current });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  if (!ready || !model || !c || !controls)
    return (
      <SettingsStatusProvider error={ready ? error : undefined} target="設定の読み込み">
        <SettingsField
          title="設定"
          description={error ? '設定を読み込めませんでした。' : '設定を読み込んでいます…'}
        />
        <SettingsStatusArea />
      </SettingsStatusProvider>
    );
  const { page, navigation, editing } = model.content;
  const editor = c.editor(model);
  const resize = (width: number) => {
    const value = Math.round(Math.max(220, Math.min(480, width)));
    setModel({ ...model, content: { ...model.content, sidebarWidth: value } });
    act({ kind: 'sidebar-width', width: value });
  };
  return (
    <SettingsControlsProvider api={controls}>
      <SettingsHintsContext.Provider value={model.content.showHints}>
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
            onLocalSettings={(enabled) => {
              if (!enabled) void confirm('storage');
              else
                void c
                  .invoke('set-local-settings', [true])
                  .catch((error) => setError(String(error)));
            }}
            onReset={() => void confirm('reset')}
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
              <SettingsField title="利用状況" description={page.unavailableReason} />
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
              <CommandSettingsNavigation.Provider
                value={
                  context === 'full'
                    ? {
                        page: page.id,
                        assignments: {
                          'touchpad-gestures': new Set(
                            model.content.auxiliary.commandAssignments?.['touchpad-gestures'] ?? [],
                          ),
                          shortcuts: new Set(
                            model.content.auxiliary.commandAssignments?.shortcuts ?? [],
                          ),
                          gestures: new Set(
                            model.content.auxiliary.commandAssignments?.gestures ?? [],
                          ),
                        },
                        target: commandTarget?.page === page.id ? commandTarget : undefined,
                        clear: () => setCommandTarget(undefined),
                        open: (pageId, command) => {
                          const request = ++commandNavigationRequest.current;
                          void c
                            .act({ kind: 'select', pageId })
                            .then(() => {
                              if (
                                request !== commandNavigationRequest.current ||
                                c.model?.content.page.id !== pageId
                              )
                                return;
                              setCommandTarget({
                                page: pageId,
                                id: command.id,
                                title: command.title,
                                request,
                              });
                            })
                            .catch(() => {});
                        },
                      }
                    : null
                }
              >
                <SettingsForm
                  model={model}
                  editor={editor}
                  select={(pageId) => act({ kind: 'select', pageId })}
                  invoke={c.invoke}
                />
              </CommandSettingsNavigation.Provider>
            )}
          </SettingsPageLayout>
          {confirmation && (
            <SettingsDialog
              className="settings-reset-dialog"
              title={
                confirmation.kind === 'reset' ? 'このページを既定値に戻す' : '共有設定に切り替える'
              }
              onClose={() => setConfirmation(undefined)}
              applyLabel={confirmation.kind === 'reset' ? '既定値に戻す' : '切り替える'}
              onApply={async () => {
                const expected = confirmation.model;
                if (confirmation.kind === 'storage')
                  await c.invoke('set-local-settings', [
                    false,
                    expected.content.auxiliary.storage?.revision,
                    disposition,
                    expected.content.auxiliary.storage?.signature,
                  ]);
                else
                  await c.act({
                    kind: 'edit',
                    action: {
                      type: 'reset-page',
                      pageId: expected.content.page.id,
                      revision: expected.content.auxiliary.storage?.revision ?? -1,
                      storageScope: expected.content.auxiliary.storage?.signature,
                      before: expected.content.jsonValues ?? expected.content.values,
                    },
                  });
              }}
            >
              <SettingsField title="対象" description={confirmation.model.content.page.title} />
              {confirmation.kind === 'reset' ? (
                <>
                  <SettingsField
                    title="初期化の内容"
                    description="このページの設定を既定値に戻します。省略した設定は、今後の版の既定値に従います。"
                  />
                  <SettingsField
                    title="保存先"
                    description={confirmation.model.content.auxiliary.storage?.files
                      .map(
                        (file) => `${file.scope === 'device' ? 'このPC' : '共有'} (${file.name})`,
                      )
                      .join('、')}
                  />
                  {confirmation.model.content.auxiliary.storage?.files.some(
                    (file) => file.scope === 'shared',
                  ) && (
                    <SettingsField
                      title="共有設定への反映"
                      description="共有設定の変更は、ほかのPCにも反映されます。"
                    />
                  )}
                </>
              ) : (
                <SettingsField
                  title="このPCの設定"
                  className="settings-field-wide"
                  description={
                    disposition === 'share'
                      ? '対象Appletの共有設定を置き換えます。ほかのPCにも反映されます。'
                      : undefined
                  }
                >
                  <label>
                    <input
                      type="radio"
                      name="settings-disposition"
                      checked={disposition === 'share'}
                      onChange={() => setDisposition('share')}
                    />
                    このPCの設定を共有設定に反映する
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="settings-disposition"
                      checked={disposition === 'clear'}
                      onChange={() => setDisposition('clear')}
                    />
                    このPCの設定を削除して共有設定に戻す
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="settings-disposition"
                      checked={disposition === 'keep'}
                      onChange={() => setDisposition('keep')}
                    />
                    このPCの設定を残して共有設定に戻す
                  </label>
                </SettingsField>
              )}
            </SettingsDialog>
          )}
        </div>
      </SettingsHintsContext.Provider>
    </SettingsControlsProvider>
  );
}

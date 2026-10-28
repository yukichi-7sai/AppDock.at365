import { getHostTranslator } from '../../shared/i18n';
import { HostTranslationProvider } from '../HostTranslation';
import { registerSettingsInputs } from '../settings-input-flush';
import { useEffect, useRef, useState } from 'react';
import type { SettingsPageModel, SettingsPageOperation } from '../../shared/settings-page';
import { SettingsControlsProvider } from '../settings-ui/api';
import { SettingsHintsContext } from '../settings-ui/SettingsHints';
import { SettingsViewClient } from './runtime';
import { SettingsForm } from './SettingsForm';
import {
  triggerTabTitles,
  type TriggerTab,
  type TriggerScrollPositions,
} from './CommandTriggersEditor';
import { SettingsIndex } from './SettingsIndex';
import { SettingsPageLayout } from './SettingsPageLayout';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsMcpAccessProvider } from '../settings-ui/SettingsMcpAccess';
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
  onReady,
}: {
  ready: boolean;
  context?: 'full' | 'applet';
  pageId?: string;
  sidebarWidth?: number;
  onReady?(): void;
}) {
  const [model, setModel] = useState<SettingsPageModel>();
  const t = getHostTranslator(model?.content.language);
  const [error, setError] = useState('');
  const [commandTarget, setCommandTarget] = useState<CommandSettingsTarget>();
  const [triggerTab, setTriggerTab] = useState<TriggerTab>('commands');
  const triggerScrollPositions = useRef<TriggerScrollPositions>({});
  useEffect(() => {
    setTriggerTab('commands');
    for (const tab of Object.keys(triggerScrollPositions.current) as TriggerTab[])
      delete triggerScrollPositions.current[tab];
  }, [model?.content.page.id]);
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
  const rememberTriggerScroll = () => {
    const body = surface.current?.querySelector<HTMLElement>('.settings-body');
    if (
      body &&
      model?.content.page.id === 'command-triggers' &&
      model.content.editing.mode === 'form'
    )
      triggerScrollPositions.current[triggerTab] = { left: body.scrollLeft, top: body.scrollTop };
  };
  const selectTriggerTab = (tab: TriggerTab) => {
    if (tab === triggerTab) return;
    rememberTriggerScroll();
    setTriggerTab(tab);
  };
  const [controls, setControls] = useState<ReturnType<SettingsViewClient['controls']>>();
  useEffect(() => {
    if (ready && model && controls) onReady?.();
  }, [ready, model?.id, controls, onReady]);
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
        text: t('settings.moved', {
          name:
            model.content.page.items.find((i) => i.id === move.itemId)?.title ?? t('settings.item'),
        }),
      });
      void c.act({ kind: 'moved', requestId: move.id, pageId: move.pageId }).catch(() => {});
    };
    const observer = new MutationObserver(reveal);
    observer.observe(surface.current!, { childList: true, subtree: true });
    const frame = requestAnimationFrame(reveal);
    const timeout = setTimeout(() => {
      observer.disconnect();
      if (!done) setError(t('settings.moveFailed'));
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
      <SettingsStatusProvider
        error={ready ? error : undefined}
        target={t('settings.loadingTarget')}
      >
        <SettingsField
          title={t('settings.title')}
          description={error ? t('settings.loadFailed') : t('settings.loading')}
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
    <HostTranslationProvider language={model.content.language}>
      <SettingsControlsProvider api={controls}>
        <SettingsMcpAccessProvider value={model.content.auxiliary.mcpAccess}>
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
                  data-testid="settings-index"
                  style={{
                    width: Math.min(model.content.sidebarWidth, model.content.hostWidth * 0.4),
                  }}
                  aria-label={t('settings.index')}
                >
                  <SettingsIndex content={model.content} act={act} />
                  <div
                    className="sidebar-resizer"
                    role="separator"
                    tabIndex={0}
                    aria-label={t('settings.resizeIndex')}
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
                onMode={(mode) => {
                  rememberTriggerScroll();
                  act({ kind: 'edit', action: { type: 'mode', value: mode } });
                }}
                formTabs={
                  page.id === 'command-triggers'
                    ? (Object.keys(triggerTabTitles) as TriggerTab[]).map((tab) => ({
                        id: tab,
                        title: t(triggerTabTitles[tab]),
                        selected: triggerTab === tab,
                        select: () => {
                          if (editing.mode === 'form') selectTriggerTab(tab);
                          else
                            void c
                              .act({ kind: 'edit', action: { type: 'mode', value: 'form' } })
                              .then(() => {
                                if (
                                  c.model?.content.page.id === page.id &&
                                  c.model.content.editing.mode === 'form'
                                )
                                  setTriggerTab(tab);
                              })
                              .catch(() => {});
                        },
                      }))
                    : undefined
                }
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
                  <span
                    key={movement.id}
                    className="settings-live"
                    role="status"
                    aria-live="polite"
                  >
                    {movement.text}
                  </span>
                }
              >
                {page.unavailableReason ? (
                  <SettingsField
                    title={t('settings.availability')}
                    description={page.unavailableReason}
                  />
                ) : editing.mode === 'json' ? (
                  <SettingsTextarea
                    aria-label={t('settings.jsonInput')}
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
                                model.content.auxiliary.commandAssignments?.['touchpad-gestures'] ??
                                  [],
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
                      triggerTab={triggerTab}
                      onTriggerTab={selectTriggerTab}
                      triggerScrollPositions={triggerScrollPositions.current}
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
                    confirmation.kind === 'reset' ? t('settings.reset') : t('settings.switchShared')
                  }
                  onClose={() => setConfirmation(undefined)}
                  applyLabel={
                    confirmation.kind === 'reset'
                      ? t('settings.resetApply')
                      : t('settings.switchApply')
                  }
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
                  <SettingsField
                    title={t('settings.target')}
                    description={confirmation.model.content.page.title}
                  />
                  {confirmation.kind === 'reset' ? (
                    <>
                      <SettingsField
                        title={t('settings.resetContents')}
                        description={t('settings.resetDescription')}
                      />
                      <SettingsField
                        title={t('settings.storage.title')}
                        description={confirmation.model.content.auxiliary.storage?.files
                          .map(
                            (file) =>
                              `${file.scope === 'device' ? t('settings.storage.device') : t('settings.storage.shared')} (${file.name})`,
                          )
                          .join('、')}
                      />
                      {confirmation.model.content.auxiliary.storage?.files.some(
                        (file) => file.scope === 'shared',
                      ) && (
                        <SettingsField
                          title={t('settings.shared.effect')}
                          description={t('settings.shared.effectDescription')}
                        />
                      )}
                    </>
                  ) : (
                    <SettingsField
                      title={t('general.files.device')}
                      className="settings-field-wide"
                      description={
                        disposition === 'share'
                          ? t('settings.shared.replaceDescription')
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
                        {t('settings.shared.copy')}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="settings-disposition"
                          checked={disposition === 'clear'}
                          onChange={() => setDisposition('clear')}
                        />
                        {t('settings.shared.clear')}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="settings-disposition"
                          checked={disposition === 'keep'}
                          onChange={() => setDisposition('keep')}
                        />
                        {t('settings.shared.keep')}
                      </label>
                    </SettingsField>
                  )}
                </SettingsDialog>
              )}
            </div>
          </SettingsHintsContext.Provider>
        </SettingsMcpAccessProvider>
      </SettingsControlsProvider>
    </HostTranslationProvider>
  );
}

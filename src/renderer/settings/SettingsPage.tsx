import { getHostTranslator } from '../../shared/i18n';
import { HostTranslationProvider } from '../HostTranslation';
import { registerSettingsInputs } from '../settings-input-flush';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  SettingsIndexModel,
  SettingsPageModel,
  SettingsPageOperation,
} from '../../shared/settings-page';
import { SettingsControlsProvider } from '../settings-ui/api';
import { CommandReferencesProvider } from '../settings-ui/CommandLink';
import { SettingsHintsContext } from '../settings-ui/SettingsHints';
import { SettingsViewClient } from './runtime';
import type { SettingsResetScope } from '../../shared/settings-catalog';
import { SettingsForm } from './SettingsForm';
import {
  triggerTabTitles,
  type TriggerTab,
  type TriggerScrollPositions,
} from './CommandTriggersEditor';
import { SettingsPageFrame } from './SettingsPageFrame';
import { SettingsPageLayout } from './SettingsPageLayout';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField } from '../settings-ui/SettingsSections';
import { AppletInformationPanel } from '../settings-ui/AppletInformationPanel';
import { AboutInformationPanel } from './AboutSettings';
import { SettingsMcpAccessProvider } from '../settings-ui/SettingsMcpAccess';
import { SettingsStatusProvider, SettingsStatusArea } from '../settings-ui/SettingsStatus';
import {
  CommandSettingsNavigation,
  type CommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';
import '../settings-ui/controls.css';
import './settings.css';
const resetTabTitles = {
  ...triggerTabTitles,
  form: 'settings.form',
  triggers: 'settings.triggerList',
  json: 'settings.json',
} as const;
export function SettingsPage({
  ready,
  index,
  context = 'full',
  pageId,
  sidebarWidth = 280,
  onReady,
}: {
  ready: boolean;
  index?: SettingsIndexModel;
  context?: 'full' | 'applet';
  pageId?: string;
  sidebarWidth?: number;
  onReady?(): void;
}) {
  const [model, setModel] = useState<SettingsPageModel>();
  const t = getHostTranslator(model?.content.language ?? index?.language);
  const [error, setError] = useState('');
  const [commandTarget, setCommandTarget] = useState<CommandSettingsTarget>();
  const [triggerTab, setTriggerTab] = useState<TriggerTab>('commands');
  const [gestureView, setGestureView] = useState<'form' | 'triggers'>('form');
  const triggerScrollPositions = useRef<TriggerScrollPositions>({});
  useEffect(() => {
    setTriggerTab('commands');
    setGestureView('form');
    for (const tab of Object.keys(triggerScrollPositions.current) as TriggerTab[])
      delete triggerScrollPositions.current[tab];
  }, [model?.content.page.id]);
  const commandNavigationRequest = useRef(0);
  const [movement, setMovement] = useState({ id: '', text: '' });
  const [confirmation, setConfirmation] = useState<{
    kind: 'reset' | 'storage';
    model: SettingsPageModel;
    scope: SettingsResetScope;
    target: string;
  }>();
  const [disposition, setDisposition] = useState<'keep' | 'share' | 'clear'>('keep');
  const client = useRef<SettingsViewClient | null>(null);
  const pendingNavigation = useRef<SettingsPageOperation[]>([]);
  const [pendingPage, setPendingPage] = useState<string>();
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
  const loaded = !!(ready && model && client.current && controls);
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    setShowLoading(false);
    if (loaded) return;
    const timer = setTimeout(() => setShowLoading(true), 1000);
    return () => clearTimeout(timer);
  }, [loaded]);
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
      .then(async (connection) => {
        connectionId = connection.connectionId;
        if (!live) {
          void transport.close(connectionId);
          return;
        }
        const c = new SettingsViewClient(setModel, setError, transport, connectionId);
        client.current = c;
        c.accept(connection.snapshot);
        while (live && pendingNavigation.current.length) {
          await c.act(pendingNavigation.current.shift()!).catch(() => {});
        }
        if (!live) return;
        setPendingPage(undefined);
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
      pendingNavigation.current = [];
      setModel(undefined);
      setControls(undefined);
      setPendingPage(undefined);
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
      setGestureView('form');
    }
    if (!loaded) {
      if (operation.kind === 'select' || operation.kind === 'move') {
        pendingNavigation.current.push(operation);
        if (operation.kind === 'select') setPendingPage(operation.pageId);
      }
      return;
    }
    void c?.act(operation).catch(() => {});
  };
  const confirm = async (kind: 'reset' | 'storage') => {
    try {
      const current = await c?.preparePageChange();
      if (current) {
        const { page, editing } = current.content;
        const gesturePage = ['shortcuts', 'gestures', 'touchpad-gestures'].includes(page.id);
        const tab =
          editing.mode === 'json'
            ? 'json'
            : page.id === 'command-triggers'
              ? triggerTab
              : gesturePage
                ? gestureView
                : undefined;
        const scope: SettingsResetScope =
          tab === undefined || tab === 'json' || tab === 'commands' ? 'page' : tab;
        const tabTitle = tab ? t(resetTabTitles[tab]) : undefined;
        setDisposition('keep');
        setConfirmation({
          kind,
          model: current,
          scope,
          target: tabTitle
            ? t('settings.resetTarget', { page: page.title, tab: tabTitle })
            : page.title,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const resize = (width: number) => {
    if (!model || !loaded) return;
    const value = Math.round(Math.max(220, Math.min(480, width)));
    setModel({ ...model, content: { ...model.content, sidebarWidth: value } });
    act({ kind: 'sidebar-width', width: value });
  };
  const indexContent = loaded ? model!.content : index;
  const frame = (body: ReactNode) => (
    <HostTranslationProvider language={model?.content.language ?? index?.language}>
      <SettingsControlsProvider api={controls ?? window.dock}>
        <CommandReferencesProvider references={model?.content.auxiliary.commandReferences}>
          <SettingsMcpAccessProvider
            value={loaded ? model?.content.auxiliary.mcpAccess : undefined}
          >
            <SettingsHintsContext.Provider value={model?.content.showHints ?? true}>
              <SettingsPageFrame
                surface={surface}
                context={context}
                connectionId={loaded ? model?.id : undefined}
                index={
                  indexContent && pendingPage
                    ? { ...indexContent, page: { id: pendingPage } }
                    : indexContent
                }
                sidebarWidth={loaded ? model!.content.sidebarWidth : sidebarWidth}
                hostWidth={loaded ? model!.content.hostWidth : window.innerWidth}
                pending={!loaded}
                act={act}
                resize={resize}
              >
                {body}
              </SettingsPageFrame>
            </SettingsHintsContext.Provider>
          </SettingsMcpAccessProvider>
        </CommandReferencesProvider>
      </SettingsControlsProvider>
    </HostTranslationProvider>
  );
  if (!ready || !model || !c || !controls)
    return frame(
      <div className="settings-page-layout settings-page-loading" aria-busy={!error}>
        <SettingsStatusProvider
          error={ready ? error : undefined}
          target={t('settings.loadingTarget')}
        >
          <div className="settings-loading-body">
            {error ? (
              <p>{t('settings.loadFailed')}</p>
            ) : (
              showLoading && <p role="status">{t('settings.loading')}</p>
            )}
          </div>
          <SettingsStatusArea />
        </SettingsStatusProvider>
      </div>,
    );
  const { page, navigation, editing } = model.content;
  const gesturePage = ['shortcuts', 'gestures', 'touchpad-gestures'].includes(page.id);
  const editor = c.editor(model);
  const headingApplet =
    editing.mode === 'form' && page.kind === 'applet' && !page.collection && !page.unavailableReason
      ? model.content.auxiliary.applets?.find((applet) => applet.id === page.owner)
      : undefined;
  return frame(
    <>
      <SettingsPageLayout
        page={page}
        mode={editing.mode}
        pending={editing.pending}
        error={error || editing.error || ''}
        heading={
          editing.mode === 'form' && page.id === 'about' && !page.unavailableReason ? (
            <AboutInformationPanel
              settings={editor.value}
              extensions={model.content.auxiliary.applets ?? []}
              runtime={model.content.auxiliary.runtime!}
              stats={model.content.auxiliary.aboutStats}
              version={model.content.auxiliary.version ?? ''}
              busy={editing.pending}
              openApplets={() => act({ kind: 'select', pageId: 'applets' })}
            />
          ) : headingApplet ? (
            <AppletInformationPanel
              applet={headingApplet}
              updateSource={editor.value.extensions[headingApplet.id]?.updateSource}
              busy={editing.pending}
              headingLevel={1}
            />
          ) : undefined
        }
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
            : gesturePage
              ? (['form', 'triggers'] as const).map((view) => ({
                  id: view,
                  title: t(view === 'form' ? 'settings.form' : 'settings.triggerList'),
                  selected: gestureView === view,
                  select: () => {
                    if (editing.mode === 'form') setGestureView(view);
                    else
                      void c
                        .act({ kind: 'edit', action: { type: 'mode', value: 'form' } })
                        .then(() => {
                          if (
                            c.model?.content.page.id === page.id &&
                            c.model.content.editing.mode === 'form'
                          )
                            setGestureView(view);
                        })
                        .catch(() => {});
                  },
                }))
              : undefined
        }
        formTabsId={gesturePage ? 'gesture-settings' : 'command-trigger'}
        storage={model.content.auxiliary.storage}
        onLocalSettings={(enabled) => {
          if (!enabled) void confirm('storage');
          else
            void c.invoke('set-local-settings', [true]).catch((error) => setError(String(error)));
        }}
        onReset={() => void confirm('reset')}
        resetLabel={
          editing.mode === 'form' && (gesturePage || page.id === 'command-triggers')
            ? t('settings.resetTab')
            : undefined
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
          <SettingsField title={t('settings.availability')} description={page.unavailableReason} />
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
                        model.content.auxiliary.commandAssignments?.['touchpad-gestures'] ?? [],
                      ),
                      shortcuts: new Set(
                        model.content.auxiliary.commandAssignments?.shortcuts ?? [],
                      ),
                      gestures: new Set(model.content.auxiliary.commandAssignments?.gestures ?? []),
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
              gestureView={gestureView}
              onTriggerTab={selectTriggerTab}
              triggerScrollPositions={triggerScrollPositions.current}
              model={model}
              editor={editor}
              select={(pageId) => act({ kind: 'select', pageId })}
              invoke={c.invoke}
              onOpenNotificationCenter={async () => {
                await c.preparePageChange();
                await window.dock.executeCommand('appdock.notifications.open');
              }}
            />
          </CommandSettingsNavigation.Provider>
        )}
      </SettingsPageLayout>
      {confirmation && (
        <SettingsDialog
          className="settings-reset-dialog"
          title={
            confirmation.kind === 'reset'
              ? t(
                  confirmation.scope !== 'page' ||
                    (confirmation.model.content.page.id === 'command-triggers' &&
                      confirmation.model.content.editing.mode === 'form')
                    ? 'settings.resetTab'
                    : 'settings.reset',
                )
              : t('settings.switchShared')
          }
          onClose={() => setConfirmation(undefined)}
          applyLabel={
            confirmation.kind === 'reset' ? t('settings.resetApply') : t('settings.switchApply')
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
                  scope: confirmation.scope,
                  revision: expected.content.auxiliary.storage?.revision ?? -1,
                  storageScope: expected.content.auxiliary.storage?.signature,
                  before: expected.content.jsonValues ?? expected.content.values,
                },
              });
          }}
        >
          <SettingsField
            title={t('settings.target')}
            description={
              confirmation.kind === 'reset'
                ? confirmation.target
                : confirmation.model.content.page.title
            }
          />
          {confirmation.kind === 'reset' ? (
            <>
              <SettingsField
                title={t('settings.resetContents')}
                description={t(
                  confirmation.scope === 'form'
                    ? 'settings.resetFormDescription'
                    : confirmation.scope !== 'page' ||
                        (confirmation.model.content.page.id === 'command-triggers' &&
                          confirmation.model.content.editing.mode === 'form')
                      ? 'settings.resetTriggersDescription'
                      : 'settings.resetDescription',
                )}
              />
              <SettingsField
                title={t('settings.storage.title')}
                description={confirmation.model.content.auxiliary.storage?.files
                  .filter(
                    (file) =>
                      confirmation.scope !== 'triggers' ||
                      confirmation.model.content.page.id !== 'touchpad-gestures' ||
                      file.scope === 'shared',
                  )
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
                disposition === 'share' ? t('settings.shared.replaceDescription') : undefined
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
    </>,
  );
}

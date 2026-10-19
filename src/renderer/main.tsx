import { SettingsControlsProvider } from './settings-ui/api';
import { flushSettingsPageInputs } from './settings-input-flush';
import { ShellPageSlot } from './ShellPageSlot';
import { ShellBarSlot } from './ShellBarSlot';
import { SettingsPage } from './settings/SettingsPage';
import { Icon, type IconName } from './Icon';
import { Toggle } from './settings-ui/Toggle';
import { getKeybindings, resolveKeybindings } from '../shared/keybindings';
import { PanelImageCard } from './PanelImageCard';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  DockApi,
  HostSnapshot,
  ExtensionSnapshot,
  Settings,
  SettingsSnapshot,
  GlobalHotKeyStatus,
} from '../shared/contracts';
import './style.css';
import { hostCommands, shortcutFromEvent, type UiCommand } from '../shared/commands';
import { appletManagementCommands } from '../shared/applet-management';
import { AppletSettingsPanel } from './AppletSettingsPanel';
import { AppletIndex } from './AppletIndex';
import { orderApplets } from '../shared/applet-order';
import { SettingsToolbar, SettingsMessages } from './SettingsActions';
import { useSettingsEditor, type SettingsEditor } from './useSettingsEditor';
import { VersionCheck } from './settings-ui/VersionCheck';
import { useRestartView } from './useRestartView';
import { useAppletSidebar } from './useAppletSidebar';
import { defaultShellId } from '../shared/shell';

declare global {
  interface Window {
    dock: DockApi;
  }
}
type Page = 'home' | 'extensions' | 'settings' | 'logs' | 'notifications' | `page:${string}`;
type AppletDetailView = 'description' | 'settings' | 'shortcuts' | 'logs';

const labels: Record<string, string> = {
  home: 'ホーム',
  extensions: 'Applet',
  settings: '設定',
  logs: 'ログ',
};
const states = {
  waiting: '開始待ち',
  running: '実行中',
  stopped: '停止中',
  starting: '起動中',
  stopping: '停止処理中',
  error: 'エラー',
};
function StateBadge({ extension }: { extension: ExtensionSnapshot }) {
  return (
    <span className={`state ${extension.state}`}>
      <i />
      {states[extension.state]}
    </span>
  );
}
function App() {
  const appletSidebar = useAppletSidebar();
  useEffect(() => window.dock.onSettingsSidebarWidth(appletSidebar.resize), []);
  const [snapshot, setSnapshot] = useState<HostSnapshot>();
  const [pagePlacementRevision, setPagePlacementRevision] = useState(0);
  const [page, setLocalPage] = useRestartView<Page>(
    'page',
    'home',
    (value) =>
      ['home', 'extensions', 'settings', 'logs', 'notifications'].includes(value) ||
      /^page:[a-z0-9.-]+:[a-z0-9.-]+$/.test(value),
  );
  const setPage = (next: Page) => {
    void window.dock.navigate(next).catch((e) => setError(String(e)));
  };
  const ribbonSlot = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      window.dock.onShellFocusHost((edge) => {
        const selector =
          edge === 'before'
            ? '.shell-bar-slot[data-region="titlebar"]'
            : '.sidebar button, main button, main input, main select, main .shell-page-slot';
        const elements = [...document.querySelectorAll<HTMLElement>(selector)].filter(
          (e) => e.getClientRects().length && !e.matches(':disabled'),
        );
        const target = edge === 'before' ? elements.at(-1) : elements[0];
        if (target) target.focus();
        else {
          const main = document.querySelector('main');
          if (main) {
            main.tabIndex = -1;
            main.focus();
          }
        }
      }),
    [],
  );
  const navigationSeen = useRef(-1);
  useEffect(() => {
    const nav = snapshot?.navigation;
    if (!nav || nav.request === navigationSeen.current) return;
    navigationSeen.current = nav.request;
    if (nav.request === 0) {
      if (page !== nav.route)
        void window.dock.navigate(page, true).catch((error) => setError(String(error)));
      return;
    }
    setLocalPage(nav.route as Page);
    if (nav.appletId) setSelected(nav.appletId);
    if (nav.appletDetail === 'description') setDetailView('description');
    if (nav.section === 'profile') setProfileRequest((v) => v + 1);
    if (nav.section === 'ribbon') setRibbonRequest((v) => v + 1);
    if (nav.section === 'general') setGeneralRequest((v) => v + 1);
  }, [snapshot?.navigation]);
  const [restoringPage, setRestoringPage] = useState(page.startsWith('page:'));
  const openingRestoredPage = useRef(false);
  const [selected, setSelected] = useRestartView<string>('selected', '');
  const [error, setError] = useState('');
  const openPalette = () =>
    window.dock
      .openCommandPalette({ requestId: crypto.randomUUID(), mode: 'execute' })
      .catch((e) => setError(String(e)));
  const [busy, setBusy] = useState(false);
  const [profileRequest, setProfileRequest] = useState(0);
  const [updatesRequest, setUpdatesRequest] = useState(0);
  const [ribbonRequest, setRibbonRequest] = useState(0);
  const [generalRequest, setGeneralRequest] = useState(0);
  const [webAccountsRequest, setWebAccountsRequest] = useState(0);
  const appletPageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      const r = ribbonSlot.current?.getBoundingClientRect();
      void window.dock
        .shellViewport(
          r
            ? {
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
              }
            : null,
        )
        .catch((e) => setError(String(e)));
    };
    update();
    const observer = new ResizeObserver(update);
    if (ribbonSlot.current) observer.observe(ribbonSlot.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [!!snapshot]);
  const [detailView, setDetailView] = useRestartView<AppletDetailView>(
    'detailView',
    'description',
    ['description', 'settings', 'shortcuts', 'logs'],
  );
  const detailSettings = detailView === 'settings' || detailView === 'shortcuts';
  const settingsPageReady = snapshot?.startupReady === true && snapshot.navigation.route === page;
  const editor = useSettingsEditor(snapshot?.settings);
  const settingsViewRestored = useRef(false);
  useEffect(() => {
    if (!snapshot?.startupReady || !editor.sessionId) return;
    const key = 'appdock.restart-view.category';
    if (!settingsViewRestored.current) {
      settingsViewRestored.current = true;
      if (new URLSearchParams(location.search).get('restoreView') === '1') {
        try {
          const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
          if (typeof saved === 'string' && saved.length < 200 && saved !== editor.pageId) {
            editor.selectPage(saved);
            return;
          }
        } catch {}
      }
    }
    try {
      localStorage.setItem(key, JSON.stringify(editor.pageId));
    } catch {}
  }, [snapshot?.startupReady, editor.sessionId, editor.pageId]);
  useEffect(() => {
    if (profileRequest) editor.selectPage('profile');
  }, [profileRequest]);
  useEffect(() => {
    if (updatesRequest) editor.selectPage('about');
  }, [updatesRequest]);
  useEffect(() => {
    if (ribbonRequest) editor.selectPage('ribbon');
  }, [ribbonRequest]);
  useEffect(() => {
    if (generalRequest) editor.selectPage('general');
  }, [generalRequest]);
  useEffect(() => {
    if (webAccountsRequest) editor.selectPage('web-accounts');
  }, [webAccountsRequest]);
  useEffect(
    () =>
      window.dock.onFlushSettingsInputs((id) => {
        void Promise.all([editor.flush(), flushSettingsPageInputs()])
          .then(() => window.dock.settingsInputsFlushed(id))
          .catch((e) => setError(String(e)));
      }),
    [editor.flush],
  );
  const orderedApplets = orderApplets(
    snapshot?.extensions.filter((e) => e.sourceKind !== 'builtin') ?? [],
    editor.value.appletOrder,
  );
  const [logSource, setLogSource] = useRestartView<string>('logSource', '');
  useEffect(() => window.dock.onLogSourceChanged(setLogSource), []);
  const knownCommands = useRef(new Map<string, UiCommand>());
  const load = async () => {
    try {
      setSnapshot(await window.dock.snapshot());
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
    return window.dock.onChanged(() => void load());
  }, []);
  useEffect(() => {
    return window.dock.onHostCommand((id) => {
      void execute(id);
    });
  }, []);
  useEffect(
    () =>
      window.dock.onHomeCommandResult(({ error }) => {
        if (error) setError(error);
      }),
    [],
  );
  useEffect(
    () =>
      window.dock.onAppletPage((key) => {
        // Main already owns navigation. Re-selecting the route can cancel its pending
        // input drain; the same route still needs fresh bounds after a Window move.
        setPagePlacementRevision((revision) => revision + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!restoringPage || !snapshot?.startupReady || openingRestoredPage.current) return;
    if (!page.startsWith('page:')) {
      setRestoringPage(false);
      return;
    }
    const [, id, pageId] = page.split(':');
    const extension = snapshot.extensions.find((e) => e.id === id);
    if (
      !extension?.enabled ||
      extension.state === 'error' ||
      !extension.pages?.some((p) => p.id === pageId)
    ) {
      setPage('home');
      setRestoringPage(false);
      return;
    }
    if (extension.state !== 'running') return;
    openingRestoredPage.current = true;
    void window.dock
      .openAppletPage(id, pageId)
      .catch((error) => {
        setError(String(error));
        setPage('home');
      })
      .finally(() => setRestoringPage(false));
  }, [snapshot, page, restoringPage]);
  useLayoutEffect(() => {
    const update = () => {
      const element = appletPageRef.current;
      const rect = element?.getBoundingClientRect();
      if (restoringPage) return;
      const key = page.startsWith('page:') ? page : null;
      void window.dock
        .pageViewport(
          key,
          key && rect
            ? {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.max(1, Math.round(rect.width)),
                height: Math.max(1, Math.round(rect.height)),
              }
            : null,
        )
        .catch((error) => setError(String(error)));
    };
    update();
    const observer = new ResizeObserver(update);
    if (appletPageRef.current) observer.observe(appletPageRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [page, error, !!snapshot, restoringPage, pagePlacementRevision, snapshot?.navigation.request]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        (e.target instanceof Element && e.target.closest('[data-shortcut-recorder]'))
      )
        return;
      const shortcut = shortcutFromEvent(e);
      if (shortcut && window.dock.ownsGlobalShortcut(shortcut)) return;
      if (
        !e.ctrlKey &&
        !e.altKey &&
        e.target instanceof Element &&
        e.target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const matches =
        shortcut &&
        snapshot &&
        resolveKeybindings(
          getKeybindings(snapshot.settings.value),
          shortcut,
          {
            appFocused: true,
            appletId: page.startsWith('page:') ? page.split(':')[1] : undefined,
          },
          commands.filter((c) => c.available),
        );
      if (shortcut && matches && matches.length) {
        e.preventDefault();
        void window.dock
          .dispatchShortcut(shortcut)
          .then((result) => {
            if (result?.failed)
              setError('ショートカットの一部を実行できませんでした。ログを確認してください。');
          })
          .catch((error) => setError(String(error)));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [snapshot, busy, page]);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.dark ? 'dark' : 'light';
  }, [snapshot?.dark]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const goExtension = async (id: string) => {
    try {
      await window.dock.flushSettings();
    } catch (e) {
      setError(String(e));
      return;
    }
    setSelected(id);
    setPage('extensions');
  };
  const commands: UiCommand[] = [
    ...hostCommands.map((command) => ({ ...command, extensionId: null })),
    ...appletManagementCommands(snapshot?.extensions ?? []),
    ...(snapshot?.extensions.flatMap((e) =>
      e.commands.map((c) => ({ ...c, extension: e.displayName, extensionId: e.id })),
    ) ?? []),
  ];
  for (const command of commands) knownCommands.current.set(command.id, command);
  const commandIds = new Set(commands.map((c) => c.id));
  const shortcutCommands: UiCommand[] = [
    ...commands,
    ...[
      ...new Set([
        ...knownCommands.current.keys(),
        ...Object.keys(snapshot?.settings.value.shortcuts ?? {}),
        ...(snapshot?.settings.value.trayCommands ?? []),
        ...(snapshot ? [snapshot.settings.value.host.trayClickCommand] : []),
        ...(snapshot?.settings.value.host.trayDoubleClickCommand
          ? [snapshot.settings.value.host.trayDoubleClickCommand]
          : []),
      ]),
    ]
      .filter((id) => !commandIds.has(id))
      .map((id) => ({
        ...(knownCommands.current.get(id) ?? { id, title: id, extension: '未確認のコマンド' }),
        available: false,
      })),
  ];
  async function execute(id: string) {
    if (id === 'appdock.notifications.open') {
      setPage('notifications');
      return;
    }
    if (id === 'appdock.applets.open' || id === 'appdock.logs.open') {
      if (id === 'appdock.logs.open') setLogSource('');
      setPage(id === 'appdock.applets.open' ? 'extensions' : 'logs');
      return;
    }
    if (id === 'appdock.updates.open') {
      setUpdatesRequest((value) => value + 1);
      setPage('settings');
      return;
    }
    if (id === 'appdock.commands.search') {
      await openPalette();
      return;
    }
    if (id === 'appdock.settings.open') {
      setPage('settings');
      return;
    }
    await action(() => window.dock.executeCommand(id));
  }
  const selectedApplet = orderedApplets.find((e) => e.id === selected) ?? orderedApplets[0];
  return (
    <div
      className={`shell ${page === 'extensions' ? 'with-sidebar' : ''}`}
      data-route={page}
      style={{ '--applet-sidebar-width': `${appletSidebar.width}px` } as React.CSSProperties}
    >
      <ShellBarSlot region="titlebar" />
      <div
        className="shell-ribbon-slot"
        ref={ribbonSlot}
        tabIndex={0}
        aria-label="リボンに移動"
        onFocus={(event) => {
          const from = event.relatedTarget;
          const before =
            from instanceof Node &&
            !!(
              from.compareDocumentPosition(event.currentTarget) & Node.DOCUMENT_POSITION_FOLLOWING
            );
          void window.dock.focusShell(before ? 'first' : 'last');
        }}
      />
      {page === 'extensions' && (
        <aside className="sidebar" aria-label="Applet一覧">
          <AppletIndex
            applets={orderedApplets}
            selected={selectedApplet?.id}

            onSelect={goExtension}
            editor={editor}
            busy={busy}
          />
          <div className="sidebar-resizer" {...appletSidebar.separatorProps} />
        </aside>
      )}
      <main
        className={
          page === 'settings' || page === 'home' || page === 'logs' || page === 'notifications'
            ? 'shell-page-main'
            : page === 'extensions'
              ? 'applet-detail-main settings-main applet-detail-settings-main'
              : page.startsWith('page:')
                ? 'applet-page-main'
                : undefined
        }
      >
        {snapshot?.shell.error && (
          <div className="error-banner" role="alert">
            Shellの起動または切替に失敗しました。
            <button onClick={() => void action(() => window.dock.retryShell())}>
              Shellを再試行
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="エラーを閉じる" onClick={() => setError('')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {!snapshot ? (
          <div className="loading">Dockに接続しています…</div>
        ) : (
          <div className="page-content">
            {page.startsWith('page:') && (
              <div className="applet-page-body">
                {snapshot.extensions
                  .filter((a) => !!snapshot.webPages[a.id] && `page:${a.id}:main` === page)
                  .map((a) => (
                    <div className="web-page-toolbar" key={a.id}>
                      <strong>{a.name}</strong>
                      <button
                        disabled={!snapshot.webPages[a.id]?.canGoBack}
                        onClick={() => void action(() => window.dock.webNavigate(a.id, 'back'))}
                      >
                        戻る
                      </button>
                      <button
                        disabled={!snapshot.webPages[a.id]?.canGoForward}
                        onClick={() => void action(() => window.dock.webNavigate(a.id, 'forward'))}
                      >
                        進む
                      </button>
                      <button
                        onClick={() => void action(() => window.dock.webNavigate(a.id, 'reload'))}
                      >
                        リロード
                      </button>
                      <button
                        onClick={() => void action(() => window.dock.webNavigate(a.id, 'home'))}
                      >
                        開始ページへ
                      </button>
                      <span>
                        {snapshot.webPages[a.id]?.loading
                          ? '読み込み中…'
                          : snapshot.webPages[a.id]?.error || snapshot.webPages[a.id]?.origin}
                      </span>
                    </div>
                  ))}
                <div
                  className="applet-page-viewport"
                  ref={appletPageRef}
                  aria-label="Appletページ"
                />
              </div>
            )}
            {page === 'home' && (
              <ShellPageSlot
                key="home"
                kind="home"
                appletOrder={editor.value.appletOrder}
                navigationRequest={snapshot.navigation.request}
              />
            )}
            {page === 'extensions' && (
              <>
                <PageHeading
                  title="Applet"
                  action={
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => void action(() => window.dock.openPath('extensions'))}
                      >
                        <Icon name="folder" size={16} />
                        Appletフォルダを開く
                      </button>
                    </div>
                  }
                />
                <SettingsToolbar editor={editor} busy={busy} />
                {!detailSettings && (
                  <SettingsMessages editor={editor} currentRevision={snapshot.settings.revision} />
                )}
                <div className="extensions-layout">
                  <ExtensionDetail
                    extension={selectedApplet}
                    view={detailView}
                    onView={(view) => {
                      void window.dock
                        .flushSettings()
                        .then(() => setDetailView(view))
                        .catch((e) => setError(String(e)));
                      return true;
                    }}
                    settingsPanel={
                      detailSettings && selectedApplet ? (
                        <>
                          <SettingsMessages
                            editor={editor}
                            currentRevision={snapshot.settings.revision}
                          />
                          <AppletSettingsPanel
                            ready={settingsPageReady}
                            commands={shortcutCommands}
                            applets={orderedApplets.map((e) => ({
                              id: e.id,
                              title: e.displayName,
                            }))}
                            applet={selectedApplet}
                            editor={editor}
                            tab={detailView === 'shortcuts' ? 'shortcuts' : 'settings'}
                            webAccounts={snapshot.webAccounts}
                            onWebAccounts={() => {
                              setPage('settings');
                              setWebAccountsRequest((n) => n + 1);
                            }}
                          />
                        </>
                      ) : undefined
                    }
                    logsPanel={
                      detailView === 'logs' && selectedApplet ? (
                        <ShellPageSlot
                          key={selectedApplet.id}
                          scope={{ type: 'applet', id: selectedApplet.id }}
                          navigationRequest={snapshot.navigation.request}
                        />
                      ) : undefined
                    }
                    busy={busy}
                    updateDisabled={editor.pending}
                    run={action}
                  />
                </div>
              </>
            )}
            <div className="settings-page" hidden={page !== 'settings'}>
              {page === 'settings' && (
                <SettingsPage ready={settingsPageReady} sidebarWidth={appletSidebar.width} />
              )}
            </div>
            {page === 'notifications' && (
              <ShellPageSlot kind="notifications" navigationRequest={snapshot.navigation.request} />
            )}
            {page === 'logs' && (
              <ShellPageSlot
                scope={{ type: 'all' }}
                source={logSource}
                navigationRequest={snapshot.navigation.request}
              />
            )}
          </div>
        )}
      </main>
      <ShellBarSlot region="statusbar" />
    </div>
  );
}
function PageHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading compact">
      <div>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}
type Run = (work: () => Promise<unknown>) => Promise<void>;
function ExtensionDetail({
  extension: e,
  busy,
  updateDisabled,
  run,
  view,
  onView,
  settingsPanel,
  logsPanel,
  builtin = false,
}: {
  extension?: ExtensionSnapshot;
  view: AppletDetailView;
  onView(view: AppletDetailView): boolean;
  settingsPanel?: React.ReactNode;
  logsPanel?: React.ReactNode;
  builtin?: boolean;
  busy: boolean;
  updateDisabled: boolean;
  run: Run;
}) {
  if (!e)
    return (
      <section className="detail empty">
        Appletフォルダにextension.jsonを配置してAppDockを起動し直してください。
      </section>
    );
  return (
    <section className="detail">
      <div className="detail-heading">
        <span className={`extension-icon large ${e.runtime}`}>
          <Icon name="extensions" size={30} />
        </span>
        <div>
          <h2>{e.displayName}</h2>
          <p>
            {builtin ? (
              '組み込み'
            ) : (
              <>
                v{e.version} <span className="divider">/</span>{' '}
                {!!e.collection
                  ? 'Appletページ'
                  : e.runtime === 'node'
                    ? 'TypeScript · Node.js'
                    : 'C# · .NET 10'}
              </>
            )}
          </p>
        </div>
        {!builtin && (
          <Toggle
            checked={e.enabled}
            label={`${e.displayName}を有効にする`}
            disabled={busy}
            onChange={(v) => void run(() => window.dock.toggleExtension(e.id, v))}
          />
        )}
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Applet詳細の切り替え">
        {(
          [
            { id: 'description', title: '説明', icon: 'extensions' },
            { id: 'settings', title: '設定', icon: 'settings' },
            { id: 'shortcuts', title: 'ショートカット', icon: 'command' },
            { id: 'logs', title: 'ログ', icon: 'logs' },
          ] as const
        ).map((tab, index, tabs) => (
          <button
            key={tab.id}
            id={`applet-detail-tab-${tab.id}`}
            role="tab"
            aria-selected={view === tab.id}
            aria-controls="applet-detail-panel"
            tabIndex={view === tab.id ? 0 : -1}
            onClick={() => onView(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : undefined;
              if (next === undefined) return;
              event.preventDefault();
              if (onView(tabs[next].id))
                document.getElementById(`applet-detail-tab-${tabs[next].id}`)?.focus();
            }}
          >
            <Icon name={tab.icon} size={16} />
            {tab.title}
          </button>
        ))}
      </div>
      {settingsPanel ? (
        <div
          className="detail-settings"
          id="applet-detail-panel"
          role="tabpanel"
          aria-labelledby={`applet-detail-tab-${view}`}
        >
          {settingsPanel}
        </div>
      ) : logsPanel ? (
        <div
          className="detail-logs"
          id="applet-detail-panel"
          role="tabpanel"
          aria-labelledby="applet-detail-tab-logs"
        >
          {logsPanel}
        </div>
      ) : (
        <div
          className="detail-description-panel"
          id="applet-detail-panel"
          role="tabpanel"
          aria-labelledby="applet-detail-tab-description"
        >
          <p className="detail-description">{e.description}</p>
          {
            <>
              {e.minimumHostVersion && (
                <p className="muted">AppDock v{e.minimumHostVersion}以降が必要です。</p>
              )}
              {!e.collection && (
                <VersionCheck key={e.id} id={e.id} disabled={busy || updateDisabled} />
              )}
              <div className="detail-state">
                <StateBadge extension={e} />
                <button
                  className="text-button"
                  disabled={busy || !e.enabled}
                  onClick={() => void run(() => window.dock.restartExtension(e.id))}
                >
                  <Icon name="refresh" size={14} />
                  再起動
                </button>
              </div>
              {e.error && <div className="error-text">{e.error}</div>}
              {e.state === 'waiting' && (
                <div className="extension-panel">
                  <p>
                    {e.displayName} は {new Date(e.scheduledStartAt!).toLocaleTimeString()}{' '}
                    に開始します。
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => window.dock.startExtensionNow(e.id))}
                  >
                    今すぐ開始
                  </button>
                </div>
              )}
              {e.panel ? (
                <div className="extension-panel">
                  <h3>{e.panel.title}</h3>
                  <p>{e.panel.description}</p>
                  {!!e.panel.tabs?.length && (
                    <nav className="panel-tabs" aria-label="パネルの切り替え">
                      {e.panel.tabs.map((tab) => (
                        <button
                          className="secondary"
                          key={tab.actionId ?? tab.command}
                          aria-pressed={tab.selected ?? false}
                          disabled={
                            busy ||
                            (!tab.actionId &&
                              !e.commands.some(
                                (command) => command.id === tab.command && command.available,
                              ))
                          }
                          onClick={() =>
                            void run(() =>
                              tab.actionId
                                ? window.dock.executePanelAction(e.id, tab.actionId)
                                : window.dock.executeCommand(tab.command),
                            )
                          }
                        >
                          {tab.title}
                        </button>
                      ))}
                    </nav>
                  )}
                  {!!e.panel.images?.length && (
                    <div className="panel-images">
                      {e.panel.images.map((item, i) => (
                        <PanelImageCard key={i} item={item} extension={e} busy={busy} run={run} />
                      ))}
                    </div>
                  )}
                  <dl>
                    {e.panel.facts?.map((f, i) => (
                      <div key={i}>
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="actions">
                    {e.panel.actions?.map((a) => (
                      <button
                        className="secondary"
                        key={a.actionId ?? a.command}
                        disabled={
                          busy ||
                          (!a.actionId &&
                            !e.commands.some((c) => c.id === a.command && c.available))
                        }
                        onClick={() =>
                          void run(() =>
                            a.actionId
                              ? window.dock.executePanelAction(e.id, a.actionId)
                              : window.dock.executeCommand(a.command),
                          )
                        }
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="inactive-panel">
                  <Icon name="extensions" size={28} />
                  <h3>
                    {!e.enabled
                      ? 'このAppletをDockにつなぐ'
                      : e.state === 'waiting'
                        ? 'Appletの開始を待っています'
                        : e.state === 'starting'
                          ? 'Appletを起動しています'
                          : e.state === 'stopping'
                            ? 'Appletを停止しています'
                            : e.state === 'error'
                              ? 'Appletでエラーが発生しました'
                              : e.state === 'running'
                                ? '専用の操作画面はありません'
                                : 'Appletは停止しています'}
                  </h3>
                  <p>
                    {!e.enabled
                      ? '有効にすると、Appletの画面とコマンドを使えます。'
                      : e.state === 'error'
                        ? 'ログを確認して、必要に応じて再起動してください。'
                        : e.state === 'running'
                          ? '設定やコマンド検索から操作できます。'
                          : '状態が変わるまでお待ちください。必要に応じて再起動できます。'}
                  </p>
                </div>
              )}
              <details className="detail-meta">
                <summary>技術情報</summary>
                <div>
                  <span>Extension ID</span>
                  <code>{e.id}</code>
                </div>
                <div>
                  <span>Host API</span>
                  <p>{e.capabilities?.join(' · ') || 'なし'}</p>
                </div>
              </details>
            </>
          }
        </div>
      )}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(
  <SettingsControlsProvider api={window.dock}>
    <App />
  </SettingsControlsProvider>,
);

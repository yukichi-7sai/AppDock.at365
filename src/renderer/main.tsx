import { SettingsControlsProvider } from './settings-ui/api';
import { RegisteredImagesProvider, ImagePickerHost } from './settings-ui/RegisteredImagePicker';
import { flushSettingsPageInputs } from './settings-input-flush';
import { HostPageSlot } from './pages/HostPageSlot';
import { ImageLibraryDialogHost } from './ImageLibraryDialogHost';
import { ShellBarSlot } from './ShellBarSlot';
import { SettingsPage } from './settings/SettingsPage';
import { Icon } from './Icon';
import { getKeybindings, resolveKeybindings } from '../shared/keybindings';
import { hostShortcutPage } from '../shared/shortcut-pages';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DockApi, HostSnapshot, ExtensionSnapshot } from '../shared/contracts';
import './style.css';
import { hostCommandsForApplets, shortcutFromEvent, type UiCommand } from '../shared/commands';
import { appletManagementCommands } from '../shared/applet-management';
import { useSettingsEditor } from './useSettingsEditor';
import { useRestartView } from './useRestartView';
import { defaultNavigation, isPageRoute, type PageRoute } from '../shared/navigation';
import { useAppletSidebar } from './useAppletSidebar';
import { ribbonDisplayWidth } from '../shared/ribbon';

declare global {
  interface Window {
    dock: DockApi;
  }
}
type Page = PageRoute;
function App() {
  const appletSidebar = useAppletSidebar();
  useEffect(() => window.dock.onSettingsSidebarWidth(appletSidebar.resize), []);
  const [snapshot, setSnapshot] = useState<HostSnapshot>();
  const [pagePlacementRevision, setPagePlacementRevision] = useState(0);
  // Capture this before useRestartView replaces a retired/invalid saved route.
  const [restoreSettingsCategory] = useState(() => {
    if (new URLSearchParams(location.search).get('restoreView') !== '1') return false;
    try {
      return isPageRoute(JSON.parse(localStorage.getItem('appdock.restart-view.page') ?? 'null'));
    } catch {
      return false;
    }
  });
  const [page, setLocalPage] = useRestartView<Page>('page', defaultNavigation.route, isPageRoute);
  const setPage = (next: Page) => {
    void window.dock.navigate(next).catch((e) => setError(String(e)));
  };
  const openDefaultPage = () => {
    void window.dock.navigate(null).catch((e) => setError(String(e)));
  };
  const ribbonSlot = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      window.dock.onShellFocusHost((edge) => {
        const selector =
          edge === 'before'
            ? '.shell-bar-slot[data-region="titlebar"]'
            : '.sidebar button, main button, main input, main select, main summary';
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
    if (nav.route === 'logs' && typeof nav.appletId === 'string') setLogSource(nav.appletId);
    if (nav.section === defaultNavigation.section) editor.selectPage(defaultNavigation.section);
    else if (nav.section === 'applets') editor.selectPage('applets');
    else if (nav.route === 'settings' && nav.appletId && nav.appletDetail === 'settings')
      editor.selectPage(`applet:${nav.appletId}`);
    if (nav.section === 'ribbon') setRibbonRequest((v) => v + 1);
    if (nav.section === 'general') setGeneralRequest((v) => v + 1);
  }, [snapshot?.navigation]);
  const [restoringPage, setRestoringPage] = useState(page.startsWith('page:'));
  const openingRestoredPage = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ribbonRequest, setRibbonRequest] = useState(0);
  const [generalRequest, setGeneralRequest] = useState(0);
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
    // Native Applet views can cover this renderer; mode changes must not wait for an observer frame.
  }, [!!snapshot, snapshot?.ribbonDisplayMode]);
  const settingsPageReady = snapshot?.startupReady === true && snapshot.navigation.route === page;
  const editor = useSettingsEditor(snapshot?.settings);
  const settingsViewRestored = useRef(false);
  useEffect(() => {
    if (!snapshot?.startupReady || !editor.sessionId) return;
    const key = 'appdock.restart-view.category';
    if (!settingsViewRestored.current) {
      settingsViewRestored.current = true;
      if (restoreSettingsCategory) {
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
    if (ribbonRequest) editor.selectPage('ribbon');
  }, [ribbonRequest]);
  useEffect(() => {
    if (generalRequest) editor.selectPage('general');
  }, [generalRequest]);
  useEffect(
    () =>
      window.dock.onFlushSettingsInputs((id) => {
        void Promise.all([editor.flush(), flushSettingsPageInputs()])
          .then(() => window.dock.settingsInputsFlushed(id))
          .catch((e) => setError(String(e)));
      }),
    [editor.flush],
  );
  const [logSource, setLogSource] = useRestartView<string>('logSource', '');
  useEffect(() => window.dock.onLogSourceChanged(setLogSource), []);
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
      window.dock.onAppletPage(() => {
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
      openDefaultPage();
      setRestoringPage(false);
      return;
    }
    if (extension.state !== 'running') return;
    openingRestoredPage.current = true;
    void window.dock
      .openAppletPage(id, pageId)
      .catch((error) => {
        setError(String(error));
        openDefaultPage();
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
  }, [
    page,
    error,
    !!snapshot,
    restoringPage,
    pagePlacementRevision,
    snapshot?.navigation.request,
    snapshot?.ribbonDisplayMode,
  ]);
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
            pageId: page.startsWith('page:') ? page : hostShortcutPage(page),
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
  const commands: UiCommand[] = [
    ...hostCommandsForApplets(snapshot?.extensions ?? []).map((command) => ({
      ...command,
      extensionId: null,
    })),
    ...appletManagementCommands(snapshot?.extensions ?? []),
    ...(snapshot?.extensions.flatMap((e) =>
      e.commands.map((c) => ({ ...c, extension: e.displayName, extensionId: e.id })),
    ) ?? []),
  ];
  async function execute(id: string) {
    if (id === 'appdock.image-library.open') {
      setPage('image-library');
      return;
    }
    if (id === 'appdock.notifications.open') {
      setPage('notifications');
      return;
    }
    if (id === 'appdock.applets.open' || id === 'appdock.logs.open') {
      if (id === 'appdock.logs.open') setLogSource('');
      setPage(id === 'appdock.applets.open' ? 'extensions' : 'logs');
      return;
    }
    if (id === 'appdock.settings.open') {
      setPage('settings');
      return;
    }
    await action(() => window.dock.executeCommand(id));
  }
  return (
    <div
      className="shell"
      data-route={page}
      style={
        {
          '--applet-sidebar-width': `${appletSidebar.width}px`,
          '--ribbon-width': `${ribbonDisplayWidth(snapshot?.ribbonDisplayMode)}px`,
        } as React.CSSProperties
      }
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
      <main
        className={
          page === 'settings' ||
          page === 'logs' ||
          page === 'notifications' ||
          page === 'image-library'
            ? 'host-page-main'
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
            <div className="settings-page" hidden={page !== 'settings'}>
              {page === 'settings' && (
                <SettingsPage ready={settingsPageReady} sidebarWidth={appletSidebar.width} />
              )}
            </div>
            {page === 'notifications' && (
              <HostPageSlot kind="notifications" navigationRequest={snapshot.navigation.request} />
            )}
            {page === 'image-library' && (
              <HostPageSlot
                key="image-library"
                kind="image-library"
                navigationRequest={snapshot.navigation.request}
              />
            )}
            {page === 'logs' && (
              <HostPageSlot
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
createRoot(document.getElementById('root')!).render(
  <SettingsControlsProvider api={window.dock}>
    <RegisteredImagesProvider api={window.dock.imageLibrary}>
      <App />
      <ImagePickerHost />
      <ImageLibraryDialogHost />
    </RegisteredImagesProvider>
  </SettingsControlsProvider>,
);

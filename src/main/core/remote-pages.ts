import { hostText } from '../../shared/i18n';
import { session, nativeImage, dialog, net, type WebContents } from 'electron';
import path from 'node:path';
import { AppletSurface, pageHostShortcut } from './applet-pages';
import type { SettingsStore } from './settings';
import { WebProfileStore } from './web-profiles';
import type { ExtensionSnapshot } from '../../shared/contracts';
import {
  allowedWebNavigation,
  type RemotePageDefinition,
  type WebPageState,
  type WebProfile,
} from '../../shared/web-content';

export class RemotePageService {
  private views = new Map<
    string,
    { surface: AppletSurface; item: RemotePageDefinition; state: WebPageState }
  >();
  private clearing = new Set<string>();
  private sessions = new Map<string, Electron.Session>();
  private closed = false;
  private profiles: WebProfileStore;
  constructor(
    private items: () => RemotePageDefinition[],
    private localDirectory: string,
    private changed: () => void,
    sharedFile: string,
    failed: (error: Error) => void = () => {},
    private windowState?: (id: string) => import('./state-storage').StateStorage,
  ) {
    this.profiles = new WebProfileStore(sharedFile, localDirectory);
    this.profiles.loadStandalone(() => this.items().length > 0);
    try {
      this.profiles.cleanupSessions(this.items().map((a) => a.accountId));
    } catch {
      queueMicrotask(() => failed(Error(hostText('services.remotePages.cleanupDeferred'))));
    }
    this.profiles.watch(() => {
      this.reconcile();
      this.changed();
    }, failed);
  }
  accounts() {
    return this.profiles.snapshot();
  }
  settingsProfiles() {
    if (this.closed || this.clearing.size)
      throw Error(hostText('services.remotePages.accountBusy'));
    return this.profiles;
  }
  validateAccounts(items: RemotePageDefinition[]) {
    for (const item of items) {
      this.profiles.get(item.accountId);
      if (this.clearing.has(item.accountId))
        throw Error(hostText('services.remotePages.accountBusySave'));
    }
  }
  addAccount(name: unknown) {
    if (this.closed) throw Error(hostText('services.remotePages.closed'));
    const account = this.profiles.add(name);
    this.changed();
    return account;
  }
  renameAccount(id: string, name: unknown) {
    if (this.closed || this.clearing.has(id))
      throw Error(hostText('services.remotePages.accountBusy'));
    this.profiles.rename(id, name);
    this.changed();
  }
  private checkConfirmation(id: string, confirmed: WebProfile) {
    // Re-read the roster before any destructive work, including before its watcher fires.
    this.profiles.publicConfiguration();
    const current = this.profiles.get(id);
    if (!confirmed || confirmed.id !== id || confirmed.name !== current.name)
      throw Error(hostText('services.webProfiles.changed'));
  }
  async deleteAccount(id: string, confirmed?: WebProfile) {
    const account = this.profiles.get(id);
    const used = () => this.items().some((a) => a.accountId === id);
    if (this.closed || this.clearing.has(id))
      throw Error(hostText('services.remotePages.accountBusy'));
    if (used()) throw Error(hostText('services.remotePages.accountInUse'));
    this.clearing.add(id);
    try {
      if (confirmed === undefined) {
        const answer = await dialog.showMessageBox({
          type: 'warning',
          message: hostText('services.remotePages.deleteAccount', { name: String(account.name) }),
          detail: hostText('services.remotePages.deleteDetails'),
          buttons: [
            hostText('services.remotePages.cancel'),
            hostText('services.remotePages.delete'),
          ],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1) return false;
      }
      if (this.closed) return false;
      this.checkConfirmation(id, confirmed ?? account);
      if (used()) throw Error(hostText('services.remotePages.accountAssigned'));
      const ses = this.sessions.get(id);
      if (ses) await this.eraseSession(ses);
      if (this.closed) return false;
      if (used()) throw Error(hostText('services.remotePages.accountAssigned'));
      this.profiles.remove(id);
      this.changed();
      const remaining = this.profiles.cleanupSessions(
        this.items().map((a) => a.accountId),
        this.sessions.keys(),
      );
      this.changed();
      return remaining.includes(id) ? ('deferred' as const) : ('deleted' as const);
    } finally {
      this.clearing.delete(id);
    }
  }
  private account(id: string) {
    this.profiles.get(id);
    const cached = this.sessions.get(id);
    if (cached) return cached;
    const ses = session.fromPath(path.join(this.localDirectory, 'sessions', id));
    ses.setSpellCheckerEnabled(false);
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    this.sessions.set(id, ses);
    return ses;
  }
  states() {
    return Object.fromEntries([...this.views].map(([id, v]) => [id, v.state]));
  }
  reconcile() {
    for (const [id, v] of this.views) {
      const a = this.items().find((a) => a.id === id);
      if (
        !a ||
        !a.enabled ||
        !this.accounts().some((p) => p.id === a.accountId) ||
        a.url !== v.item.url ||
        a.accountId !== v.item.accountId
      ) {
        v.surface.close();
        this.views.delete(id);
      } else {
        v.item = a;
        v.surface.options.title = a.name;
        v.surface.options.defaultDisplay = a.display;
        if (v.surface.display === 'window') v.surface.window?.setTitle(a.name);
      }
    }
  }
  async open(id: string, presentation?: import('./applet-pages').PageOpenOptions) {
    if (this.closed) throw Error(hostText('services.remotePages.pageMissing'));
    const a = this.items().find((a) => a.id === id);
    if (!a?.enabled || this.clearing.has(a.accountId))
      throw Error(hostText('services.remotePages.unavailable'));
    let v = this.views.get(id);
    if (!v) {
      const state: WebPageState = {
        loading: true,
        error: '',
        origin: new URL(a.url).origin,
        canGoBack: false,
        canGoForward: false,
      };
      let wc: WebContents;
      const surface = new AppletSurface({
        appletId: id,
        key: `page:${id}:main`,
        title: a.name,
        url: a.url,
        partition: `web-applet-${a.accountId}`,
        session: this.account(a.accountId),
        remote: true,
        stateFile: this.windowState?.(id),
        defaultDisplay: a.display,
        onLayout: () => {},
        onCreated: (contents) => {
          wc = contents;
          const current = () => this.items().find((item) => item.id === id) ?? a;
          const permitted = (url: string) => allowedWebNavigation(current(), url);
          const blocked = () => {
            state.error = hostText('services.remotePages.navigationBlocked');
            this.changed();
          };
          wc.on('will-navigate', (event, url) => {
            if (!permitted(url)) {
              event.preventDefault();
              blocked();
            }
          });
          wc.on('will-redirect', (event) => {
            if (event.isMainFrame && !permitted(event.url)) {
              event.preventDefault();
              blocked();
            }
          });
          wc.setWindowOpenHandler(({ url }) => {
            if (permitted(url)) void wc.loadURL(url).catch(() => {});
            else blocked();
            return { action: 'deny' };
          });
          wc.on('before-input-event', (event, input) => {
            // Do not consume normal text-entry keys in an untrusted document.
            if (
              !surface.visible ||
              (!input.control &&
                !input.alt &&
                !/^F([1-9]|1[0-9]|2[0-4])$/i.test(input.key) &&
                input.key !== 'Pause')
            )
              return;
            if (pageHostShortcut(input, id)) event.preventDefault();
          });
          const update = () => {
            if (wc.isDestroyed()) return;
            state.loading = wc.isLoading();
            state.canGoBack = wc.navigationHistory.canGoBack();
            state.canGoForward = wc.navigationHistory.canGoForward();
            try {
              state.origin = new URL(wc.getURL()).origin;
            } catch {}
            this.changed();
          };
          wc.on('did-start-loading', () => {
            state.error = '';
            update();
          });
          wc.on('did-stop-loading', update);
          wc.on('did-navigate', update);
          wc.on('did-navigate-in-page', (_event, url, main) => {
            if (main && !permitted(url) && wc.navigationHistory.canGoBack()) {
              wc.navigationHistory.goBack();
              blocked();
            } else update();
          });
          wc.on('did-fail-load', (_event, code, _description, _url, main) => {
            if (main && code !== -3) {
              state.error = hostText('services.remotePages.loadFailedCode', { code: String(code) });
              this.changed();
            }
          });
          wc.on('render-process-gone', () => {
            state.error = hostText('services.remotePages.rendererStopped');
            this.changed();
          });
        },
      });
      v = { surface, item: a, state };
      this.views.set(id, v);
    }
    try {
      await v.surface.open(presentation);
    } catch {
      v.state.error = hostText('services.remotePages.loadFailed');
      this.changed();
      throw Error(v.state.error);
    }
    this.changed();
  }
  async navigate(id: string, action: unknown) {
    const v = this.views.get(id);
    if (!v || !v.item.enabled || v.surface.ui.webContents.isDestroyed())
      throw Error(hostText('services.remotePages.openFirst'));
    const wc = v.surface.ui.webContents;
    if (action === 'reload') wc.reload();
    else if (action === 'home') await wc.loadURL(v.item.url);
    else if (action === 'back' || action === 'forward') {
      const h = wc.navigationHistory,
        entries = h.getAllEntries(),
        offset = action === 'back' ? -1 : 1;
      const target = entries[h.getActiveIndex() + offset];
      if (target && allowedWebNavigation(v.item, target.url)) h.goToOffset(offset);
    } else throw Error(hostText('services.remotePages.invalidOperation'));
  }
  restart(id: string) {
    const v = this.views.get(id);
    v?.surface.close();
    this.views.delete(id);
    return this.open(id);
  }
  async clearAccount(id: string, confirmed?: WebProfile) {
    if (this.closed) throw Error(hostText('services.remotePages.closed'));
    const account = this.profiles.get(id);
    if (this.clearing.has(id)) throw Error(hostText('services.remotePages.processing'));
    this.clearing.add(id);
    try {
      if (confirmed === undefined) {
        const answer = await dialog.showMessageBox({
          type: 'warning',
          message: hostText('services.remotePages.clearAccount', { name: String(account.name) }),
          detail: hostText('services.remotePages.clearDetails'),
          buttons: [
            hostText('services.remotePages.cancel'),
            hostText('services.remotePages.clear'),
          ],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1) return false;
      }
      if (this.closed) return false;
      this.checkConfirmation(id, confirmed ?? account);
      const ses = this.account(id);
      for (const [key, v] of this.views)
        if (v.item.accountId === id) {
          v.surface.close();
          this.views.delete(key);
        }
      await this.eraseSession(ses);
      this.changed();
      return true;
    } finally {
      this.clearing.delete(id);
    }
  }
  private async eraseSession(ses: Electron.Session) {
    await ses.clearStorageData();
    await ses.clearCache();
    await ses.clearAuthCache();
    await ses.closeAllConnections();
    await ses.cookies.flushStore();
  }
  async close() {
    this.closed = true;
    this.profiles.close();
    for (const v of this.views.values()) v.surface.close();
    this.views.clear();
    const deleted = new Set(this.profiles.pendingDeletion());
    let cleanupFailed = false;
    try {
      this.profiles.cleanupSessions(
        this.items().map((a) => a.accountId),
        this.sessions.keys(),
      );
    } catch {
      cleanupFailed = true;
    }
    const results = await Promise.allSettled(
      [...this.sessions]
        .filter(([id]) => !deleted.has(id))
        .map(async ([, ses]) => {
          ses.flushStorageData();
          await ses.cookies.flushStore();
        }),
    );
    if (cleanupFailed || results.some((r) => r.status === 'rejected'))
      throw Error(hostText('services.remotePages.saveFailed'));
  }
}

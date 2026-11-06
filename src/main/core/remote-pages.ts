import { hostText } from '../../shared/i18n';
import type { WebContents } from 'electron';
import { AppletSurface, pageHostShortcut } from './applet-pages';
import type { CollectionBinding } from '../../shared/page-collections';
import {
  allowedWebNavigation,
  type RemotePageDefinition,
  type WebPageState,
} from '../../shared/web-content';
import type { WebSiteAccounts } from './web-site-accounts';

type RemotePage = RemotePageDefinition & { binding: CollectionBinding };

export class RemotePageService {
  private views = new Map<
    string,
    { surface: AppletSurface; item: RemotePage; state: WebPageState }
  >();
  private closed = false;
  constructor(
    private items: () => RemotePage[],
    private accounts: WebSiteAccounts,
    private changed: () => void,
    private windowState?: (id: string) => import('./state-storage').StateStorage,
  ) {}
  states() {
    return Object.fromEntries([...this.views].map(([id, v]) => [id, v.state]));
  }
  reconcile() {
    for (const [id, v] of this.views) {
      const a = this.items().find((a) => a.id === id);
      if (!a?.enabled || a.url !== v.item.url) {
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
    if (!a?.enabled) throw Error(hostText('services.remotePages.unavailable'));
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
        partition: `web-applet-${a.id}`,
        session: this.accounts.session(a.binding),
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
  close() {
    this.closed = true;
    for (const v of this.views.values()) v.surface.close();
    this.views.clear();
  }
}

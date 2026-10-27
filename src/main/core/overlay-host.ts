import { hostText } from '../../shared/i18n';
import type { ShellProviderRegistry, ShellProvider } from './shell-provider-registry';
import {
  BrowserWindow,
  ipcMain,
  webContents,
  type WebContents,
  type IpcMainInvokeEvent,
  type WebContentsView,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { shellView, type ShellRegion } from '../../shared/shell';
import type { OverlayController } from './overlay-controller';
import { createShellView } from './shell-view';

type Surface = {
  region: ShellRegion;
  view: WebContentsView;
  url: string;
  session: string;
  provider: string;
  version: string;
  generation?: string;
  ready: boolean;
  revision: number;
  settingsSignature?: string;
  timer: ReturnType<typeof setTimeout>;
};
/** One modal lane per context. Controllers and providers do not own native layering. */
export class OverlayHost {
  private fallbackOnly = false;
  private current?: OverlayController;
  private surface?: Surface;
  private previousFocus?: WebContents;
  private previousRoute = '';
  private bounds?: Electron.Rectangle;
  private disposed = false;
  constructor(
    private options: {
      window: BrowserWindow;
      preload: string;
      providers(): ShellProvider[];
      registry: ShellProviderRegistry;
      route(): string;
      execute(provider: string, command: string): Promise<unknown>;
      settings(provider: string): Record<string, unknown>;
      changed(): void;
      failed(message: string): void;
      asset?(id: unknown): { dataUrl: string };
    },
  ) {
    for (const region of ['overlay.command-palette'] as const)
      options.registry.observe(region, () => ({
        provider: this.surface?.region === region ? this.surface.provider : null,
        version: this.surface?.version,
        generation: this.surface?.generation,
        session: this.surface?.session,
        ready: this.surface?.region === region && !!this.surface?.ready,
        visible:
          !!this.current &&
          this.surface?.region === region &&
          this.previousRoute === options.route() &&
          !!this.surface?.ready &&
          !options.window.isDestroyed() &&
          options.window.isVisible() &&
          !options.window.isMinimized(),
      }));
    const bound = (event: IpcMainInvokeEvent) => {
      const s = this.surface;
      if (
        !s ||
        !options.registry.usable(s.region, s) ||
        !this.current ||
        this.previousRoute !== options.route() ||
        event.sender !== s.view.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.getURL() !== s.url
      )
        throw Error('Overlay session is not bound');
      return s;
    };
    ipcMain.handle('overlay:connect', (event) => {
      const s = bound(event);
      return {
        sessionId: s.session,
        providerAppletId: s.provider,
        snapshot: this.current!.snapshot(),
      };
    });
    ipcMain.handle('overlay:ready', (event, session) => {
      const s = bound(event);
      if (session !== s.session) throw Error('Stale overlay session');
      clearTimeout(s.timer);
      if (s.ready) return;
      s.ready = true;
      this.layout();
      if (options.window.isFocused()) s.view.webContents.focus();
      this.refresh();
    });
    ipcMain.handle('overlay:act', (event, action) => {
      const s = bound(event);
      if (!s.ready) throw Error('Overlay is not ready');
      return this.current!.act(action);
    });
    ipcMain.handle('overlay:executeCommand', (event, command) => {
      const s = bound(event);
      if (!s.ready) throw Error('Overlay is not ready');
      return options.execute(s.provider, command);
    });
    ipcMain.handle('overlay:getSettings', (event) => options.settings(bound(event).provider));
    ipcMain.handle('overlay:asset', (event, id) => {
      bound(event);
      return options.asset?.(id);
    });
    options.window.on('resize', () => {
      this.cancelRibbon('window-resized');
      this.layout();
    });
    options.window.on('move', () => this.cancelRibbon('window-moved'));
    options.window.on('blur', () => this.cancelRibbon('window-blurred'));
    options.window.on('hide', () => this.cancel('window-hidden'));
    options.window.on('minimize', () => this.cancel('window-minimized'));
    options.window.webContents.on('did-start-loading', () => this.cancel('owner-reloaded'));
    options.window.webContents.on('render-process-gone', () => this.cancel('owner-exited'));
    options.window.once('closed', () => this.dispose());
  }
  get active() {
    return !!this.current;
  }
  get kind() {
    return this.current?.kind ?? null;
  }
  get sourceId() {
    return this.current?.sourceId;
  }
  viewport(bounds: Electron.Rectangle | null) {
    if (
      bounds !== null &&
      (!bounds ||
        ['x', 'y', 'width', 'height'].some((key) => {
          const value = bounds[key as keyof Electron.Rectangle];
          return (
            !Number.isFinite(value) ||
            value < (key === 'x' || key === 'y' ? 0 : 1) ||
            value > 100000
          );
        }))
    )
      throw Error('Invalid overlay viewport');
    this.bounds = bounds ?? undefined;
    this.layout();
  }
  open(controller: OverlayController) {
    if (this.disposed) {
      controller.cancel('shutdown');
      return;
    }
    this.cancel('replaced');
    this.fallbackOnly = false;
    this.previousFocus = this.options.window.isFocused()
      ? (webContents.getFocusedWebContents() ?? this.options.window.webContents)
      : undefined;
    this.previousRoute = this.options.route();
    this.current = controller;
    controller.onClosed(() => {
      if (this.current !== controller) return;
      this.current = undefined;
      const restore =
        !this.options.window.isDestroyed() &&
        this.options.window.isFocused() &&
        this.previousRoute === this.options.route();
      this.closeSurface();
      if (restore && this.previousFocus && !this.previousFocus.isDestroyed())
        this.previousFocus.focus();
      this.previousFocus = undefined;
      this.options.changed();
    });
    this.options.changed();
    this.present();
  }
  cancel(reason = 'dismissed') {
    this.current?.cancel(reason);
  }
  cancelRibbon(reason = 'source-changed') {
    if (this.kind === 'ribbon-group') this.cancel(reason);
  }
  retry(region?: ShellRegion) {
    if (region) this.options.registry.retry(region);
    else {
      this.options.registry.retry('overlay.command-palette');
      this.options.registry.retry('ribbon');
    }
  }
  private present() {
    const controller = this.current;
    if (!controller) return;
    const region: ShellRegion =
      controller.kind === 'ribbon-group' ? 'ribbon' : 'overlay.command-palette';
    const provider =
      controller.kind === 'ribbon-group'
        ? this.options
            .providers()
            .find((p) => p.id === this.options.registry.region('ribbon').boundProvider)
        : this.options.registry.resolve(region, this.fallbackOnly).provider;
    if (!provider) {
      this.cancel('unavailable');
      this.options.failed(hostText('services.overlayHost.startFailed'));
      return;
    }
    try {
      const { view, url } = createShellView(
        provider.folder,
        shellView(provider.shell, region)!,
        this.options.preload,
      );
      view.setBackgroundColor('#00000000');
      const s: Surface = {
        region,
        view,
        url,
        session: randomUUID(),
        provider: provider.id,
        version: provider.version,
        generation: provider.generation,
        ready: false,
        revision: 0,
        timer: setTimeout(() => this.fail(s, 'ready timeout'), 10000),
      };
      this.surface = s;
      this.options.window.contentView.addChildView(view);
      view.webContents.on('render-process-gone', () => this.fail(s, 'renderer exited'));
      view.webContents.on('unresponsive', () => this.fail(s, 'renderer unresponsive'));
      void view.webContents.loadURL(url).catch(() => this.fail(s, 'load failed'));
    } catch {
      this.options.registry.fail(region, provider.id, provider.version);
      if (controller.kind === 'ribbon-group') {
        this.cancel('ribbon-unavailable');
        this.options.failed(
          hostText('services.overlayHost.loadFailed', { provider: String(provider.id) }),
        );
        return;
      }
      this.fallbackOnly = true;
      this.options.failed(
        hostText('services.overlayHost.loadFailed', { provider: String(provider.id) }),
      );
      this.present();
    }
  }
  private fail(s: Surface, reason: string) {
    if (s !== this.surface || !this.current) return;
    this.options.registry.fail(s.region, s.provider, s.version);
    if (this.current.kind === 'ribbon-group') {
      this.cancel('ribbon-unavailable');
      this.options.failed(`${s.provider}: ${reason}`);
      return;
    }
    this.fallbackOnly = true;
    this.closeSurface();
    this.options.failed(`${s.provider}: ${reason}`);
    this.present();
  }
  private closeSurface() {
    const s = this.surface;
    this.surface = undefined;
    this.options.registry.touch();
    if (!s) return;
    clearTimeout(s.timer);
    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(s.view);
    if (!s.view.webContents.isDestroyed()) s.view.webContents.close();
  }
  layout() {
    this.options.registry.touch();
    const s = this.surface;
    if (!s?.ready || this.options.window.isDestroyed()) return;
    const [width, height] = this.options.window.getContentSize();
    const zoom = this.options.window.webContents.getZoomFactor();
    if (this.current?.kind === 'command-palette') {
      if (!this.bounds) {
        s.view.setVisible(false);
        return;
      }
      const x = Math.min(width - 1, Math.round(this.bounds.x * zoom));
      const y = Math.min(height - 1, Math.round(this.bounds.y * zoom));
      s.view.setBounds({
        x,
        y,
        width: Math.max(1, Math.min(width - x, Math.round(this.bounds.width * zoom))),
        height: Math.max(1, Math.min(height - y, Math.round(this.bounds.height * zoom))),
      });
    } else s.view.setBounds({ x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) });
    s.view.webContents.setZoomFactor(zoom);
    s.view.setVisible(true);
    this.options.window.contentView.addChildView(s.view);
  }
  refresh() {
    const s = this.surface;
    if (!this.current || !s) return;
    if (this.previousRoute !== this.options.route()) {
      this.cancel('owner-navigation');
      return;
    }
    if (!this.options.registry.usable(s.region, s)) {
      if (this.current.kind === 'ribbon-group') {
        this.cancel('ribbon-unavailable');
        return;
      }
      this.fallbackOnly = true;
      // Intentional disable/restart must not blacklist a healthy provider.
      this.closeSurface();
      this.present();
      return;
    }
    const model = this.current.snapshot();
    if (!this.current || this.surface !== s) return;
    const signature = JSON.stringify(this.options.settings(s.provider));
    if (s.ready && s.settingsSignature !== signature) {
      s.settingsSignature = signature;
      s.view.webContents.send('overlay:settingsChanged');
    }
    if (s.ready && s.revision !== model.revision) {
      s.revision = model.revision;
      s.view.webContents.send('overlay:changed', model);
    }
    this.layout();
  }
  dispose() {
    this.disposed = true;
    this.cancel('shutdown');
    this.closeSurface();
    for (const name of ['connect', 'ready', 'act', 'executeCommand', 'getSettings', 'asset'])
      ipcMain.removeHandler(`overlay:${name}`);
  }
}

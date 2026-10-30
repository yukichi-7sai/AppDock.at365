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
import { createLocalView, createShellView } from './shell-view';

type Surface = {
  view: WebContentsView;
  url: string;
  session: string;
  ready: boolean;
  revision: number;
  timer: ReturnType<typeof setTimeout>;
  settingsSignature?: string;
} & (
  | { kind: 'command-palette' }
  | {
      kind: 'ribbon-group';
      region: 'ribbon';
      provider: string;
      version: string;
      generation?: string;
    }
);

/** One modal lane; the fixed palette and Shell-owned ribbon groups share native layering. */
export class OverlayHost {
  private current?: OverlayController;
  private surface?: Surface;
  private cached?: Surface;
  private previousFocus?: WebContents;
  private previousRoute = '';
  private bounds?: Electron.Rectangle;
  private disposed = false;
  private paletteRecoveries = 0;
  constructor(
    private options: {
      window: BrowserWindow;
      preload: string;
      palette: { folder: string; entry: string; preload: string };
      providers(): ShellProvider[];
      registry: ShellProviderRegistry;
      route(): string;
      execute(provider: string, command: string): Promise<unknown>;
      settings(provider: string): Record<string, unknown>;
      changed(): void;
      failed(message: string): void;
      shortcut?(input: Electron.Input): boolean;
      asset?(id: unknown): { dataUrl: string } | Promise<{ dataUrl: string }>;
    },
  ) {
    for (const [prefix, kind] of [
      ['palette', 'command-palette'],
      ['overlay', 'ribbon-group'],
    ] as const) {
      ipcMain.handle(`${prefix}:connect`, (event) => {
        const s = this.bound(event, kind);
        return {
          sessionId: s.session,
          ...(s.kind === 'ribbon-group' ? { providerAppletId: s.provider } : {}),
          snapshot: this.current!.snapshot(),
        };
      });
      ipcMain.handle(`${prefix}:ready`, (event, session, readiness?: { modelId?: string }) => {
        const s = this.bound(event, kind);
        if (
          session !== s.session ||
          (s.kind === 'command-palette' && readiness?.modelId !== this.current!.id)
        )
          throw Error('Stale overlay session');
        if (readiness?.modelId !== undefined && readiness.modelId !== this.current!.id)
          throw Error('Stale overlay model');
        clearTimeout(s.timer);
        if (s.ready) return;
        s.ready = true;
        this.layout();
        if (options.window.isFocused()) s.view.webContents.focus();
        this.refresh();
      });
      ipcMain.handle(`${prefix}:act`, (event, action) => {
        const s = this.bound(event, kind);
        if (!s.ready) throw Error('Overlay is not ready');
        return this.current!.act(action);
      });
    }
    ipcMain.handle('overlay:executeCommand', (event, command) => {
      const s = this.bound(event, 'ribbon-group');
      if (!s.ready || s.kind !== 'ribbon-group') throw Error('Overlay is not ready');
      return options.execute(s.provider, command);
    });
    ipcMain.handle('overlay:getSettings', (event) => {
      const s = this.bound(event, 'ribbon-group');
      if (s.kind !== 'ribbon-group') throw Error('Invalid overlay');
      return options.settings(s.provider);
    });
    ipcMain.handle('overlay:asset', (event, id) => {
      this.bound(event, 'ribbon-group');
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
    options.window.webContents.on('did-start-loading', () => this.cancelOwner('owner-reloaded'));
    options.window.webContents.on('render-process-gone', () => this.cancelOwner('owner-exited'));
    options.window.once('closed', () => this.dispose());
  }
  private usable(s: Surface) {
    return s.kind === 'command-palette' || this.options.registry.usable('ribbon', s);
  }
  private bound(event: IpcMainInvokeEvent, kind: Surface['kind']) {
    const s = this.surface;
    if (
      !s ||
      s.kind !== kind ||
      !this.usable(s) ||
      !this.current ||
      this.current.kind !== kind ||
      this.previousRoute !== this.options.route() ||
      event.sender !== s.view.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      event.sender.getURL() !== s.url
    )
      throw Error('Overlay session is not bound');
    return s;
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
    this.paletteRecoveries = 0;
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
      this.closeSurface(true);
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
  private cancelOwner(reason: string) {
    this.cancel(reason);
    if (this.cached) this.destroySurface(this.cached);
    this.cached = undefined;
  }
  cancelRibbon(reason = 'source-changed') {
    if (this.kind === 'ribbon-group') this.cancel(reason);
  }
  retry(region?: ShellRegion) {
    this.options.registry.retry(region ?? 'ribbon');
  }
  private present() {
    const controller = this.current;
    if (!controller) return;
    if (
      controller.kind === 'command-palette' &&
      this.cached &&
      !this.cached.view.webContents.isDestroyed()
    ) {
      const s = this.cached;
      this.cached = undefined;
      s.session = randomUUID();
      s.ready = false;
      s.revision = 0;
      s.timer = setTimeout(() => this.fail(s, 'ready timeout'), 10000);
      this.surface = s;
      s.view.webContents.send('palette:changed', controller.snapshot());
      return;
    }
    try {
      let s: Surface;
      if (controller.kind === 'command-palette') {
        const p = this.options.palette;
        const { view, url } = createLocalView(p.folder, p.entry, p.preload);
        s = {
          kind: 'command-palette',
          view,
          url,
          session: randomUUID(),
          ready: false,
          revision: 0,
          timer: undefined!,
        };
      } else {
        const provider = this.options
          .providers()
          .find((p) => p.id === this.options.registry.region('ribbon').boundProvider);
        if (!provider) {
          this.cancel('ribbon-unavailable');
          return;
        }
        const { view, url } = createShellView(
          provider.folder,
          shellView(provider.shell, 'ribbon')!,
          this.options.preload,
        );
        s = {
          kind: 'ribbon-group',
          region: 'ribbon',
          provider: provider.id,
          version: provider.version,
          generation: provider.generation,
          view,
          url,
          session: randomUUID(),
          ready: false,
          revision: 0,
          timer: undefined!,
        };
      }
      this.surface = s;
      s.timer = setTimeout(() => this.fail(s, 'ready timeout'), 10000);
      s.view.setBackgroundColor('#00000000');
      s.view.setVisible(false);
      this.options.window.contentView.addChildView(s.view);
      s.view.webContents.on('render-process-gone', () => this.fail(s, 'renderer exited'));
      s.view.webContents.on('unresponsive', () => this.fail(s, 'renderer unresponsive'));
      s.view.webContents.on('before-input-event', (event, input) => {
        if (this.surface === s && this.current && s.ready && this.options.shortcut?.(input))
          event.preventDefault();
      });
      void s.view.webContents.loadURL(s.url).catch(() => this.fail(s, 'load failed'));
    } catch {
      this.fail(this.surface, 'load failed');
    }
  }
  private fail(s: Surface | undefined, reason: string) {
    if (s && s === this.cached) {
      this.cached = undefined;
      this.destroySurface(s);
      return;
    }
    if ((s && s !== this.surface) || !this.current) return;
    const palette = this.current.kind === 'command-palette';
    if (!palette && s?.kind === 'ribbon-group')
      this.options.registry.fail('ribbon', s.provider, s.version);
    this.closeSurface();
    if (palette && this.paletteRecoveries++ === 0) {
      this.present();
      return;
    }
    this.cancel(palette ? 'palette-unavailable' : 'ribbon-unavailable');
    this.options.failed(hostText('services.overlayHost.startFailed') + ': ' + reason);
  }
  private closeSurface(reuse = false) {
    const s = this.surface;
    this.surface = undefined;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.kind === 'ribbon-group') this.options.registry.touch();
    if (
      reuse &&
      s.kind === 'command-palette' &&
      !this.disposed &&
      !s.view.webContents.isDestroyed() &&
      !this.options.window.isDestroyed()
    ) {
      if (this.cached) this.destroySurface(this.cached);
      s.ready = false;
      s.session = randomUUID();
      s.view.setVisible(false);
      s.view.webContents.send('palette:suspended');
      this.cached = s;
      return;
    }
    this.destroySurface(s);
  }
  private destroySurface(s: Surface) {
    clearTimeout(s.timer);
    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(s.view);
    if (!s.view.webContents.isDestroyed()) s.view.webContents.close();
  }
  layout() {
    const s = this.surface;
    if (!s?.ready || this.options.window.isDestroyed()) return;
    const [width, height] = this.options.window.getContentSize(),
      zoom = this.options.window.webContents.getZoomFactor();
    if (s.kind === 'command-palette') {
      if (!this.bounds) {
        s.view.setVisible(false);
        return;
      }
      const x = Math.min(width - 1, Math.round(this.bounds.x * zoom)),
        y = Math.min(height - 1, Math.round(this.bounds.y * zoom));
      s.view.setBounds({
        x,
        y,
        width: Math.max(1, Math.min(width - x, Math.round(this.bounds.width * zoom))),
        height: Math.max(1, Math.min(height - y, Math.round(this.bounds.height * zoom))),
      });
    } else {
      s.view.setBounds({ x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) });
      this.options.registry.touch();
    }
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
    if (!this.usable(s)) {
      this.cancel('ribbon-unavailable');
      return;
    }
    const model = this.current.snapshot();
    if (!this.current || this.surface !== s) return;
    if (s.kind === 'ribbon-group') {
      const signature = JSON.stringify(this.options.settings(s.provider));
      if (s.ready && s.settingsSignature !== signature) {
        s.settingsSignature = signature;
        s.view.webContents.send('overlay:settingsChanged');
      }
    }
    if (s.ready && s.revision !== model.revision) {
      s.revision = model.revision;
      s.view.webContents.send(
        s.kind === 'command-palette' ? 'palette:changed' : 'overlay:changed',
        model,
      );
    }
    this.layout();
  }
  dispose() {
    this.disposed = true;
    this.cancel('shutdown');
    this.closeSurface();
    if (this.cached) this.destroySurface(this.cached);
    this.cached = undefined;
    for (const prefix of ['palette', 'overlay'])
      for (const name of ['connect', 'ready', 'act']) ipcMain.removeHandler(`${prefix}:${name}`);
    for (const name of ['executeCommand', 'getSettings', 'asset'])
      ipcMain.removeHandler(`overlay:${name}`);
  }
}

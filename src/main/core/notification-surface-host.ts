import { hostText } from '../../shared/i18n';
import type { ShellProviderRegistry, ShellProvider } from './shell-provider-registry';
import {
  ipcMain,
  type BrowserWindow,
  type WebContentsView,
  type IpcMainInvokeEvent,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { shellView } from '../../shared/shell';
import type { NotificationBannerModel } from '../../shared/notifications';
import type { NotificationSurfaceController } from './notification-surface-controller';
import { createShellView } from './shell-view';
type Surface = {
  view: WebContentsView;
  url: string;
  session: string;
  provider: string;
  version: string;
  generation?: string;
  ready: boolean;
  height: number;
  timer: ReturnType<typeof setTimeout>;
  signature: string;
  settingsSignature: string;
};
/** Shared Shell notification surface; the service owns content, operations and deadlines. */
export class NotificationSurfaceHost {
  private active?: Surface;
  private preparing?: Surface;
  private unavailable = false;
  private disposed = false;
  private refreshing = false;
  private queued = false;
  private stop: () => void;
  constructor(
    private options: {
      window: BrowserWindow;
      preload: string;
      controller: NotificationSurfaceController;
      providers(): ShellProvider[];
      registry: ShellProviderRegistry;
      ready(): boolean;
      settings(provider: string): Record<string, unknown>;
      execute(provider: string, command: string): Promise<unknown>;
      layer(): void;
      visible?(): boolean;
      viewport?(): NotificationBannerModel['viewport'];
      arrange?(view: WebContentsView | undefined, height: number, visible: boolean): void;
      focusHost?(): void;
      openCenter?(): Promise<void>;
      failed(message: string, unavailable: boolean): void;
    },
  ) {
    options.registry.observe(this.region(), () => ({
      provider: this.active?.provider ?? null,
      version: this.active?.version,
      generation: this.active?.generation,
      session: this.active?.session,
      ready: !!this.active?.ready,
      visible: !!this.active?.ready && this.visible(),
      pending: this.preparing?.provider ?? null,
    }));
    const bound = (e: IpcMainInvokeEvent, action = false) => {
      const s = [this.active, this.preparing].find((s) => s && e.sender === s.view.webContents);
      if (
        !s ||
        !options.registry.usable(this.region(), s) ||
        this.disposed ||
        e.senderFrame !== e.sender.mainFrame ||
        e.sender.getURL() !== s.url ||
        (action && (s !== this.active || !s.ready || !this.visible()))
      )
        throw Error('Notification session is not bound');
      return s;
    };
    ipcMain.handle(this.channel('connect'), (e) => {
      const s = bound(e);
      return { sessionId: s.session, providerAppletId: s.provider, snapshot: this.model(s) };
    });
    ipcMain.handle(this.channel('ready'), (e, session) => {
      const s = bound(e);
      if (s.session !== session) throw Error('Stale notification session');
      if (s.ready) return;
      if (options.registry.resolve(this.region()).provider?.id !== s.provider)
        throw Error('Superseded notification session');
      s.ready = true;
      clearTimeout(s.timer);
      if (s === this.preparing) {
        const old = this.active;
        this.active = s;
        this.preparing = undefined;
        this.close(old);
      }
      this.refresh();
    });
    ipcMain.handle(this.channel('act'), async (e, request) => {
      bound(e, true);
      try {
        await options.controller.act(request);
      } finally {
        this.refresh();
      }
    });
    ipcMain.handle(this.channel('resize'), (e, height) => {
      const s = bound(e);
      if (!Number.isFinite(height) || height < 1 || height > 6000)
        throw Error('Invalid banner height');
      s.height = Math.ceil(height);
      this.layout();
    });
    ipcMain.handle(this.channel('focusHost'), (e) => {
      bound(e, true);
      if (options.focusHost) {
        options.focusHost();
        return;
      }
      options.window.webContents.focus();
    });
    ipcMain.handle(this.channel('getSettings'), (e) => options.settings(bound(e).provider));
    ipcMain.handle(this.channel('executeCommand'), (e, id) =>
      options.execute(bound(e, true).provider, id),
    );
    ipcMain.handle(this.channel('openCenter'), (e) => {
      bound(e, true);
      if (!options.openCenter) throw Error('Notification center unavailable');
      return options.openCenter();
    });
    this.stop = options.controller.subscribe(() => {
      if (!this.queued) {
        this.queued = true;
        queueMicrotask(() => {
          this.queued = false;
          this.refresh();
        });
      }
    });
    options.window.on('resize', () => this.refresh());
    options.window.on('show', () => this.refresh());
    options.window.on('hide', () => this.refresh());
    options.window.on('minimize', () => this.refresh());
    options.window.on('restore', () => this.refresh());
    options.window.once('closed', () => this.dispose());
  }
  private channel(name: string) {
    return 'notification-' + this.options.controller.target + ':' + name;
  }
  private region(): 'notification.banner' | 'notification.desktop' {
    return this.options.controller.target === 'desktop'
      ? 'notification.desktop'
      : 'notification.banner';
  }
  private candidate() {
    return this.options.registry.resolve(this.region()).provider;
  }
  private viewport() {
    if (this.options.viewport) return this.options.viewport();
    const zoom = this.options.window.webContents.getZoomFactor();
    const [width, height] = this.options.window.getContentSize();
    return {
      width: Math.max(1, Math.min(680, width / zoom - 32)),
      maxHeight: Math.max(1, Math.min(height / zoom - 80, Math.max(80, (height / zoom) * 0.4))),
    };
  }
  private model(s: Surface): NotificationBannerModel {
    return this.options.controller.snapshot(s.session, this.viewport());
  }
  private visible() {
    const w = this.options.window;
    return (
      !w.isDestroyed() &&
      (this.options.visible ? this.options.visible() : w.isVisible() && !w.isMinimized()) &&
      this.options.ready() &&
      this.options.controller.items().length > 0
    );
  }
  private prepare(p: ShellProvider) {
    try {
      const { view, url } = createShellView(
        p.folder,
        shellView(p.shell, this.region())!,
        this.options.preload,
        ['--appdock-notification-surface=' + this.options.controller.target],
      );
      view.setBackgroundColor('#00000000');
      const s: Surface = {
        view,
        url,
        session: randomUUID(),
        provider: p.id,
        version: p.version,
        generation: p.generation,
        ready: false,
        height: 114,
        signature: '',
        settingsSignature: '',
        timer: setTimeout(() => this.fail(s, 'ready timeout'), 10000),
      };
      this.preparing = s;
      this.options.window.contentView.addChildView(view);
      view.webContents.on('render-process-gone', () => this.fail(s, 'renderer exited'));
      view.webContents.on('unresponsive', () => this.fail(s, 'renderer unresponsive'));
      void view.webContents.loadURL(url).catch(() => this.fail(s, 'load failed'));
    } catch {
      this.options.registry.fail(this.region(), p.id, p.version);
      this.options.failed(
        hostText('services.notificationSurfaceHost.loadFailed', { provider: p.id }),
        false,
      );
      queueMicrotask(() => this.refresh());
    }
  }
  private fail(s: Surface, reason: string) {
    if (this.disposed || (s !== this.active && s !== this.preparing)) return;
    this.options.registry.fail(this.region(), s.provider, s.version);
    if (s === this.active) this.active = undefined;
    if (s === this.preparing) this.preparing = undefined;
    this.close(s);
    this.options.failed(s.provider + ': ' + reason, false);
    this.refresh();
  }
  private close(s?: Surface) {
    if (!s) return;
    clearTimeout(s.timer);
    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(s.view);
    if (!s.view.webContents.isDestroyed()) {
      if (s.view.webContents.isFocused() && this.options.window.isFocused())
        this.options.window.webContents.focus();
      s.view.webContents.close();
    }
  }
  refresh() {
    if (this.disposed || this.refreshing || this.options.window.isDestroyed()) return;
    this.refreshing = true;
    try {
      // Stop/disable invalidates actions even when a retained surface is hidden or empty.
      for (const s of [this.active, this.preparing])
        if (s && !this.options.registry.usable(this.region(), s)) {
          if (s === this.active) this.active = undefined;
          if (s === this.preparing) this.preparing = undefined;
          this.close(s);
        }
      const ids = this.options.controller.items().map((i) => i.id);
      if (!this.options.ready() || !ids.length) {
        for (const s of [this.active, this.preparing]) {
          if (s) s.view.webContents.send(this.channel('changed'), this.model(s));
        }
        this.layout();
        return;
      }
      const p = this.candidate();
      if (!p) {
        this.close(this.preparing);
        this.preparing = undefined;
        this.close(this.active);
        this.active = undefined;
        this.options.controller.delivery(ids, 'failed');
        if (!this.unavailable) {
          this.unavailable = true;
          this.options.failed(hostText('services.notificationSurfaceHost.startFailed'), true);
        }
        return;
      }
      this.unavailable = false;
      if (
        this.preparing &&
        (this.preparing.provider !== p.id || this.preparing.version !== p.version)
      ) {
        this.close(this.preparing);
        this.preparing = undefined;
      }
      if (
        (!this.active || this.active.provider !== p.id || this.active.version !== p.version) &&
        !this.preparing
      )
        this.prepare(p);
      for (const s of [this.active, this.preparing]) {
        if (!s) continue;
        const signature = JSON.stringify(this.model(s));
        if (signature !== s.signature) {
          s.signature = signature;
          s.view.webContents.send(this.channel('changed'), this.model(s));
        }
        const settings = JSON.stringify(this.options.settings(s.provider));
        if (settings !== s.settingsSignature) {
          s.settingsSignature = settings;
          s.view.webContents.send(this.channel('settingsChanged'));
        }
      }
      this.layout();
    } finally {
      this.refreshing = false;
    }
  }
  layout() {
    if (this.disposed || this.options.window.isDestroyed()) return;
    this.options.registry.touch();
    const s = this.active;
    const visible = !!s?.ready && this.visible();
    s?.view.setVisible(visible);
    if (this.options.arrange) this.options.arrange(s?.view, s?.height ?? 114, visible);
    else if (s && visible) {
      const viewport = this.viewport(),
        zoom = this.options.window.webContents.getZoomFactor();
      const [width] = this.options.window.getContentSize();
      s.view.webContents.setZoomFactor(zoom);
      s.view.setBounds({
        x: Math.max(0, Math.round((width - viewport.width * zoom) / 2)),
        y: Math.round(48 * zoom),
        width: Math.max(1, Math.round(viewport.width * zoom)),
        height: Math.max(1, Math.round(Math.min(s.height, viewport.maxHeight) * zoom)),
      });
      this.options.window.contentView.addChildView(s.view);
      this.options.layer();
    }
    const ids = this.options.controller.items().map((i) => i.id);
    this.options.controller.delivery(ids, visible ? 'showing' : 'hidden');
  }
  retry() {
    this.options.registry.retry(this.region());
    this.unavailable = false;
    this.refresh();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.close(this.preparing);
    this.close(this.active);
    this.preparing = this.active = undefined;
    this.options.registry.touch();
    for (const channel of [
      'connect',
      'ready',
      'act',
      'resize',
      'focusHost',
      'getSettings',
      'executeCommand',
      'openCenter',
    ])
      ipcMain.removeHandler(this.channel(channel));
  }
}

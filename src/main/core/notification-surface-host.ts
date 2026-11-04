import { hostText } from '../../shared/i18n';
import {
  ipcMain,
  type BrowserWindow,
  type WebContentsView,
  type IpcMainInvokeEvent,
} from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  NotificationBannerModel,
  NotificationBannerPosition,
} from '../../shared/notifications';
import { bannerNotificationBounds } from './notification-banner-layout';
import type { NotificationSurfaceController } from './notification-surface-controller';
import { createLocalView } from './local-view';
type Surface = {
  view: WebContentsView;
  url: string;
  session: string;
  ready: boolean;
  height: number;
  timer: ReturnType<typeof setTimeout>;
  signature: string;
};
/** Shared host notification surface; the service owns content, operations and deadlines. */
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
      uiFolder: string;
      controller: NotificationSurfaceController;
      ready(): boolean;
      layer(): void;
      visible?(): boolean;
      viewport?(): NotificationBannerModel['viewport'];
      position?(): NotificationBannerPosition;
      arrange?(view: WebContentsView | undefined, height: number, visible: boolean): void;
      focusHost?(): void;
      openCenter?(): Promise<void>;
      failed(message: string, unavailable: boolean): void;
    },
  ) {
    const bound = (e: IpcMainInvokeEvent, action = false) => {
      const s = [this.active, this.preparing].find((s) => s && e.sender === s.view.webContents);
      if (
        !s ||
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
      return { sessionId: s.session, snapshot: this.model(s) };
    });
    ipcMain.handle(this.channel('ready'), (e, session) => {
      const s = bound(e);
      if (s.session !== session) throw Error('Stale notification session');
      if (s.ready) return;
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
  private prepare() {
    try {
      const { view, url } = createLocalView(
        this.options.uiFolder,
        'notifications.html',
        this.options.preload,
        ['--appdock-notification-surface=' + this.options.controller.target],
      );
      view.setBackgroundColor('#00000000');
      const s: Surface = {
        view,
        url,
        session: randomUUID(),
        ready: false,
        height: 114,
        signature: '',
        timer: setTimeout(() => this.fail(s, 'ready timeout'), 10000),
      };
      this.preparing = s;
      this.options.window.contentView.addChildView(view);
      view.webContents.on('render-process-gone', () => this.fail(s, 'renderer exited'));
      view.webContents.on('unresponsive', () => this.fail(s, 'renderer unresponsive'));
      void view.webContents.loadURL(url).catch(() => this.fail(s, 'load failed'));
    } catch {
      this.unavailable = true;
      this.options.failed(hostText('services.notificationSurfaceHost.startFailed'), true);
    }
  }
  private fail(s: Surface, reason: string) {
    if (this.disposed || (s !== this.active && s !== this.preparing)) return;
    if (s === this.active) this.active = undefined;
    if (s === this.preparing) this.preparing = undefined;
    this.close(s);
    this.unavailable = true;
    this.options.failed(reason, true);
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
      const ids = this.options.controller.items().map((i) => i.id);
      if (!this.options.ready() || !ids.length) {
        for (const s of [this.active, this.preparing]) {
          if (s) s.view.webContents.send(this.channel('changed'), this.model(s));
        }
        this.layout();
        return;
      }
      if (this.unavailable) {
        this.options.controller.delivery(ids, 'failed');
        return;
      }
      if (!this.active && !this.preparing) this.prepare();
      for (const s of [this.active, this.preparing]) {
        if (!s) continue;
        const signature = JSON.stringify(this.model(s));
        if (signature !== s.signature) {
          s.signature = signature;
          s.view.webContents.send(this.channel('changed'), this.model(s));
        }
      }
      this.layout();
    } finally {
      this.refreshing = false;
    }
  }
  layout() {
    if (this.disposed || this.options.window.isDestroyed()) return;
    const s = this.active;
    const visible = !!s?.ready && this.visible();
    s?.view.setVisible(visible);
    if (this.options.arrange) this.options.arrange(s?.view, s?.height ?? 114, visible);
    else if (s && visible) {
      const viewport = this.viewport(),
        zoom = this.options.window.webContents.getZoomFactor();
      const [width, height] = this.options.window.getContentSize();
      s.view.webContents.setZoomFactor(zoom);
      s.view.setBounds(
        bannerNotificationBounds(
          { width, height },
          viewport,
          s.height,
          zoom,
          this.options.position?.() ?? 'top-center',
        ),
      );
      this.options.window.contentView.addChildView(s.view);
      this.options.layer();
    }
    const ids = this.options.controller.items().map((i) => i.id);
    this.options.controller.delivery(ids, visible ? 'showing' : 'hidden');
  }
  retry() {
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
    for (const channel of ['connect', 'ready', 'act', 'resize', 'focusHost', 'openCenter'])
      ipcMain.removeHandler(this.channel(channel));
  }
}

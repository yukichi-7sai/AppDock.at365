import { hostText } from '../../shared/i18n';
import { BrowserWindow, screen, type Rectangle, type Tray } from 'electron';
import { NotificationSurfaceHost } from './notification-surface-host';
import { NotificationSurfaceController } from './notification-surface-controller';
import { NotificationService } from './notification-service';
import type { NotificationAvailability } from './notification-availability';
import { desktopNotificationBounds } from './notification-desktop-layout';
import { displayZoomFactor, registerDisplayZoom } from './display-zoom-host';
/** One lazy independent presentation window; all content and deadlines remain in the service. */
export class NotificationDesktopHost {
  private window?: BrowserWindow;
  private host?: NotificationSurfaceHost;
  private stopAvailability: () => void;
  private stop: () => void;
  private disposed = false;
  private queued = false;
  private deliveryIds = new Set<string>();
  private refreshDisplay = () => this.refresh();
  constructor(
    private options: {
      service: NotificationService;
      parent: BrowserWindow;
      availability: NotificationAvailability;
      preload: string;
      uiFolder: string;
      dark(): boolean;
      tray(): Tray | undefined;
      ready(): boolean;
      openCenter(): Promise<void>;
      failed(message: string): void;
    },
  ) {
    this.stopAvailability = options.availability.subscribe(() => this.refresh());
    this.stop = options.service.subscribe(() => {
      if (!this.queued) {
        this.queued = true;
        queueMicrotask(() => {
          this.queued = false;
          this.refresh();
        });
      }
    });
    screen.on('display-added', this.refreshDisplay);
    screen.on('display-removed', this.refreshDisplay);
    screen.on('display-metrics-changed', this.refreshDisplay);
    options.parent.on('enter-full-screen', this.refreshDisplay);
    options.parent.on('leave-full-screen', this.refreshDisplay);
  }
  private display() {
    let tray: Rectangle | undefined;
    try {
      tray = this.options.tray()?.getBounds();
    } catch {}
    const display =
      tray && tray.width > 0 && tray.height > 0
        ? screen.getDisplayMatching(tray)
        : screen.getDisplayMatching(this.options.parent.getBounds());
    return { work: display.workArea, tray };
  }
  private viewport() {
    const { work, tray } = this.display();
    const zoom = displayZoomFactor();
    const bounds = desktopNotificationBounds(work, tray, 600, zoom);
    return { width: bounds.width / zoom, maxHeight: bounds.height / zoom };
  }
  refresh() {
    if (this.disposed) return;
    const items = this.options.ready() ? this.options.service.targetItems('desktop') : [];
    if (!items.length) {
      this.deliveryIds.clear();
      this.options.availability.use('desktop', false);
      this.host?.dispose();
      this.host = undefined;
      this.window?.destroy();
      this.window = undefined;
      return;
    }
    const newDelivery = items.some((item) => !this.deliveryIds.has(item.id));
    this.deliveryIds = new Set(items.map((item) => item.id));
    this.options.availability.use('desktop', true);
    if (newDelivery) this.options.availability.prepareDelivery();
    if (!this.window) {
      const window = new BrowserWindow({
        title: hostText('services.notificationDesktopHost.title'),
        width: 440,
        height: 114,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      this.window = window;
      registerDisplayZoom(window.webContents);
      window.setMenu(null);
      this.host = new NotificationSurfaceHost({
        window,
        preload: this.options.preload,
        uiFolder: this.options.uiFolder,
        controller: new NotificationSurfaceController(
          this.options.service,
          this.options.dark,
          'desktop',
        ),
        ready: this.options.ready,
        layer: () => {},
        failed: (message) => this.options.failed(message),
        openCenter: this.options.openCenter,
        focusHost: () => window.blur(),
        visible: () => this.options.availability.status() === 'allowed',
        viewport: () => this.viewport(),
        arrange: (view, height, visible) => {
          if (!visible) {
            window.hide();
            return;
          }
          const { work, tray } = this.display();
          const zoom = displayZoomFactor();
          const bounds = desktopNotificationBounds(work, tray, height, zoom);
          if (JSON.stringify(window.getBounds()) !== JSON.stringify(bounds))
            window.setBounds(bounds, false);
          view?.webContents.setZoomFactor(zoom);
          view?.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
          if (!window.isVisible()) window.showInactive();
        },
      });
    }
    this.host?.refresh();
  }
  retry() {
    this.options.availability.retry();
    this.host?.retry();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.stopAvailability();
    this.options.availability.use('desktop', false);
    this.host?.dispose();
    this.window?.destroy();

    screen.removeListener('display-added', this.refreshDisplay);
    screen.removeListener('display-removed', this.refreshDisplay);
    screen.removeListener('display-metrics-changed', this.refreshDisplay);
    this.options.parent.removeListener('enter-full-screen', this.refreshDisplay);
    this.options.parent.removeListener('leave-full-screen', this.refreshDisplay);
  }
}

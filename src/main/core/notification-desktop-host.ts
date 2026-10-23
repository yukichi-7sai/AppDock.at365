import { hostText } from '../../shared/i18n';
import type { ShellProviderRegistry, ShellProvider } from './shell-provider-registry';
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
  private refreshDisplay = () => this.refresh();
  constructor(
    private options: {
      service: NotificationService;
      parent: BrowserWindow;
      availability: NotificationAvailability;
      preload: string;
      dark(): boolean;
      tray(): Tray | undefined;
      providers(): ShellProvider[];
      registry: ShellProviderRegistry;
      ready(): boolean;
      settings(provider: string): Record<string, unknown>;
      execute(provider: string, command: string): Promise<unknown>;
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
    if (!this.options.ready() || !this.options.service.targetItems('desktop').length) {
      this.options.availability.use('desktop', false);
      this.host?.dispose();
      this.host = undefined;
      this.window?.destroy();
      this.window = undefined;
      return;
    }
    this.options.availability.use('desktop', true);
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
        controller: new NotificationSurfaceController(
          this.options.service,
          this.options.dark,
          'desktop',
        ),
        providers: this.options.providers,
        registry: this.options.registry,
        ready: this.options.ready,
        settings: this.options.settings,
        execute: this.options.execute,
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
    this.options.registry.retry('notification.desktop');
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

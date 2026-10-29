import {
  BrowserWindow,
  ipcMain,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { appearanceArguments, registerAppearance } from './appearance-host';
import { hostText } from '../../shared/i18n';
import type { GestureIndicatorFrame, GestureIndicatorModel } from '../../shared/gesture-indicator';

export class GestureIndicatorHost {
  private window?: BrowserWindow;
  private ready = false;
  private sequence = 0;
  private model: GestureIndicatorModel | null = null;
  private releaseReady?: () => void;
  constructor(
    private options: {
      url: string;
      preload: string;
      failed(message: string): void;
    },
  ) {
    ipcMain.handle('gesture-indicator:connect', this.connect);
    ipcMain.on('gesture-indicator:measured', this.measured);
  }
  available = () => this.ready && !!this.window && !this.window.isDestroyed();
  private authorized(event: IpcMainEvent | IpcMainInvokeEvent) {
    return (
      !!this.window &&
      !this.window.isDestroyed() &&
      event.sender === this.window.webContents &&
      event.senderFrame === event.sender.mainFrame &&
      event.sender.getURL() === this.options.url
    );
  }
  private frame = (): GestureIndicatorFrame => ({ sequence: this.sequence, model: this.model });
  private connect = (event: IpcMainInvokeEvent) => {
    if (!this.authorized(event))
      throw Error(hostText('services.appearanceHost.unauthorizedSurface'));
    this.ready = true;
    this.releaseReady?.();
    return this.frame();
  };
  private measured = (
    event: IpcMainEvent,
    value: { sequence: number; width: number; height: number },
  ) => {
    if (
      !this.authorized(event) ||
      !this.available() ||
      !this.model ||
      !value ||
      value.sequence !== this.sequence ||
      !Number.isInteger(value.width) ||
      !Number.isInteger(value.height) ||
      value.width < 1 ||
      value.width > 1024 ||
      value.height < 1 ||
      value.height > 1024
    )
      return;
    const center = screen.screenToDipPoint({ x: this.model.x, y: this.model.y });
    const bounds = screen.getDisplayNearestPoint(center).bounds;
    const width = Math.min(value.width, bounds.width),
      height = Math.min(value.height, bounds.height);
    const x = Math.max(
      bounds.x,
      Math.min(bounds.x + bounds.width - width, Math.round(center.x - width / 2)),
    );
    const y = Math.max(
      bounds.y,
      Math.min(bounds.y + bounds.height - height, Math.round(center.y - height / 2)),
    );
    const next = { x, y, width, height };
    if (JSON.stringify(this.window!.getBounds()) !== JSON.stringify(next))
      this.window!.setBounds(next, false);
    if (!this.window!.isVisible()) {
      this.window!.showInactive();
      this.window!.setAlwaysOnTop(true, 'pop-up-menu');
    }
  };
  async initialize() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = new Promise<void>((resolve) => {
        this.releaseReady = resolve;
      });
      const window = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        focusable: false,
        type: 'toolbar',
        skipTaskbar: true,
        alwaysOnTop: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        webPreferences: {
          preload: this.options.preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
          partition: 'gesture-indicator',
          additionalArguments: appearanceArguments(),
        },
      });
      this.window = window;
      window.webContents.setZoomMode('isolated');
      window.webContents.setZoomFactor(1);
      window.setIgnoreMouseEvents(true);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== this.options.url) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      window.webContents.on('render-process-gone', () => this.fail());
      window.on('closed', () => {
        this.ready = false;
        this.window = undefined;
      });
      registerAppearance(window.webContents, this.options.url);
      await Promise.race([
        (async () => {
          await window.loadURL(this.options.url);
          await ready;
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(Error('renderer readiness timeout')), 3000);
        }),
      ]);
    } catch {
      this.fail();
    } finally {
      if (timer) clearTimeout(timer);
      this.releaseReady = undefined;
    }
  }
  show = (model: GestureIndicatorModel) => {
    if (!this.available()) return;
    this.model = model;
    this.sequence++;
    this.window!.webContents.send('gesture-indicator:changed', this.frame());
  };
  hide = () => {
    this.model = null;
    this.sequence++;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
    if (this.ready) this.window.webContents.send('gesture-indicator:changed', this.frame());
  };
  private fail() {
    const active = !!this.window;
    this.ready = false;
    this.model = null;
    this.sequence++;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
    this.releaseReady?.();
    if (active) this.options.failed(hostText('services.gestures.webIndicatorUnavailable'));
  }
  dispose() {
    this.hide();
    this.ready = false;
    this.window?.destroy();
    this.window = undefined;
    ipcMain.removeHandler('gesture-indicator:connect');
    ipcMain.removeListener('gesture-indicator:measured', this.measured);
  }
}

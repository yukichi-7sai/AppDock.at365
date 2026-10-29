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
  private size?: { width: number; height: number };
  private placement?: {
    x: number;
    y: number;
    width: number;
    height: number;
    display: number;
    scale: number;
  };
  private followCursor = false;
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
    ipcMain.on('gesture-indicator:follow', this.follow);
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
  private frame = (): GestureIndicatorFrame => ({
    sequence: this.sequence,
    model: this.model,
    followCursor: !!this.model && this.followCursor,
  });
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
    this.size = { width: value.width, height: value.height };
    this.position();
    if (!this.window!.isVisible()) {
      this.window!.showInactive();
      this.window!.setAlwaysOnTop(true, 'pop-up-menu');
    }
  };
  private follow = (event: IpcMainEvent, sequence: number) => {
    if (
      this.authorized(event) &&
      this.available() &&
      this.followCursor &&
      this.model &&
      this.size &&
      sequence === this.sequence &&
      this.window!.isVisible()
    )
      this.position();
  };
  private position() {
    if (!this.available() || !this.model || !this.size) return;
    // Cursor coordinates already use DIP, including across displays with different scales.
    const anchor = this.followCursor
      ? screen.getCursorScreenPoint()
      : screen.screenToDipPoint({ x: this.model.x, y: this.model.y });
    const display = screen.getDisplayNearestPoint(anchor);
    const bounds = display.bounds;
    const width = Math.min(this.size.width, bounds.width),
      height = Math.min(this.size.height, bounds.height);
    const x = Math.max(
      bounds.x,
      Math.min(
        bounds.x + bounds.width - width,
        Math.round(anchor.x + (this.followCursor ? 16 : -width / 2)),
      ),
    );
    const y = Math.max(
      bounds.y,
      Math.min(
        bounds.y + bounds.height - height,
        Math.round(anchor.y + (this.followCursor ? 16 : -height / 2)),
      ),
    );
    const previous = this.placement;
    const changed =
      !previous ||
      previous.x !== x ||
      previous.y !== y ||
      previous.width !== width ||
      previous.height !== height ||
      previous.display !== display.id ||
      previous.scale !== display.scaleFactor;
    // Keep the measured DIP size rather than round-tripping Windows' rounded bounds.
    if (changed) this.window!.setBounds({ x, y, width, height }, false);
    this.placement = { x, y, width, height, display: display.id, scale: display.scaleFactor };
  }
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
        this.size = undefined;
        this.placement = undefined;
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
  show = (model: GestureIndicatorModel, followCursor = false) => {
    if (!this.available()) return;
    this.followCursor = followCursor;
    this.model = model;
    this.sequence++;
    this.window!.webContents.send('gesture-indicator:changed', this.frame());
  };
  hide = () => {
    this.size = undefined;
    this.placement = undefined;
    this.model = null;
    this.sequence++;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
    if (this.ready) this.window.webContents.send('gesture-indicator:changed', this.frame());
  };
  private fail() {
    this.size = undefined;
    this.placement = undefined;
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
    ipcMain.removeListener('gesture-indicator:follow', this.follow);
  }
}

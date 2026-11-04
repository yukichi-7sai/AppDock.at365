import { hostText } from '../../shared/i18n';
import { themeColors } from './theme-source';
import {
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContentsView,
} from 'electron';
import { randomUUID } from 'node:crypto';
import type { WindowBarRegion } from '../../shared/window-bars';

import type { WindowBars } from './window-bars';
import { createLocalView } from './local-view';

type Binding = {
  session: string;
  view: WebContentsView;
  url: string;

  ready: boolean;
  revision: number;
  timer: ReturnType<typeof setTimeout>;
};
type Bar = {
  region: WindowBarRegion;
  bounds: Electron.Rectangle | null;
  active?: Binding;
  pending?: Binding;
  unavailable?: boolean;
};
/** Two host-owned nonmodal surfaces; services own their content and actions. */
export class WindowBarHost {
  private bars: Bar[] = ['titlebar', 'statusbar'].map((region) => ({
    region: region as WindowBarRegion,
    bounds: null,
  }));
  private disposed = false;
  constructor(
    private options: {
      window: BrowserWindow;
      preload: string;
      uiFolder: string;
      changed(): void;

      content: WindowBars;
      ready(): boolean;
      enabled(region: WindowBarRegion): boolean;
      blocked(): boolean;
      shortcut(key: string): Promise<unknown>;
      layer(): void;
      failed(region: WindowBarRegion, message: string, unavailable: boolean): void;
    },
  ) {
    const bound = (event: IpcMainInvokeEvent, active = false) => {
      const bar = this.bars.find((bar) =>
        [bar.active, bar.pending].some((b) => b?.view.webContents === event.sender),
      );
      const binding =
        bar && [bar.active, bar.pending].find((b) => b?.view.webContents === event.sender);
      if (
        !bar ||
        !binding ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.getURL() !== binding.url ||
        (active && (binding !== bar.active || !this.visible(bar) || options.blocked()))
      )
        throw Error('Window bar session is not bound');
      return { bar, binding };
    };
    ipcMain.handle('window-bar:connect', (event) => {
      const { bar, binding } = bound(event);
      const snapshot = options.content.snapshot(bar.region);
      binding.revision = snapshot.revision;
      return { sessionId: binding.session, snapshot };
    });
    ipcMain.handle('window-bar:ready', (event, session) => {
      const { bar, binding } = bound(event);
      if (binding.session !== session) throw Error('Stale window bar session');
      if (binding === bar.active) return;
      clearTimeout(binding.timer);
      binding.ready = true;
      const old = bar.active;
      const focused =
        old && !old.view.webContents.isDestroyed() && old.view.webContents.isFocused();
      bar.active = binding;
      bar.pending = undefined;
      if (old) this.close(old);
      this.layout(bar);
      options.changed();
      if (focused) this.focus(bar.region, 'first');
    });
    ipcMain.handle('window-bar:invoke', (event, request) => {
      const { bar, binding } = bound(event, true);
      return options.content.invoke(bar.region, binding.session, request);
    });
    ipcMain.handle('window-bar:shortcut', (event, key) => {
      bound(event, true);
      return options.shortcut(key);
    });
    ipcMain.handle('window-bar:focusHost', (event, edge) => {
      const { bar } = bound(event, true);
      if (!['before', 'after'].includes(edge)) throw Error('Invalid focus edge');
      options.window.webContents.focus();
      options.window.webContents.send('dock:barFocusHost', bar.region, edge);
    });
    const layout = () => this.bars.forEach((bar) => this.layout(bar));
    options.window.on('show', layout);
    options.window.on('hide', layout);
    options.window.on('minimize', layout);
    options.window.on('restore', layout);
    const reset = () => {
      for (const bar of this.bars) {
        bar.bounds = null;
        this.layout(bar);
      }
    };
    options.window.webContents.on('did-start-loading', reset);
    options.window.webContents.on('render-process-gone', reset);
    options.window.once('closed', () => this.dispose());
  }
  get isReady() {
    return this.bars.every((bar) => !!bar.active?.ready);
  }
  private visible(bar: Bar) {
    const w = this.options.window;
    return (
      this.options.enabled(bar.region) &&
      !!bar.active?.ready &&
      !!bar.bounds &&
      !w.isDestroyed() &&
      w.isVisible() &&
      !w.isMinimized()
    );
  }
  viewport(region: WindowBarRegion, bounds: Electron.Rectangle | null) {
    const bar = this.bars.find((bar) => bar.region === region);
    if (
      !bar ||
      (bounds !== null &&
        (!bounds ||
          ['x', 'y', 'width', 'height'].some((k) => {
            const value = bounds[k as keyof Electron.Rectangle];
            return (
              !Number.isFinite(value) ||
              Math.abs(value) > 100000 ||
              ((k === 'width' || k === 'height') && value < 1)
            );
          })))
    )
      throw Error('Invalid window bar viewport');
    bar.bounds = bounds;
    this.refresh();
  }
  focus(region: WindowBarRegion, edge: 'first' | 'last') {
    const bar = this.bars.find((bar) => bar.region === region);
    if (!bar || !['first', 'last'].includes(edge) || !this.visible(bar) || this.options.blocked())
      return;
    bar.active!.view.webContents.focus();
    bar.active!.view.webContents.send('window-bar:focus', edge);
  }
  private layout(bar: Bar) {
    const w = this.options.window,
      b = bar.active;
    if (!b || w.isDestroyed()) return;
    if (bar.bounds) {
      const zoom = w.webContents.getZoomFactor(),
        [width, height] = w.getContentSize();
      const x = Math.max(0, Math.min(width - 1, Math.round(bar.bounds.x * zoom)));
      const y = Math.max(0, Math.min(height - 1, Math.round(bar.bounds.y * zoom)));
      b.view.setBounds({
        x,
        y,
        width: Math.max(1, Math.min(width - x, Math.round(bar.bounds.width * zoom))),
        height: Math.max(1, Math.min(height - y, Math.round(bar.bounds.height * zoom))),
      });
      b.view.webContents.setZoomFactor(zoom);
    }
    const visible = this.visible(bar);
    if (!visible && b.view.webContents.isFocused()) w.webContents.focus();
    b.view.setVisible(visible);
    this.options.layer();
  }
  refresh() {
    if (this.disposed || !this.options.ready()) return;
    for (const bar of this.bars) {
      if (!bar.active && !bar.pending && !bar.unavailable) this.open(bar);
      const model = this.options.content.snapshot(bar.region);
      for (const b of [bar.active, bar.pending])
        if (b && !b.view.webContents.isDestroyed()) {
          b.view.setBackgroundColor(themeColors(model.dark).rail);
          if (b.revision !== model.revision) {
            b.revision = model.revision;
            b.view.webContents.send('window-bar:changed', model);
          }
        }
      this.layout(bar);
    }
  }
  private open(bar: Bar) {
    try {
      const { view, url } = createLocalView(
        this.options.uiFolder,
        'bars.html',
        this.options.preload,
      );
      const b: Binding = {
        session: randomUUID(),
        view,
        url,

        ready: false,
        revision: 0,
        timer: setTimeout(() => this.fail(bar, b, 'ready timeout'), 10000),
      };
      bar.pending = b;
      this.options.window.contentView.addChildView(view);
      view.webContents.on('render-process-gone', () => this.fail(bar, b, 'renderer exited'));
      view.webContents.on('unresponsive', () => this.fail(bar, b, 'renderer unresponsive'));
      void view.webContents.loadURL(url).catch(() => this.fail(bar, b, 'load failed'));
      return true;
    } catch {
      bar.unavailable = true;
      this.options.failed(bar.region, hostText('services.windowBarHost.loadFailed'), true);
      return false;
    }
  }
  private fail(bar: Bar, b: Binding, reason: string) {
    if (this.disposed || (bar.active !== b && bar.pending !== b)) return;
    if (bar.active === b) bar.active = undefined;
    if (bar.pending === b) bar.pending = undefined;
    this.close(b);
    bar.unavailable = true;
    this.options.failed(bar.region, reason, true);
    this.refresh();
  }
  private close(b: Binding) {
    clearTimeout(b.timer);
    this.options.content.disconnect(b.session);

    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(b.view);
    if (!b.view.webContents.isDestroyed()) b.view.webContents.close();
  }
  retry(region?: WindowBarRegion) {
    for (const bar of this.bars)
      if (!region || region === bar.region) {
        bar.unavailable = false;
      }
    this.refresh();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const bar of this.bars) {
      for (const b of [bar.active, bar.pending]) if (b) this.close(b);
      bar.active = bar.pending = undefined;
    }
    for (const method of ['connect', 'ready', 'invoke', 'shortcut', 'focusHost'])
      ipcMain.removeHandler('window-bar:' + method);
  }
}

import { hostText } from '../../shared/i18n';
import { WebContentsView, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { createLocalView } from './local-view';
import type { UiPresentation } from './ui-presentation';

type Binding = {
  session: string;
  view: WebContentsView;

  url: string;
  ready: boolean;
  revision: number;
  timer: ReturnType<typeof setTimeout>;
};
/** Owns surfaces, never imports a host renderer. Only packaged host documents are loaded. */
export class RibbonHost {
  private active?: Binding;
  private pending?: Binding;
  private failed = false;
  private bounds: Electron.Rectangle | null = null;
  private error: string | null = null;
  private disposed = false;
  constructor(
    private options: {
      window: BrowserWindow;
      layer?(): void;

      preload: string;
      uiFolder: string;
      ui: UiPresentation;
      ready(): boolean;
      changed(): void;
      log(message: string): void;
      failed(message: string, retry: () => void): void;
      shortcut(input: Electron.Input): boolean;
      openGroup?(
        id: string,
        anchor: import('../../shared/ribbon').RibbonAnchor,
        viewport: import('../../shared/ribbon').RibbonAnchor,
      ): void;
      invalidateAnchor?(): void;
      pointer?(inside: boolean): void;
      hoverChanged?(): void;
    },
  ) {
    const binding = (event: IpcMainInvokeEvent) => {
      const result = [this.active, this.pending].find((b) => b?.view.webContents === event.sender);
      if (
        !result ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.getURL() !== result.url
      )
        throw Error('Ribbon session is not bound');
      return result;
    };
    ipcMain.handle('ribbon:connect', (event) => {
      const b = binding(event);
      const snapshot = options.ui.get();
      b.revision = snapshot.revision;
      return {
        contextId: 'primary',
        sessionId: b.session,
        bindingId: 'primary',
        snapshot,
      };
    });
    ipcMain.handle('ribbon:focusHost', (event, edge) => {
      const b = binding(event);
      if (b !== this.active || !['before', 'after'].includes(edge))
        throw Error('Invalid focus request');
      options.window.webContents.focus();
      options.window.webContents.send('dock:ribbonFocusHost', edge);
    });
    ipcMain.handle('ribbon:get', (event) => {
      binding(event);
      return options.ui.get();
    });
    ipcMain.handle('ribbon:asset', (event, id) => {
      binding(event);
      return options.ui.getAsset(id);
    });
    ipcMain.handle('ribbon:invoke', (event, request) => {
      const b = binding(event);
      if (b !== this.active || !b.ready) throw Error('Ribbon is not active');
      return options.ui.invoke(request, b.session, undefined, {
        openGroup: (id, anchor) => {
          const bounds = this.bounds;
          const zoom = b.view.webContents.getZoomFactor();
          if (
            !bounds ||
            !anchor ||
            !['x', 'y', 'width', 'height'].every((key) =>
              Number.isFinite(anchor[key as keyof typeof anchor]),
            ) ||
            anchor.x < 0 ||
            anchor.y < 0 ||
            anchor.width < 1 ||
            anchor.height < 1 ||
            (anchor.x + anchor.width) * zoom > bounds.width + 1 ||
            (anchor.y + anchor.height) * zoom > bounds.height + 1 ||
            !options.openGroup
          )
            throw Error(hostText('services.ribbonHost.groupPosition'));
          const hostZoom = options.window.webContents.getZoomFactor();
          options.openGroup(
            id,
            {
              x: (bounds.x + anchor.x * zoom) / hostZoom,
              y: (bounds.y + anchor.y * zoom) / hostZoom,
              width: (anchor.width * zoom) / hostZoom,
              height: (anchor.height * zoom) / hostZoom,
            },
            {
              x: bounds.x / hostZoom,
              y: bounds.y / hostZoom,
              width: bounds.width / hostZoom,
              height: bounds.height / hostZoom,
            },
          );
        },
      });
    });
    ipcMain.handle('ribbon:invalidateAnchor', (event) => {
      const b = binding(event);
      if (b === this.active && b.ready) options.invalidateAnchor?.();
    });
    ipcMain.handle('ribbon:ready', (event, session) => {
      const b = binding(event);
      if (session !== b.session) throw Error('Stale Ribbon session');
      if (b === this.active) return;
      clearTimeout(b.timer);
      b.ready = true;
      const old = this.active;
      this.active = b;
      this.pending = undefined;
      this.error = null;
      if (old) this.close(old);
      this.layout();
      options.changed();
    });
    ipcMain.handle('ribbon:dispose', (event, session) => {
      const b = binding(event);
      if (session === b.session) this.fail(b, 'Ribbon session disposed');
    });
    options.window.once('closed', () => this.dispose());
  }
  get isReady() {
    return !!this.active?.ready;
  }
  get hoverBounds() {
    const b = this.active;
    return b?.ready && !b.view.webContents.isDestroyed() && b.view.getVisible()
      ? this.bounds
      : null;
  }
  containsContentPoint(point: { x: number; y: number }) {
    const b = this.hoverBounds;
    return (
      !!b && point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height
    );
  }
  focus(edge: 'first' | 'last') {
    if (!['first', 'last'].includes(edge) || !this.active || !this.bounds) return;
    this.active.view.webContents.focus();
    this.active.view.webContents.send('ribbon:focus', edge);
  }
  viewport(value: Electron.Rectangle | null) {
    if (
      value !== null &&
      (!value ||
        !['x', 'y', 'width', 'height'].every((k) =>
          Number.isFinite(value[k as keyof Electron.Rectangle]),
        ) ||
        value.width < 1 ||
        value.height < 1)
    )
      throw Error('Invalid ribbon bounds');
    const zoom = this.options.window.webContents.getZoomFactor();
    const next = value && {
      x: Math.round(value.x * zoom),
      y: Math.round(value.y * zoom),
      width: Math.round(value.width * zoom),
      height: Math.round(value.height * zoom),
    };
    if (JSON.stringify(next) !== JSON.stringify(this.bounds)) this.options.invalidateAnchor?.();
    this.bounds = next;
    this.layout();
  }
  private layout() {
    if (!this.active) return;
    if (this.bounds) this.active.view.setBounds(this.bounds);
    this.active.view.setVisible(!!this.bounds);
    this.options.hoverChanged?.();
    this.options.layer?.();
  }
  refresh() {
    if (this.disposed || !this.options.ready()) return;
    if (!this.active && !this.pending && !this.failed) {
      try {
        this.open();
      } catch {
        this.recordFailure('Ribbon UI is unavailable');
      }
    }
    const snapshot = this.options.ui.get();
    for (const b of [this.active, this.pending]) {
      if (b && b.revision !== snapshot.revision && !b.view.webContents.isDestroyed()) {
        b.revision = snapshot.revision;
        b.view.webContents.send('ribbon:changed', snapshot);
      }
    }
  }
  retry() {
    this.failed = false;
    this.error = null;
    this.refresh();
  }
  private recordFailure(message: string) {
    if (this.failed) return;
    this.failed = true;
    this.error = message;
    this.options.log(message);
    this.options.failed(message, () => this.retry());
  }
  private open() {
    if (this.pending) this.close(this.pending);
    const { view, url } = createLocalView(
      this.options.uiFolder,
      'index.html',
      this.options.preload,
    );
    const b: Binding = {
      session: randomUUID(),
      view,

      url,
      ready: false,
      revision: 0,
      timer: setTimeout(() => this.fail(b, 'Ribbon ready timeout'), 10000),
    };
    this.pending = b;
    view.setVisible(false);
    this.options.window.contentView.addChildView(view);
    view.webContents.on('render-process-gone', () => this.fail(b, 'host renderer exited'));
    view.webContents.on('unresponsive', () => this.fail(b, 'host renderer is unresponsive'));
    view.webContents.on('before-input-event', (event, input) => {
      if (this.options.shortcut(input)) event.preventDefault();
    });
    view.webContents.on('before-mouse-event', (_event, mouse) => {
      if (b === this.active && this.hoverBounds)
        this.options.pointer?.(mouse.type !== 'mouseLeave');
    });
    void view.webContents.loadURL(b.url).catch(() => this.fail(b, 'Ribbon UI load failed'));
  }
  private close(b: Binding) {
    this.options.invalidateAnchor?.();
    clearTimeout(b.timer);
    this.options.ui.disconnect(b.session);

    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(b.view);
    if (!b.view.webContents.isDestroyed()) b.view.webContents.close();
  }
  private fail(b: Binding, message: string) {
    if (this.disposed || (b !== this.active && b !== this.pending)) return;
    this.recordFailure(message);
    if (b === this.active) this.active = undefined;
    if (b === this.pending) this.pending = undefined;
    this.close(b);
    this.options.changed();
  }
  dispose() {
    this.disposed = true;
    for (const b of [this.active, this.pending]) if (b) this.close(b);
    this.active = this.pending = undefined;
    for (const method of [
      'connect',
      'get',
      'asset',
      'invoke',
      'ready',
      'dispose',
      'focusHost',
      'invalidateAnchor',
    ])
      ipcMain.removeHandler(`ribbon:${method}`);
  }
}

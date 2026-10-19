import {
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContentsView,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { shellView } from '../../shared/shell';
import type { ShellBarRegion } from '../../shared/shell-bars';
import type { ShellProviderRegistry, ShellProvider } from './shell-provider-registry';
import type { HostModalLayer, HostModalRegistration } from './host-modal-layer';
import type { WindowBars } from './window-bars';
import { createShellView } from './shell-view';

type Binding = {
  provider: string;
  version: string;
  generation?: string;
  session: string;
  view: WebContentsView;
  url: string;
  modal: HostModalRegistration;
  ready: boolean;
  revision: number;
  settingsSignature?: string;
  timer: ReturnType<typeof setTimeout>;
};
type Bar = {
  region: ShellBarRegion;
  bounds: Electron.Rectangle | null;
  active?: Binding;
  pending?: Binding;
  unavailable?: boolean;
};
/** Two independently replaceable nonmodal surfaces; services own their content and actions. */
export class ShellBarHost {
  private bars: Bar[] = ['titlebar', 'statusbar'].map((region) => ({
    region: region as ShellBarRegion,
    bounds: null,
  }));
  private disposed = false;
  constructor(
    private options: {
      window: BrowserWindow;
      preload: string;
      registry: ShellProviderRegistry;
      modalLayer: HostModalLayer;
      content: WindowBars;
      ready(): boolean;
      blocked(): boolean;
      settings(provider: string): Record<string, unknown>;
      execute(provider: string, command: string): Promise<unknown>;
      shortcut(key: string): Promise<unknown>;
      layer(): void;
      failed(region: ShellBarRegion, message: string, unavailable: boolean): void;
    },
  ) {
    for (const bar of this.bars)
      options.registry.observe(bar.region, () => ({
        provider: bar.active?.provider ?? null,
        version: bar.active?.version,
        generation: bar.active?.generation,
        session: bar.active?.session,
        ready: !!bar.active?.ready,
        visible: this.visible(bar) && !bar.active?.modal.blocked && !options.blocked(),
        pending: bar.pending?.provider ?? null,
      }));
    const bound = (event: IpcMainInvokeEvent, active = false) => {
      const bar = this.bars.find((bar) =>
        [bar.active, bar.pending].some((b) => b?.view.webContents === event.sender),
      );
      const binding =
        bar && [bar.active, bar.pending].find((b) => b?.view.webContents === event.sender);
      if (
        !bar ||
        !binding ||
        !options.registry.usable(bar.region, binding) ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.getURL() !== binding.url ||
        (active &&
          (binding !== bar.active ||
            !this.visible(bar) ||
            binding.modal.blocked ||
            options.blocked()))
      )
        throw Error('Window bar session is not bound');
      return { bar, binding };
    };
    ipcMain.handle('shell-bar:connect', (event) => {
      const { bar, binding } = bound(event);
      const snapshot = options.content.snapshot(bar.region);
      binding.revision = snapshot.revision;
      return { sessionId: binding.session, providerAppletId: binding.provider, snapshot };
    });
    ipcMain.handle('shell-bar:ready', (event, session) => {
      const { bar, binding } = bound(event);
      if (binding.session !== session) throw Error('Stale window bar session');
      if (binding === bar.active) return;
      if (options.registry.resolve(bar.region).provider?.id !== binding.provider)
        throw Error('Superseded window bar session');
      clearTimeout(binding.timer);
      binding.ready = true;
      const old = bar.active;
      const focused =
        old && !old.view.webContents.isDestroyed() && old.view.webContents.isFocused();
      bar.active = binding;
      bar.pending = undefined;
      if (old) this.close(old);
      this.layout(bar);
      if (focused) this.focus(bar.region, 'first');
    });
    ipcMain.handle('shell-bar:invoke', (event, request) => {
      const { bar, binding } = bound(event, true);
      return options.content.invoke(bar.region, binding.session, request);
    });
    ipcMain.handle('shell-bar:getSettings', (event) =>
      options.settings(bound(event).binding.provider),
    );
    ipcMain.handle('shell-bar:executeCommand', (event, command) =>
      options.execute(bound(event, true).binding.provider, command),
    );
    ipcMain.handle('shell-bar:shortcut', (event, key) => {
      bound(event, true);
      return options.shortcut(key);
    });
    ipcMain.handle('shell-bar:focusHost', (event, edge) => {
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
  private visible(bar: Bar) {
    const w = this.options.window;
    return (
      !!bar.active?.ready && !!bar.bounds && !w.isDestroyed() && w.isVisible() && !w.isMinimized()
    );
  }
  viewport(region: ShellBarRegion, bounds: Electron.Rectangle | null) {
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
  focus(region: ShellBarRegion, edge: 'first' | 'last') {
    const bar = this.bars.find((bar) => bar.region === region);
    if (
      !bar ||
      !['first', 'last'].includes(edge) ||
      !this.visible(bar) ||
      bar.active!.modal.blocked ||
      this.options.blocked()
    )
      return;
    bar.active!.view.webContents.focus();
    bar.active!.view.webContents.send('shell-bar:focus', edge);
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
    b.modal.setVisible(this.visible(bar));
    this.options.registry.touch();
    this.options.layer();
  }
  refresh() {
    if (this.disposed || !this.options.ready()) return;
    for (const bar of this.bars) {
      for (const b of [bar.active, bar.pending])
        if (b && !this.options.registry.usable(bar.region, b)) {
          if (bar.active === b) bar.active = undefined;
          if (bar.pending === b) bar.pending = undefined;
          this.close(b);
        }
      const provider = this.options.registry.resolve(bar.region).provider;
      if (bar.pending && bar.pending.provider !== provider?.id) {
        this.close(bar.pending);
        bar.pending = undefined;
      }
      if (
        provider &&
        provider.id !== bar.active?.provider &&
        !bar.pending &&
        !this.open(bar, provider)
      ) {
        this.refresh();
        return;
      }
      if (!provider && !bar.unavailable) {
        bar.unavailable = true;
        this.options.failed(
          bar.region,
          'Default Shellを利用できません。Shellを再試行してください。',
          true,
        );
      }
      if (provider) bar.unavailable = false;
      const model = this.options.content.snapshot(bar.region);
      for (const b of [bar.active, bar.pending])
        if (b && !b.view.webContents.isDestroyed()) {
          b.view.setBackgroundColor(model.dark ? '#0c0d11' : '#edf0f4');
          if (b.revision !== model.revision) {
            b.revision = model.revision;
            b.view.webContents.send('shell-bar:changed', model);
          }
          const signature = JSON.stringify(this.options.settings(b.provider));
          if (signature !== b.settingsSignature) {
            b.settingsSignature = signature;
            b.view.webContents.send('shell-bar:settingsChanged');
          }
        }
      this.layout(bar);
    }
  }
  private open(bar: Bar, provider: ShellProvider) {
    try {
      const { view, url } = createShellView(
        provider.folder,
        shellView(provider.shell, bar.region)!,
        this.options.preload,
      );
      const b: Binding = {
        provider: provider.id,
        version: provider.version,
        generation: provider.generation,
        session: randomUUID(),
        view,
        url,
        modal: this.options.modalLayer.register(view),
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
      this.options.registry.fail(bar.region, provider.id, provider.version);
      this.options.failed(bar.region, 'Shellの描画ファイルを読み込めません。', false);
      return false;
    }
  }
  private fail(bar: Bar, b: Binding, reason: string) {
    if (this.disposed || (bar.active !== b && bar.pending !== b)) return;
    this.options.registry.fail(bar.region, b.provider, b.version);
    if (bar.active === b) bar.active = undefined;
    if (bar.pending === b) bar.pending = undefined;
    this.close(b);
    this.options.failed(bar.region, `${b.provider}: ${reason}`, false);
    this.refresh();
  }
  private close(b: Binding) {
    clearTimeout(b.timer);
    this.options.content.disconnect(b.session);
    b.modal.dispose();
    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(b.view);
    if (!b.view.webContents.isDestroyed()) b.view.webContents.close();
  }
  retry(region?: ShellBarRegion) {
    for (const bar of this.bars)
      if (!region || region === bar.region) {
        bar.unavailable = false;
        this.options.registry.retry(bar.region);
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
    for (const method of [
      'connect',
      'ready',
      'invoke',
      'getSettings',
      'executeCommand',
      'shortcut',
      'focusHost',
    ])
      ipcMain.removeHandler('shell-bar:' + method);
    this.options.registry.touch();
  }
}

import type { ShellProviderRegistry, ShellProvider } from './shell-provider-registry';
import { WebContentsView, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createShellView } from './shell-view';
import { defaultShellId, shellView, type ShellStatus } from '../../shared/shell';
import type { UiPresentation } from './ui-presentation';
import type { HostModalLayer, HostModalRegistration } from './host-modal-layer';

type Binding = {
  id: string;
  version: string;
  generation?: string;
  session: string;
  view: WebContentsView;
  modal?: HostModalRegistration;
  url: string;
  ready: boolean;
  revision: number;
  settingsSignature?: string;
  timer: ReturnType<typeof setTimeout>;
};
/** Owns surfaces, never imports a Shell renderer. Both providers use this exact path. */
export class ShellHost {
  private active?: Binding;
  private pending?: Binding;
  private failed = new Set<string>();
  private failedVersions: Record<string, string> = {};
  private bounds: Electron.Rectangle | null = null;
  private error: string | null = null;
  private disposed = false;
  constructor(
    private options: {
      window: BrowserWindow;
      layer?(): void;
      modalLayer?: HostModalLayer;
      preload: string;
      ui: UiPresentation;
      providers(): ShellProvider[];
      registry: ShellProviderRegistry;
      selected(): string;
      safeMode: boolean;
      ready(): boolean;
      failureFile: string;
      changed(): void;
      log(message: string): void;
      failed(message: string, retry: () => void): void;
      shortcut(input: Electron.Input): boolean;
      execute(provider: string, command: string): Promise<unknown>;
      settings(provider: string): Record<string, unknown>;
      openGroup?(id: string, anchor: import('../../shared/ribbon').RibbonAnchor): void;
      invalidateAnchor?(): void;
    },
  ) {
    try {
      const saved = JSON.parse(fs.readFileSync(options.failureFile, 'utf8'));
      if (saved && typeof saved === 'object') this.failedVersions = saved;
    } catch {}
    options.registry.observe('ribbon', () => ({
      provider: this.active?.id ?? null,
      version: this.active?.version,
      generation: this.active?.generation,
      session: this.active?.session,
      ready: !!this.active?.ready,
      visible:
        !!this.active?.ready &&
        !this.active?.modal?.blocked &&
        !!this.bounds &&
        !options.window.isDestroyed() &&
        options.window.isVisible() &&
        !options.window.isMinimized(),
      pending: this.pending?.id ?? null,
    }));
    options.window.on('show', () => options.registry.touch());
    options.window.on('hide', () => options.registry.touch());
    options.window.on('minimize', () => options.registry.touch());
    options.window.on('restore', () => options.registry.touch());
    const binding = (event: IpcMainInvokeEvent) => {
      const result = [this.active, this.pending].find((b) => b?.view.webContents === event.sender);
      if (
        !result ||
        !options.registry.usable('ribbon', {
          provider: result.id,
          version: result.version,
          generation: result.generation,
        }) ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.getURL() !== result.url
      )
        throw Error('Shell session is not bound');
      return result;
    };
    ipcMain.handle('shell:connect', (event) => {
      const b = binding(event);
      const snapshot = options.ui.get();
      b.revision = snapshot.revision;
      return {
        providerAppletId: b.id,
        contextId: 'primary',
        sessionId: b.session,
        bindingId: 'primary',
        snapshot,
      };
    });
    ipcMain.handle('shell:focusHost', (event, edge) => {
      const b = binding(event);
      if (b !== this.active || !['before', 'after'].includes(edge))
        throw Error('Invalid focus request');
      options.window.webContents.focus();
      options.window.webContents.send('dock:shellFocusHost', edge);
    });
    ipcMain.handle('shell:get', (event) => {
      binding(event);
      return options.ui.get();
    });
    ipcMain.handle('shell:asset', (event, id) => {
      binding(event);
      return options.ui.getAsset(id);
    });
    ipcMain.handle('shell:invoke', (event, request) => {
      const b = binding(event);
      if (b !== this.active || !b.ready || b.modal?.blocked) throw Error('Shell is not active');
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
            throw Error('グループボタンの位置を取得できません。');
          const hostZoom = options.window.webContents.getZoomFactor();
          options.openGroup(id, {
            x: (bounds.x + anchor.x * zoom) / hostZoom,
            y: (bounds.y + anchor.y * zoom) / hostZoom,
            width: (anchor.width * zoom) / hostZoom,
            height: (anchor.height * zoom) / hostZoom,
          });
        },
      });
    });
    ipcMain.handle('shell:invalidateAnchor', (event) => {
      const b = binding(event);
      if (b === this.active && b.ready) options.invalidateAnchor?.();
    });
    ipcMain.handle('shell:executeCommand', (event, command) => {
      const b = binding(event);
      if (b !== this.active || !b.ready || b.modal?.blocked) throw Error('Shell is not active');
      return options.execute(b.id, command);
    });
    ipcMain.handle('shell:getSettings', (event) => options.settings(binding(event).id));
    ipcMain.handle('shell:ready', (event, session) => {
      const b = binding(event);
      if (session !== b.session) throw Error('Stale Shell session');
      if (b === this.active) return;
      if (options.registry.resolve('ribbon').provider?.id !== b.id)
        throw Error('Superseded Shell session');
      clearTimeout(b.timer);
      b.ready = true;
      const old = this.active;
      this.active = b;
      this.pending = undefined;
      if (b.id === options.selected() || options.safeMode) this.error = null;
      if (old) this.close(old);
      this.layout();
      options.changed();
    });
    ipcMain.handle('shell:dispose', (event, session) => {
      const b = binding(event);
      if (session === b.session) this.fail(b, 'Shell session disposed');
    });
    options.window.once('closed', () => this.dispose());
  }
  get status(): ShellStatus {
    return {
      selected: this.options.selected(),
      active: this.active?.id ?? null,
      error: this.error,
      safeMode: this.options.safeMode,
    };
  }
  focus(edge: 'first' | 'last') {
    if (!['first', 'last'].includes(edge) || !this.active || !this.bounds || this.active.modal?.blocked) return;
    this.active.view.webContents.focus();
    this.active.view.webContents.send('shell:focus', edge);
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
      throw Error('Invalid Shell bounds');
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
    this.options.registry.touch();
    if (!this.active) return;
    if (this.bounds) this.active.view.setBounds(this.bounds);
    if (this.active.modal) this.active.modal.setVisible(!!this.bounds);
    else this.active.view.setVisible(!!this.bounds);
    this.options.layer?.();
  }
  refresh() {
    if (this.disposed || !this.options.ready()) return;
    const providers = this.options.providers();
    for (const p of providers) {
      if (p.id === defaultShellId) continue;
      if (this.failedVersions[p.id] === p.version) this.failed.add(p.id);
      else if (this.failedVersions[p.id]) {
        delete this.failedVersions[p.id];
        this.failed.delete(p.id);
      }
    }
    for (const p of providers)
      if (this.failed.has(p.id)) this.options.registry.fail('ribbon', p.id, p.version);
    const configured = providers.find((p) => p.id === this.options.selected());
    if (
      !this.options.safeMode &&
      configured?.state === 'error' &&
      shellView(configured.shell, 'ribbon')
    )
      this.recordFailure(configured.id, configured.version, 'Shell worker failed');
    const resolution = this.options.registry.resolve('ribbon');
    const id = resolution.provider?.id;
    if (!this.failed.has(this.options.selected()))
      this.error =
        this.options.safeMode || (configured && !shellView(configured.shell, 'ribbon'))
          ? null
          : resolution.reason;
    const fallback = providers.find((p) => p.id === defaultShellId);
    if (!id && (!fallback || fallback.state === 'error'))
      this.recordFailure(defaultShellId, fallback?.version ?? '', 'Default Shell is unavailable');
    if (this.pending && this.pending.id !== id) {
      const cancelled = this.pending;
      this.pending = undefined;
      this.close(cancelled);
    }
    for (const b of [this.active, this.pending]) {
      if (
        b &&
        !this.options.registry.usable('ribbon', {
          provider: b.id,
          version: b.version,
          generation: b.generation,
        })
      ) {
        if (providers.find((p) => p.id === b.id)?.state === 'error')
          this.fail(b, 'Shell worker stopped');
        else {
          // An intentional disable/restart is not a provider fault. It may be selected again.
          if (b === this.active) this.active = undefined;
          if (b === this.pending) this.pending = undefined;
          this.close(b);
          this.options.changed();
          this.refresh();
        }
        return;
      }
    }
    if (this.pending?.id !== id && this.active?.id !== id && id && !this.failed.has(id)) {
      const p = providers.find(
        (p) => p.id === id && shellView(p.shell, 'ribbon') && p.state === 'running',
      );
      if (p) {
        try {
          this.open(p);
        } catch {
          this.recordFailure(p.id, p.version, 'Shell UI is unavailable');
          this.options.changed();
        }
      } else if (id === defaultShellId && !providers.some((p) => p.id === defaultShellId)) {
        this.recordFailure(id, '', 'Default Shell package is missing');
      }
    }
    if (this.active?.id === this.options.selected() && !this.failed.has(this.active.id))
      this.error = null;
    const snapshot = this.options.ui.get();
    for (const b of [this.active, this.pending]) {
      if (b && !b.view.webContents.isDestroyed()) {
        const signature = JSON.stringify(this.options.settings(b.id));
        if (b.settingsSignature !== signature) {
          b.settingsSignature = signature;
          b.view.webContents.send('shell:settingsChanged');
        }
      }
      if (b && b.revision !== snapshot.revision && !b.view.webContents.isDestroyed()) {
        b.revision = snapshot.revision;
        b.view.webContents.send('shell:changed', snapshot);
      }
    }
  }
  retry() {
    this.options.registry.retry('ribbon');
    this.failed.clear();
    this.failedVersions = {};
    this.saveFailures();
    this.error = null;
    this.refresh();
  }
  private saveFailures() {
    try {
      fs.mkdirSync(path.dirname(this.options.failureFile), { recursive: true });
      fs.writeFileSync(this.options.failureFile, JSON.stringify(this.failedVersions));
    } catch {
      this.error = 'Shellの復旧状態を保存できません。ログと保存先を確認してください。';
    }
  }
  private recordFailure(id: string, version: string, message: string) {
    if (this.failed.has(id)) return;
    this.options.registry.fail('ribbon', id, version);
    this.failed.add(id);
    // Default Shell must be attempted on every new launch, including --safe-shell.
    if (id !== defaultShellId) {
      this.failedVersions[id] = version;
      this.saveFailures();
    }
    this.error = `${id}: ${message}`;
    this.options.log(this.error);
    if (id === defaultShellId) this.options.failed(this.error, () => this.retry());
  }
  private open(provider: ShellProvider) {
    if (this.pending) this.close(this.pending);
    const { view, url } = createShellView(
      provider.folder,
      shellView(provider.shell, 'ribbon')!,
      this.options.preload,
    );
    const b: Binding = {
      id: provider.id,
      version: provider.version,
      generation: provider.generation,
      session: randomUUID(),
      view,
      modal: this.options.modalLayer?.register(view),
      url,
      ready: false,
      revision: 0,
      timer: setTimeout(() => this.fail(b, 'Shell ready timeout'), 10000),
    };
    this.pending = b;
    view.setVisible(false);
    this.options.window.contentView.addChildView(view);
    view.webContents.on('render-process-gone', () => this.fail(b, 'Shell renderer exited'));
    view.webContents.on('unresponsive', () => this.fail(b, 'Shell renderer is unresponsive'));
    view.webContents.on('before-input-event', (event, input) => {
      if (this.options.shortcut(input)) event.preventDefault();
    });
    void view.webContents.loadURL(b.url).catch(() => this.fail(b, 'Shell UI load failed'));
  }
  private close(b: Binding) {
    this.options.invalidateAnchor?.();
    clearTimeout(b.timer);
    this.options.ui.disconnect(b.session);
    b.modal?.dispose();
    if (!this.options.window.isDestroyed()) this.options.window.contentView.removeChildView(b.view);
    if (!b.view.webContents.isDestroyed()) b.view.webContents.close();
  }
  private fail(b: Binding, message: string) {
    if (this.disposed || (b !== this.active && b !== this.pending)) return;
    this.recordFailure(
      b.id,
      this.options.providers().find((p) => p.id === b.id)?.version ?? '',
      message,
    );
    if (b === this.active) this.active = undefined;
    if (b === this.pending) this.pending = undefined;
    this.close(b);
    this.options.changed();
    if (b.id !== defaultShellId) this.refresh();
  }
  dispose() {
    this.disposed = true;
    for (const b of [this.active, this.pending]) if (b) this.close(b);
    this.active = this.pending = undefined;
    this.options.registry.touch();
    for (const method of [
      'connect',
      'get',
      'asset',
      'invoke',
      'ready',
      'dispose',
      'focusHost',
      'executeCommand',
      'getSettings',
      'invalidateAnchor',
    ])
      ipcMain.removeHandler(`shell:${method}`);
  }
}

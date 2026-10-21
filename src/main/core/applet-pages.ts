import { BrowserWindow, WebContentsView, View, screen, type Input, type Rectangle } from 'electron';
import path from 'node:path';
import { WindowStateStore, restoreWindowBounds } from './window-state';
import type { PageDisplay } from '../../shared/applet-pages';
import { PageImageRegistry } from './page-images';
import { appearanceArguments, registerAppearance } from './appearance-host';

interface PageHost {
  window(): BrowserWindow | null;
  display(key: string, fallback: PageDisplay): PageDisplay;
  selected(key: string | null): void;
  shortcut(input: Input, appletId?: string): boolean;
  failed(message: string): void;
  overlay?(): void;
}
let host: PageHost | undefined;
let selected: string | null = null;
let bounds: Rectangle | null = null;
const surfaces = new Map<string, AppletSurface>();
const allSurfaces = new Set<AppletSurface>();
export async function coverAppletPagesForImagePicker() {
  const visible = [...allSurfaces].filter((surface) => surface.visible);
  const frozen: { image: string; bounds: Rectangle }[] = [];
  const focused = visible.find((surface) => surface.ui.webContents.isFocused());
  const window = host?.window();
  const restore = () => {
    if (window && !window.isDestroyed()) window.webContents.send('dock:imagePickerBackdrop', []);
    for (const surface of visible) {
      surface.covered = false;
      if (surface.ui.webContents.isDestroyed()) continue;
      if (surface.display === 'window') surface.window?.setEnabled(true);
      surface.layout();
    }
    if (focused?.visible && !focused.ui.webContents.isDestroyed()) {
      focused.window?.focus();
      focused.ui.webContents.focus();
    }
  };
  try {
    for (const surface of visible) {
      if (surface.display === 'page') {
        const image = await surface.ui.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        const zoom = surface.window?.webContents.getZoomFactor() ?? 1;
        const area = surface.contentView.getBounds();
        frozen.push({
          image: image.toDataURL(),
          bounds: {
            x: area.x / zoom,
            y: area.y / zoom,
            width: area.width / zoom,
            height: area.height / zoom,
          },
        });
      }
      surface.covered = true;
      surface.contentView.setVisible(false);
      if (surface.display === 'window') surface.window?.setEnabled(false);
    }
    if (window && !window.isDestroyed())
      window.webContents.send('dock:imagePickerBackdrop', frozen);
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}
const imageSurfaces = new Map<string, AppletSurface>();
const imageSessions = new WeakSet<Electron.Session>();
export function localPageImages(key: string) {
  return imageSurfaces.get(key)?.images;
}
export function notifyAppletPage(key: string) {
  const surface = surfaces.get(key);
  if (!surface || surface.ui.webContents.isDestroyed()) return false;
  surface.notifyChanged();
  return true;
}
export function activeShortcutPage(foregroundWindow?: string) {
  const surface = [...allSurfaces].find(
    (surface) =>
      surface.visible &&
      surface.window &&
      (foregroundWindow === undefined
        ? surface.window.isFocused()
        : surface.window.getNativeWindowHandle().readBigUInt64LE().toString() === foregroundWindow),
  );
  return { appletId: surface?.options.appletId, pageId: surface?.options.key };
}
export function configurePageHost(value: PageHost) {
  host = value;
  const window = value.window();
  const layout = () => {
    for (const surface of surfaces.values()) surface.layout();
  };
  window?.on('resize', layout);
  window?.on('show', layout);
  window?.on('hide', layout);
  window?.on('minimize', layout);
  window?.on('restore', layout);
}
export function pageHostShortcut(input: Input, appletId?: string) {
  return host?.shortcut(input, appletId) ?? false;
}
export function updatePageViewport(key: string | null, area: Rectangle | null) {
  if (key !== null && (!surfaces.has(key) || surfaces.get(key)!.display !== 'page'))
    // A renderer resize can arrive after the surface was closed or moved to a Window.
    return;
  if (
    area !== null &&
    (!area ||
      ['x', 'y', 'width', 'height'].some((field) => {
        const value = area[field as keyof Rectangle];
        return (
          !Number.isSafeInteger(value) ||
          value < (field === 'x' || field === 'y' ? 0 : 1) ||
          value > 100000
        );
      }))
  )
    throw Error('ページ領域が不正です。');
  selected = key;
  bounds = area;
  for (const surface of surfaces.values()) surface.layout();
}
export function refreshPageDisplays() {
  for (const surface of surfaces.values()) surface.refreshDisplay();
}
export function closeAppletPages(extensionId: string) {
  for (const [key, surface] of surfaces)
    if (key.startsWith(`page:${extensionId}:`)) surface.close();
}
export function updateAppletPage(key: string, title: string, display: PageDisplay = 'page') {
  const surface = surfaces.get(key);
  if (!surface) return;
  surface.options.title = title;
  surface.options.defaultDisplay = display;
  if (surface.display === 'window') surface.window?.setTitle(title);
  surface.refreshDisplay();
  if (!surface.ui.webContents.isDestroyed()) surface.ui.webContents.send('applet-page:changed');
}
export function disposeAppletPage(key: string) {
  surfaces.get(key)?.close();
}
export function hideAppletPage(key: string) {
  surfaces.get(key)?.hide();
}
export interface SurfaceOptions {
  appletId?: string;
  key?: string;
  title: string;
  url: string;
  preload?: string;
  remote?: boolean;
  session?: Electron.Session;
  stateFile: string;
  defaultDisplay?: PageDisplay;
  partition: string;
  onLayout(): void;
  onCreated?(contents: Electron.WebContents): void;
  pageImages?: { dataRoot: string; active(): boolean };
}
/** Owns the UI, independently of the window in which it is currently presented. */
export class AppletSurface {
  covered = false;
  readonly images?: PageImageRegistry;
  private changePending = false;
  readonly ui: WebContentsView;
  readonly contentView = new View();
  private standalone?: BrowserWindow;
  private parent?: BrowserWindow;
  private state: WindowStateStore;
  private ready: Promise<void>;
  private opened = false;
  private closed = false;
  private mode: PageDisplay;
  constructor(readonly options: SurfaceOptions) {
    this.mode = this.requestedDisplay();
    this.state = new WindowStateStore(options.stateFile, () =>
      host?.failed('Appletウィンドウの位置・サイズを読み込み/保存できませんでした。'),
    );
    this.ui = new WebContentsView({
      webPreferences: {
        preload: options.preload,
        ...(!options.remote && options.preload
          ? { additionalArguments: appearanceArguments() }
          : {}),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
        partition: options.partition,
        session: options.session,
        webSecurity: true,
      },
    });
    this.contentView.addChildView(this.ui);
    if (!options.remote && options.preload) registerAppearance(this.ui.webContents, options.url);
    if (options.pageImages && options.key && options.appletId) {
      this.images = new PageImageRegistry(
        options.pageImages.dataRoot,
        options.appletId,
        () =>
          !this.closed && imageSurfaces.get(options.key!) === this && options.pageImages!.active(),
        () =>
          [...imageSurfaces.values()]
            .filter((surface) => surface.options.appletId === options.appletId)
            .reduce((sum, surface) => sum + (surface.images?.size ?? 0), 0),
      );
      imageSurfaces.set(options.key, this);
      const session = this.ui.webContents.session;
      if (!imageSessions.has(session)) {
        session.protocol.handle('appdock', (request) => {
          const surface = imageSurfaces.get(options.key!);
          return surface?.ui.webContents.session === session && surface.images
            ? surface.images.response(request.url)
            : new Response(null, { status: 404 });
        });
        imageSessions.add(session);
      }
      this.ui.webContents.once('destroyed', () => this.releaseImages());
    }
    if (!options.remote) this.ui.webContents.on('will-navigate', (event) => event.preventDefault());
    this.ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.ui.webContents.on('render-process-gone', (_, details) => {
      if (this.images) this.close();
      host?.failed(`Applet画面が終了しました: ${details.reason}`);
    });
    options.onCreated?.(this.ui.webContents);
    this.ready = this.ui.webContents.loadURL(options.url);
    // The caller of open receives load errors; background creation must not reject unhandled.
    void this.ready.catch(() => {});
    if (options.key) surfaces.set(options.key, this);
    allSurfaces.add(this);
  }
  private requestedDisplay() {
    return this.options.key
      ? (host?.display(this.options.key, this.options.defaultDisplay ?? 'page') ?? 'window')
      : 'window';
  }
  notifyChanged() {
    if (this.changePending || this.closed) return;
    this.changePending = true;
    queueMicrotask(() => {
      this.changePending = false;
      if (!this.closed && !this.ui.webContents.isDestroyed())
        this.ui.webContents.send('applet-page:changed');
    });
  }
  private releaseImages() {
    this.images?.clear();
    if (this.options.key && imageSurfaces.get(this.options.key) === this)
      imageSurfaces.delete(this.options.key);
  }
  get display() {
    return this.mode;
  }
  get window() {
    return this.mode === 'page' ? (host?.window() ?? undefined) : this.standalone;
  }
  get visible() {
    const window = this.window;
    return (
      !this.closed &&
      this.opened &&
      !!window &&
      !window.isDestroyed() &&
      window.isVisible() &&
      !window.isMinimized() &&
      (this.mode === 'window' || (selected === this.options.key && bounds !== null))
    );
  }
  get size() {
    if (this.mode === 'page') return { width: bounds?.width ?? 1, height: bounds?.height ?? 1 };
    const [width, height] = this.standalone?.getContentSize() ?? [1, 1];
    return { width, height };
  }
  private detach() {
    if (
      this.parent &&
      !this.parent.isDestroyed() &&
      this.parent.contentView.children.includes(this.contentView)
    )
      this.parent.contentView.removeChildView(this.contentView);
    this.parent = undefined;
  }
  private createWindow() {
    if (this.standalone && !this.standalone.isDestroyed()) return this.standalone;
    const primary = screen.getPrimaryDisplay();
    const saved = this.state.load(
      [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map(
        (d) => d.workArea,
      ),
      { width: 900, height: 640 },
    );
    const window = new BrowserWindow({
      width: 1280,
      height: 900,
      ...saved?.bounds,
      minWidth: 900,
      minHeight: 640,
      title: this.options.title,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    this.standalone = window;
    this.state.track(window);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const layout = () => this.layout();
    window.on('resize', layout);
    window.on('show', layout);
    window.on('hide', layout);
    window.on('minimize', layout);
    window.on('restore', layout);
    window.on('close', (event) => {
      if (!this.closed) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on('closed', () => {
      this.standalone = undefined;
      this.options.onLayout();
    });
    if (saved) restoreWindowBounds(window, saved.bounds);
    if (saved?.maximized) window.maximize();
    return window;
  }
  async open() {
    if (this.closed) throw Error('Appletページは停止しています。');
    await this.ready;
    if (this.closed) throw Error('Appletページは停止しています。');
    this.opened = true;
    this.refreshDisplay();
    if (this.mode === 'page') {
      const alreadySelected = selected === this.options.key;
      selected = this.options.key!;
      // Wait for the host renderer to report the page's actual client rectangle.
      if (!alreadySelected) bounds = null;
      host?.selected(selected);
      const window = this.window;
      if (window?.isMinimized()) window.restore();
      window?.show();
      window?.focus();
    } else {
      const window = this.createWindow();
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
    this.layout();
  }
  refreshDisplay() {
    if (this.closed) return;
    const next = this.requestedDisplay();
    if (next === this.mode) return;
    const wasVisible = this.visible;
    const wasSelected = selected === this.options.key;
    this.detach();
    this.standalone?.hide();
    this.mode = next;
    if (wasSelected) {
      selected = null;
      bounds = null;
      host?.selected(null);
    }
    if (this.opened && (wasVisible || wasSelected)) {
      if (next === 'page') {
        selected = this.options.key!;
        host?.selected(selected);
      } else this.createWindow().show();
    }
    this.layout();
  }
  hide() {
    if (this.closed) return;
    this.opened = false;
    this.standalone?.hide();
    if (selected === this.options.key) {
      selected = null;
      bounds = null;
      host?.selected(null);
    }
    this.layout();
  }
  layout() {
    if (this.closed) return;
    const window = this.window;
    if (!window || !this.opened || (!this.visible && this.mode === 'page')) {
      this.detach();
      this.options.onLayout();
      return;
    }
    if (this.parent !== window) {
      this.detach();
      window.contentView.addChildView(this.contentView);
      this.parent = window;
    }
    const [width, height] = window.getContentSize();
    const rect = this.mode === 'page' ? bounds! : { x: 0, y: 0, width, height };
    const area = {
      x: Math.min(rect.x, width),
      y: Math.min(rect.y, height),
      width: Math.max(1, Math.min(rect.width, width - rect.x)),
      height: Math.max(1, Math.min(rect.height, height - rect.y)),
    };
    this.contentView.setBounds(area);
    this.contentView.setVisible(!this.covered);
    this.ui.setBounds({ x: 0, y: 0, width: area.width, height: area.height });
    this.options.onLayout();
    host?.overlay?.();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.releaseImages();
    allSurfaces.delete(this);
    this.detach();
    this.state.flush();
    if (this.options.key) {
      if (surfaces.get(this.options.key) === this) surfaces.delete(this.options.key);
      if (selected === this.options.key && !surfaces.has(this.options.key)) {
        selected = null;
        bounds = null;
        host?.selected(null);
      }
    }
    if (!this.ui.webContents.isDestroyed()) this.ui.webContents.close();
    this.standalone?.destroy();
    this.standalone = undefined;
  }
}

export interface LocalPageServices {
  snapshot(): unknown;
  execute(id: unknown): Promise<unknown>;
  changed(callback: () => void): () => void;
  call?(operation: unknown, input: unknown): Promise<unknown>;
}
const localPages = new Map<
  Electron.WebContents,
  { url: string; services: LocalPageServices; surface: AppletSurface; unsubscribe(): void }
>();
export function openLocalPage(options: SurfaceOptions, services: LocalPageServices) {
  const existing = options.key && surfaces.get(options.key);
  if (existing) return existing.open();
  const surface = new AppletSurface(options);
  const contents = surface.ui.webContents;
  const unsubscribe = services.changed(() => {
    if (!contents.isDestroyed()) contents.send('applet-page:changed');
  });
  localPages.set(contents, { url: options.url, services, surface, unsubscribe });
  contents.once('destroyed', () => {
    unsubscribe();
    localPages.delete(contents);
  });
  return surface.open().catch((error) => {
    surface.close();
    throw error;
  });
}
export function localPageSource(event: Electron.IpcMainInvokeEvent) {
  const page = localPages.get(event.sender);
  if (!page || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== page.url)
    throw Error('許可されていないAppletページからの要求です。');
  return page.services;
}

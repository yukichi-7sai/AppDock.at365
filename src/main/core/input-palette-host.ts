import { BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { appearanceArguments, registerAppearance } from './appearance-host';
import type { InputCaptureManager } from './gestures';
import type { TextLibraryService } from './text-library-service';
import type { LibraryEntry } from '../../shared/library-assets';
import {
  inputPaletteBounds,
  defaultInputPaletteWidth,
  inputPaletteSelection,
  inputPaletteResizedBounds,
  type InputPaletteRectangle,
  type InputPaletteSize,
  type InputPaletteKind,
  type InputPaletteModel,
} from '../../shared/input-palette';
import { hostText } from '../../shared/i18n';

interface PaletteList {
  entries: (InputPaletteModel['rows'][number] & ({ document: LibraryEntry } | { item: string }))[];
  empty: string;
  selected: number;
  scrollTop: number;
  size?: InputPaletteSize;
}
interface Session extends PaletteList {
  id: string;
  view: number;
  pasteEpoch: number;
  kind: InputPaletteKind;
  expected: string;
  anchor?: { x: number; y: number };
  lists: Partial<Record<InputPaletteKind, PaletteList>>;
  switching: boolean;
  captureView?: (top: number) => void;
  ready?: () => void;
  resizing?: {
    x: number;
    y: number;
    bounds: InputPaletteRectangle;
    area: InputPaletteRectangle;
    zoom: number;
  };
  guide: boolean;
  bounds?: InputPaletteRectangle;
}
export type PaletteFailure = 'open' | 'read' | 'send' | 'modifiers' | 'unconfirmed' | 'denied';
export class InputPaletteHost {
  private active?: Session;
  private presented?: string;
  private window?: BrowserWindow;
  private connected = false;
  private confirmations = new Map<string, Session>();
  private writes: Promise<void> = Promise.resolve();
  private pasteEpoch = 0;
  constructor(
    private url: string,
    private preload: string,
    private input: InputCaptureManager,
    private texts: TextLibraryService,
    private includeHistory: () => boolean,
    private displayRows: (kind: InputPaletteKind) => number,
    private manageSnippets: () => Promise<void>,
    private report: (stage: PaletteFailure, session: Pick<Session, 'id' | 'kind'>) => void,
    private showGuide: () => boolean = () => true,
    private displayWidth: (kind: InputPaletteKind) => number = () => defaultInputPaletteWidth,
  ) {
    ipcMain.on('input-palette:connect', this.connect);
    ipcMain.on('input-palette:choose', this.click);
    ipcMain.on('input-palette:ready', this.ready);
    ipcMain.on('input-palette:manage', this.manage);
    ipcMain.on('input-palette:scroll', this.scroll);
    ipcMain.on('input-palette:view-state', this.viewState);
    ipcMain.on('input-palette:resize', this.resize);
  }
  private connect = (e: IpcMainEvent) => {
    if (!this.trusted(e)) return;
    this.connected = true;
    if (this.active?.ready) this.publish(this.active);
  };
  private publish(s: Session) {
    this.window?.webContents.send('input-palette:model', {
      session: s.id,
      view: s.view,
      kind: s.kind,
      selected: s.selected,
      scrollTop: s.scrollTop,
      restoreScroll: s.lists[s.kind] !== undefined,
      rows: s.entries.map(({ name, preview, thumbnail, title }) => ({
        name,
        preview,
        thumbnail,
        title,
      })),
      title: hostText(s.kind === 'history' ? 'inputPalette.historyTitle' : 'inputPalette.title'),
      keys: hostText('inputPalette.keys'),
      keyHelp: hostText('inputPalette.keyHelp'),
      manage: hostText('inputPalette.manage'),
      guide: s.guide,
      resize: hostText('inputPalette.resize'),
      empty: s.empty,
    });
  }
  private ready = (e: IpcMainEvent, session: string, view: number) => {
    const s = this.active;
    if (s && s.id === session && s.view === view && this.trusted(e)) {
      s.ready?.();
    }
  };
  private resize = (
    e: IpcMainEvent,
    session: string,
    view: number,
    phase: string,
    x: number,
    y: number,
  ) => {
    const s = this.active,
      win = this.window;
    if (
      !s ||
      !win ||
      s.id !== session ||
      s.view !== view ||
      s.switching ||
      this.presented !== session ||
      !this.trusted(e) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return;
    if (phase === 'start') {
      const actual = win.getBounds();
      // Use requested dimensions for deltas; Windows can round getBounds up at fractional DPI.
      const bounds = {
        ...actual,
        width: s.bounds?.width ?? actual.width,
        height: s.bounds?.height ?? actual.height,
      };
      s.resizing = {
        x,
        y,
        bounds,
        area: screen.getDisplayMatching(bounds).workArea,
        zoom: win.webContents.getZoomFactor(),
      };
      return;
    }
    if (!s.resizing || (phase !== 'move' && phase !== 'end')) return;
    const drag = s.resizing;
    const bounds = inputPaletteResizedBounds(
      drag.bounds,
      drag.area,
      {
        width: drag.bounds.width + (x - drag.x) * drag.zoom,
        height: drag.bounds.height + (y - drag.y) * drag.zoom,
      },
      s.guide,
    );
    if (bounds.width !== s.bounds?.width || bounds.height !== s.bounds?.height) {
      win.setBounds(bounds);
      s.bounds = bounds;
      s.size = { width: bounds.width, height: bounds.height };
    }
    if (phase === 'end') s.resizing = undefined;
  };
  private trusted(e: IpcMainEvent) {
    return (
      this.window?.webContents === e.sender &&
      e.senderFrame === e.sender.mainFrame &&
      e.senderFrame?.url === this.url
    );
  }
  private click = (e: IpcMainEvent, session: string, view: number, index: number) => {
    const s = this.active;
    if (
      s &&
      s.id === session &&
      s.view === view &&
      !s.switching &&
      this.trusted(e) &&
      Number.isInteger(index) &&
      s.entries[index]
    )
      void this.choose(s, index);
  };
  private scroll = (e: IpcMainEvent, session: string, view: number, top: number) => {
    const s = this.active;
    if (
      s &&
      s.id === session &&
      s.view === view &&
      this.trusted(e) &&
      Number.isFinite(top) &&
      top >= 0
    )
      s.scrollTop = top;
  };
  private manage = (e: IpcMainEvent, session: string, view: number) => {
    const s = this.active;
    if (
      !s ||
      s.id !== session ||
      s.view !== view ||
      s.kind !== 'snippets' ||
      s.switching ||
      !this.trusted(e)
    )
      return;
    this.end(s);
    void this.manageSnippets().catch(() => this.report('open', s));
  };
  private viewState = (e: IpcMainEvent, session: string, view: number, top: number) => {
    const s = this.active;
    if (
      s &&
      s.id === session &&
      s.view === view &&
      this.trusted(e) &&
      Number.isFinite(top) &&
      top >= 0
    )
      s.captureView?.(top);
  };
  private async captureView(s: Session) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const captured = new Promise<void>((resolve, reject) => {
      s.captureView = (top) => {
        s.scrollTop = top;
        resolve();
      };
      timeout = setTimeout(() => reject(Error('Palette view state timeout')), 10000);
    });
    try {
      this.window?.webContents.send('input-palette:capture-view', s.id, s.view);
      await captured;
    } finally {
      clearTimeout(timeout);
      s.captureView = undefined;
    }
  }
  private surface() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const win = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      focusable: false,
      frame: false,
      type: 'toolbar',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'input-palette',
        additionalArguments: appearanceArguments(),
      },
    });
    this.window = win;
    this.connected = false;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    win.webContents.once('render-process-gone', () => this.failedWindow(win));
    win.once('closed', () => {
      if (this.window !== win) return;
      this.window = undefined;
      this.connected = false;
      if (this.active) this.end(this.active);
    });
    registerAppearance(win.webContents, this.url);
    void win.loadURL(this.url).catch(() => this.failedWindow(win));
    return win;
  }
  private failedWindow(win: BrowserWindow) {
    if (this.window !== win) return;
    this.window = undefined;
    this.connected = false;
    if (this.active) {
      const s = this.active;
      this.end(s);
      this.report('open', s);
    }
    if (!win.isDestroyed()) win.destroy();
  }
  private hide() {
    this.presented = undefined;
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      if (this.connected) this.window.webContents.send('input-palette:model', null);
    }
  }
  async open(expected: string, kind: Session['kind'] = 'snippets') {
    if (this.active) {
      const same = this.active.kind === kind;
      this.end(this.active);
      if (same) return;
    }
    if (this.presented) this.hide();
    const s: Session = {
      id: randomUUID(),
      view: 0,
      kind,
      expected,
      empty: hostText('inputPalette.empty'),
      entries: [],
      selected: 0,
      scrollTop: 0,
      lists: {},
      switching: false,
      guide: this.showGuide(),
      pasteEpoch: this.pasteEpoch,
    };
    this.active = s;
    try {
      // Keyboard selection is valid once native captures the target, including during first paint.
      if (kind === 'snippets') {
        s.entries = this.snippets();
      }
      const anchor = await this.input.paletteRequest<{
        x: number;
        y: number;
        window: string;
      } | null>('capture', {
        session: s.id,
        window: expected,
      });
      if (!anchor || this.active !== s) {
        this.end(s);
        return;
      }
      s.expected = anchor.window;
      s.anchor = screen.screenToDipPoint(anchor);
      if (kind === 'history') {
        const list = await this.history(s);
        if (!list || this.active !== s) {
          this.end(s);
          return;
        }
        Object.assign(s, list);
      }
      await this.present(s);
    } catch {
      if (this.active === s) {
        this.end(s);
        this.report('open', s);
      }
    }
  }
  private snippets(): PaletteList['entries'] {
    return this.texts.snippetEntries().map((document) => ({
      document,
      name: path.parse(document.ref.file).name,
      title: document.ref.file,
      preview: document.textPreview ?? '',
    }));
  }
  private async history(s: Session): Promise<PaletteList | null> {
    const list = await this.input.paletteRequest<{
      status: 'ok' | 'disabled' | 'denied';
      rows: { id: string; kind: 'image' | 'text'; preview: string; thumbnail?: string }[];
    } | null>('history', { session: s.id });
    if (!list) return null;
    return {
      empty: hostText(
        list.status === 'disabled'
          ? 'inputPalette.disabled'
          : list.status === 'denied'
            ? 'inputPalette.error.denied'
            : 'inputPalette.historyEmpty',
      ),
      selected: 0,
      scrollTop: 0,
      size: undefined,
      entries: list.rows.map((row) => ({
        item: row.id,
        name:
          row.kind === 'image'
            ? hostText('inputPalette.image')
            : row.preview.split(/\r\n|\r|\n/, 1)[0] || hostText('inputPalette.text'),
        preview:
          row.kind === 'image'
            ? ''
            : row.preview
                .split(/\r\n|\r|\n/)
                .slice(1)
                .join(' '),
        thumbnail: row.thumbnail,
      })),
    };
  }
  private async switchPalette(s: Session) {
    if (s.switching) return;
    s.switching = true;
    s.resizing = undefined;
    const kind = s.kind === 'snippets' ? 'history' : 'snippets';
    try {
      // Scroll events can arrive after a native key notice. Capture the rendered view before switching.
      await this.captureView(s);
      if (this.active !== s) return;
      s.lists[s.kind] = {
        entries: s.entries,
        empty: s.empty,
        selected: s.selected,
        scrollTop: s.scrollTop,
        size: s.size,
      };
      // Invalidate clicks/scrolls queued by the previous view, while retaining the captured editor.
      s.view++;
      const list =
        s.lists[kind] ??
        (kind === 'history'
          ? await this.history(s)
          : {
              entries: this.snippets(),
              empty: hostText('inputPalette.empty'),
              selected: 0,
              scrollTop: 0,
              size: undefined,
            });
      if (this.active !== s) return;
      if (!list) {
        this.end(s);
        return;
      }
      s.kind = kind;
      Object.assign(s, list);
      await this.present(s);
    } catch {
      if (this.active === s) {
        this.end(s);
        this.report('open', s);
      }
    } finally {
      s.switching = false;
    }
  }
  private async present(s: Session) {
    const point = s.anchor!,
      area = screen.getDisplayNearestPoint(point).workArea;
    const win = this.surface();
    s.bounds = inputPaletteBounds(
      point,
      area,
      s.entries.length,
      this.displayRows(s.kind),
      s.guide,
      s.size,
      this.displayWidth(s.kind),
    );
    win.setBounds(s.bounds);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const rendered = new Promise<void>((resolve, reject) => {
      s.ready = resolve;
      timeout = setTimeout(() => reject(Error('Palette readiness timeout')), 10000);
    });
    try {
      if (this.connected) this.publish(s);
      await rendered;
    } finally {
      clearTimeout(timeout);
      s.ready = undefined;
    }
    if (this.active !== s) return;
    s.switching = false;
    const ok = await this.input.paletteRequest('show', {
      session: s.id,
      count: s.entries.length,
      popup: win.getNativeWindowHandle().readBigUInt64LE().toString(),
    });
    if (!ok || this.active !== s) {
      this.end(s);
      return;
    }
    this.presented = s.id;
    win.showInactive();
    // Reopening a hidden toolbar can leave it under the foreground editor on Windows.
    win.setAlwaysOnTop(true, 'pop-up-menu');
  }
  key(id: string, key: string) {
    const pending = this.confirmations.get(id);
    if (pending && key === 'cancel') {
      this.confirmations.delete(id);
      if (this.presented === id) this.hide();
      return;
    }
    const s = this.active;
    if (!s || s.id !== id) return;
    if (key === 'cancel') {
      this.end(s, false);
      return;
    }
    if (key === 'switch') {
      void this.switchPalette(s);
      return;
    }
    if (s.switching) return;
    if (/^choose:[0-9]$/.test(key)) {
      const index = Number(key.slice(7));
      if (s.entries[index]) void this.choose(s, index);
      return;
    }
    if (key === 'choose') {
      if (s.entries.length) void this.choose(s, s.selected);
      else this.end(s);
      return;
    }
    if (!['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key)) return;
    s.selected = inputPaletteSelection(key, s.selected, s.entries.length, this.displayRows(s.kind));
    if (this.connected)
      this.window?.webContents.send('input-palette:selected', s.id, s.view, s.selected);
  }
  private choose(s: Session, index: number) {
    if (this.active !== s) return;
    s.resizing = undefined;
    this.confirmations.set(s.id, s);
    const claim = this.input.paletteRequest<boolean>('confirm', { session: s.id }).then(
      (ok) => ({ ok }),
      () => ({ ok: false, failed: true }),
    );
    // A new command can take the surface immediately; otherwise dismiss after the accepted input.
    this.active = undefined;
    s.ready?.();
    this.writes = this.writes.then(async () => {
      try {
        const accepted = await claim;
        if (!this.confirmations.has(s.id)) return;
        if (accepted.ok) await this.insert(s, index);
        else if ('failed' in accepted) this.report('send', s);
      } catch {
        if (this.confirmations.has(s.id)) this.report('send', s);
      } finally {
        if (this.presented === s.id) this.hide();
        if (this.confirmations.delete(s.id))
          await this.input.paletteRequest('close', { session: s.id }).catch(() => {});
      }
    });
  }
  private async insert(s: Session, index: number) {
    let stage: PaletteFailure = 'read';
    try {
      if (s.pasteEpoch !== this.pasteEpoch) {
        this.report('unconfirmed', s);
        return;
      }
      const entry = s.entries[index];
      let body = '';
      if ('document' in entry) {
        body = (await this.texts.document(entry.document.ref, entry.document.generation)).body;
        if (!body || !this.confirmations.has(s.id)) return;
      }
      stage = 'send';
      // Bound the RPC frame, not the document. Write one clipboard item at the final paste.
      for (let start = 0; start < body.length;) {
        if (!this.confirmations.has(s.id)) return;
        let end = Math.min(body.length, start + 65536);
        if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
        if (
          !(await this.input.paletteRequest<boolean>('append', {
            session: s.id,
            text: body.slice(start, end),
          }))
        )
          return;
        start = end;
      }
      if (!this.confirmations.has(s.id)) return;
      const result = await this.input.paletteRequest<
        'verified' | 'submitted' | 'unconfirmed' | 'modifiers' | 'cancelled' | 'deleted' | 'denied'
      >('paste', {
        session: s.id,
        ...('item' in entry ? { item: entry.item } : { history: this.includeHistory() }),
      });
      if (result === 'deleted' && this.presented === s.id && this.confirmations.has(s.id))
        void this.open(s.expected, 'history');
      if (result === 'submitted' || result === 'unconfirmed') this.pasteEpoch++;
      if (
        (result === 'modifiers' || result === 'unconfirmed' || result === 'denied') &&
        this.confirmations.has(s.id)
      )
        this.report(result, s);
    } catch {
      if (stage === 'send') this.pasteEpoch++;
      if (this.confirmations.has(s.id)) this.report(stage, s);
    }
  }
  private end(s: Session, notify = true) {
    if (this.active !== s) return;
    s.resizing = undefined;
    this.active = undefined;
    s.ready?.();
    s.captureView?.(s.scrollTop);
    if (notify) void this.input.paletteRequest('close', { session: s.id }).catch(() => {});
    this.hide();
  }
  disconnected() {
    this.confirmations.clear();
    if (this.active) this.end(this.active, false);
  }
  dispose() {
    for (const s of this.confirmations.values())
      void this.input.paletteRequest('close', { session: s.id }).catch(() => {});
    this.confirmations.clear();
    if (this.active) this.end(this.active);
    this.window?.destroy();
    ipcMain.removeListener('input-palette:connect', this.connect);
    ipcMain.removeListener('input-palette:choose', this.click);
    ipcMain.removeListener('input-palette:ready', this.ready);
    ipcMain.removeListener('input-palette:manage', this.manage);
    ipcMain.removeListener('input-palette:scroll', this.scroll);
    ipcMain.removeListener('input-palette:view-state', this.viewState);
    ipcMain.removeListener('input-palette:resize', this.resize);
  }
}

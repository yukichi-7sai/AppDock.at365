import { BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { appearanceArguments, registerAppearance } from './appearance-host';
import type { InputCaptureManager } from './gestures';
import type { TextLibraryService } from './text-library-service';
import type { LibraryEntry } from '../../shared/library-assets';
import type { InputPaletteModel } from '../../shared/input-palette';
import { hostText } from '../../shared/i18n';

interface Session {
  id: string;
  pasteEpoch: number;
  kind: 'snippets' | 'history';
  expected: string;
  entries: (InputPaletteModel['rows'][number] & ({ document: LibraryEntry } | { item: string }))[];
  empty: string;
  selected: number;
  ready?: () => void;
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
    private report: (stage: PaletteFailure, session: Pick<Session, 'id' | 'kind'>) => void,
  ) {
    ipcMain.on('input-palette:connect', this.connect);
    ipcMain.on('input-palette:choose', this.click);
    ipcMain.on('input-palette:ready', this.ready);
  }
  private connect = (e: IpcMainEvent) => {
    if (!this.trusted(e)) return;
    this.connected = true;
    if (this.active?.ready) this.publish(this.active);
  };
  private publish(s: Session) {
    this.window?.webContents.send('input-palette:model', {
      session: s.id,
      selected: s.selected,
      rows: s.entries.map(({ name, preview, thumbnail }) => ({ name, preview, thumbnail })),
      title: hostText(s.kind === 'history' ? 'inputPalette.historyTitle' : 'inputPalette.title'),
      mode: hostText('inputPalette.mode'),
      keys: hostText('inputPalette.keys'),
      empty: s.empty,
    });
  }
  private ready = (e: IpcMainEvent, session: string) => {
    const s = this.active;
    if (s && s.id === session && this.trusted(e)) {
      e.sender.send('input-palette:selected', s.id, s.selected);
      s.ready?.();
    }
  };
  private trusted(e: IpcMainEvent) {
    return (
      this.window?.webContents === e.sender &&
      e.senderFrame === e.sender.mainFrame &&
      e.senderFrame?.url === this.url
    );
  }
  private click = (e: IpcMainEvent, session: string, index: number) => {
    const s = this.active;
    if (s && s.id === session && this.trusted(e) && Number.isInteger(index) && s.entries[index])
      void this.choose(s, index);
  };
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
      kind,
      expected,
      empty: hostText('inputPalette.empty'),
      entries: [],
      selected: 0,
      pasteEpoch: this.pasteEpoch,
    };
    this.active = s;
    try {
      // Keyboard selection is valid once native captures the target, including during first paint.
      if (kind === 'snippets') {
        s.entries = this.texts
          .snippetEntries()
          .map((document) => ({
            document,
            name: document.ref.file,
            preview: document.textPreview ?? '',
          }));
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
      if (kind === 'history') {
        const list = await this.input.paletteRequest<{
          status: 'ok' | 'disabled' | 'denied';
          rows: { id: string; kind: 'image' | 'text'; preview: string; thumbnail?: string }[];
        } | null>('history', { session: s.id });
        if (!list || this.active !== s) {
          this.end(s);
          return;
        }
        s.empty = hostText(
          list.status === 'disabled'
            ? 'inputPalette.disabled'
            : list.status === 'denied'
              ? 'inputPalette.error.denied'
              : 'inputPalette.historyEmpty',
        );
        s.entries = list.rows.map((row) => ({
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
        }));
      }
      const point = screen.screenToDipPoint(anchor),
        area = screen.getDisplayNearestPoint(point).workArea;
      const width = Math.min(370, area.width),
        height = Math.min(area.height, 78 + 50 * Math.max(1, Math.min(5, s.entries.length)));
      const x = Math.max(area.x, Math.min(point.x, area.x + area.width - width));
      const y = Math.max(
        area.y,
        point.y + height + 4 <= area.y + area.height ? point.y + 4 : point.y - height - 16,
      );
      const win = this.surface();
      win.setBounds({ x, y, width, height });
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
      const ok = await this.input.paletteRequest('show', {
        session: s.id,
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
    } catch {
      if (this.active === s) {
        this.end(s);
        this.report('open', s);
      }
    }
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
    if (key === 'choose') {
      if (s.entries.length) void this.choose(s, s.selected);
      else this.end(s);
      return;
    }
    if (key !== 'up' && key !== 'down') return;
    s.selected = Math.max(0, Math.min(s.entries.length - 1, s.selected + (key === 'up' ? -1 : 1)));
    if (this.connected) this.window?.webContents.send('input-palette:selected', s.id, s.selected);
  }
  private choose(s: Session, index: number) {
    if (this.active !== s) return;
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
    this.active = undefined;
    s.ready?.();
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
  }
}

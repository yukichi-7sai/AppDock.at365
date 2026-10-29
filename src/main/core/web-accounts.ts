import { hostText } from '../../shared/i18n';
import { safePageShortcut } from '../../shared/keybindings';
import {
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  dialog,
  shell,
  screen,
  nativeTheme,
  nativeImage,
  net,
  type Input,
} from 'electron';
import fs from 'node:fs';
import { registerDisplayZoom } from './display-zoom-host';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from './settings';
import type {
  WebAccountDefinition,
  WebAccountSnapshot,
  WebAccountSound,
} from '../../shared/web-accounts';
import { AppletSurface } from './applet-pages';
import { pageKey, type AppletPageDefinition } from '../../shared/applet-pages';
import { queueSound } from './sounds';
import { RegisteredSounds, soundFilename } from './registered-sounds';
import { keepWebPageActive } from './web-page-activity';
import { webAvatarURL, fetchWebAvatar, webAvatarResponse } from './web-account-avatar';
import {
  getWebAccountGroup,
  findWebAccountGroup,
  groupId,
  type WebAccountGroup,
} from './web-account-groups';
import { WebAccountRoster, WebAccountRosterError } from './web-account-roster';
import { webAccountName } from '../../shared/web-accounts';

type Saved = {
  version: 1;
  selected: string;
  accounts: {
    id: string;
    name: string;
    temporaryName?: boolean;
    sound?: WebAccountSound;
    monitoring?: boolean;
  }[];
};
// A persisted default also used to recognize older unnamed accounts; not display copy.
const temporaryAccountName = '新しいアカウント';
interface WebAccountServices {
  sharedRoot?: string;
  soundsDirectory?: string;
  capabilities: string[];
  page?: AppletPageDefinition;
  settings?(): Record<string, boolean | string>;
  setSetting?(key: unknown, value: unknown): void;
  onSettingsChanged?(callback: () => void): () => void;
  shortcut(input: Input): boolean;
  failed(message: string): void;
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const controllers = new Map<string, WebAccountController>();
type Viewport = { x: number; y: number; width: number; height: number };
export function parseWebViewport(raw: unknown): Viewport | null {
  if (raw === null) return null;
  const v = raw as Viewport;
  if (
    !v ||
    ['x', 'y', 'width', 'height'].some((key) => {
      const n = v[key as keyof Viewport];
      return !Number.isSafeInteger(n) || n < (key === 'x' || key === 'y' ? 0 : 1) || n > 100000;
    })
  )
    throw Error('Invalid Web account viewport');
  return { x: v.x, y: v.y, width: v.width, height: v.height };
}
export function serializeWebReport(raw: unknown): string {
  const json = JSON.stringify(raw ?? null);
  if (!json || Buffer.byteLength(json) > 50000) throw Error('Web account report data is too large');
  return json;
}
export function serializeWebItemKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 200 || /[\u0000-\u001f\u007f]/.test(raw))
    throw Error('Invalid Web account item key');
  return JSON.stringify(raw);
}
export function parseWebAccountSound(raw: unknown): WebAccountSound {
  const sound = raw as WebAccountSound;
  if (
    !sound ||
    typeof sound.enabled !== 'boolean' ||
    typeof sound.file !== 'string' ||
    sound.file.length > 4096 ||
    /[\u0000-\u001f\u007f]/.test(sound.file) ||
    (sound.name !== undefined &&
      (typeof sound.name !== 'string' ||
        sound.name.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(sound.name))) ||
    (sound.file &&
      !soundFilename(sound.file) &&
      (!path.isAbsolute(sound.file) || path.extname(sound.file).toLowerCase() !== '.wav'))
  )
    throw Error(hostText('services.webAccounts.soundPath'));
  return {
    enabled: sound.enabled,
    file: sound.file,
    ...(sound.name !== undefined ? { name: sound.name } : {}),
  };
}
let ipcInstalled = false;
function asset(folder: string, relative: string): string {
  if (typeof relative !== 'string' || path.isAbsolute(relative))
    throw Error('Web asset must be relative');
  const file = fs.realpathSync(path.resolve(folder, relative));
  const rel = path.relative(fs.realpathSync(folder), file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.statSync(file).isFile())
    throw Error('Web asset must be inside the Applet');
  return file;
}
export function validateWebAccounts(
  folder: string,
  value: WebAccountDefinition,
): WebAccountDefinition {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray(value.origins) ||
    !value.origins.length ||
    value.origins.length > 20
  )
    throw Error('webAccounts definition is invalid');
  if (value.keepActive !== undefined && typeof value.keepActive !== 'boolean')
    throw Error('webAccounts.keepActive must be boolean');
  if (
    value.accountGroup !== undefined &&
    (!value.accountGroup ||
      !groupId(value.accountGroup.id) ||
      typeof value.accountGroup.title !== 'string' ||
      !value.accountGroup.title.trim() ||
      value.accountGroup.title.length > 60 ||
      /[\u0000-\u001f\u007f]/.test(value.accountGroup.title) ||
      Object.keys(value.accountGroup).some((key) => !['id', 'title'].includes(key)))
  )
    throw Error('webAccounts.accountGroup must declare a valid id and title');
  if (
    value.externalLinkSetting !== undefined &&
    (typeof value.externalLinkSetting !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value.externalLinkSetting))
  )
    throw Error('webAccounts.externalLinkSetting must be a setting key');
  if (
    value.returnToStartOnHideSetting !== undefined &&
    (typeof value.returnToStartOnHideSetting !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value.returnToStartOnHideSetting))
  )
    throw Error('webAccounts.returnToStartOnHideSetting must be a setting key');
  if (
    value.avatarOrigins !== undefined &&
    (!Array.isArray(value.avatarOrigins) || value.avatarOrigins.length > 10)
  )
    throw Error('webAccounts.avatarOrigins must be an origin list');
  for (const origin of [...value.origins, ...(value.avatarOrigins ?? [])]) {
    const url = new URL(origin);
    if (
      url.protocol !== 'https:' ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.port
    )
      throw Error('webAccounts origins must be HTTPS origins');
  }
  if (
    !value.origins.includes(value.observeOrigin) ||
    !allowedWebNavigation(value.url, value.origins)
  )
    throw Error('webAccounts URL and observeOrigin must match declared origins');
  if (value.returnToStartOnHideSetting !== undefined) {
    const start = new URL(value.url);
    if (start.origin !== value.observeOrigin)
      throw Error('returnToStartOnHideSetting requires a start URL on observeOrigin');
  }
  asset(folder, value.ui);
  const observer = asset(folder, value.observer);
  if (fs.statSync(observer).size > 100000) throw Error('Web observer is too large');
  if (value.itemOpener !== undefined && fs.statSync(asset(folder, value.itemOpener)).size > 100000)
    throw Error('Web item opener is too large');
  return value;
}
export function allowedWebNavigation(raw: string, origins: string[]): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      origins.includes(url.origin)
    );
  } catch {
    return false;
  }
}
export class WebAccountController {
  private state: Saved;
  private group?: WebAccountGroup;
  private unsubscribeGroup?: () => void;
  private surface?: AppletSurface;
  private get window() {
    return this.surface?.window;
  }
  private get uiContents() {
    return this.surface?.ui.webContents;
  }
  private get contentView() {
    return this.surface?.contentView;
  }
  private background?: BrowserWindow;
  private backgroundSize = { width: 1044, height: 754 };
  private attached?: WebContentsView;
  private viewport: Viewport | null | undefined;
  private disposed = false;
  private opening?: Promise<void>;
  private navigationRevision = 0;
  private surfaceWasVisible = false;
  private visibilityCheckPending = false;
  private returnAfterLoad = new WeakSet<WebContentsView>();
  private openingExternal = false;
  private reads = new Map<string, Promise<unknown>>();
  private generation = new Map<string, number>();
  private views = new Map<string, WebContentsView>();
  private activityCleanup = new Map<string, ReturnType<typeof keepWebPageActive>>();
  private statuses = new Map<
    string,
    { error: string; status: string; attention: boolean; observation: unknown; data: string }
  >();
  private acknowledgements = new Set<string>();
  private monitoringResets = new Set<string>();
  private deleting = new Set<string>();
  private definition: WebAccountDefinition;
  private uiURL: string;
  private source: string;
  private itemOpener?: string;
  private file: string;
  private initializing?: Promise<void>;
  private soundFailures = new Map<string, string>();
  private sounds: RegisteredSounds;
  private registeredSounds: string[] = [];
  private soundPoll?: ReturnType<typeof setInterval>;
  private avatars = new Map<
    string,
    { url: string; image: string; retryAt: number; abort?: AbortController }
  >();
  private themeChanged = () => this.changed();
  private unsubscribeSettings?: () => void;
  private displaysChanged = () => {
    if (this.background && !this.background.isDestroyed()) {
      const right = Math.max(...screen.getAllDisplays().map((d) => d.bounds.x + d.bounds.width));
      this.background.setPosition(right + 100, screen.getPrimaryDisplay().bounds.y);
    }
  };
  constructor(
    readonly id: string,
    readonly name: string,
    folder: string,
    readonly root: string,
    definition: WebAccountDefinition,
    private services: WebAccountServices = {
      capabilities: [],
      shortcut: () => false,
      failed: () => {},
    },
  ) {
    this.sounds = new RegisteredSounds(services.soundsDirectory || path.join(root, 'sounds'));
    this.definition = validateWebAccounts(folder, definition);
    this.uiURL = pathToFileURL(asset(folder, definition.ui)).href;
    this.source = fs.readFileSync(asset(folder, definition.observer), 'utf8');
    if (definition.itemOpener !== undefined)
      this.itemOpener = fs
        .readFileSync(asset(folder, definition.itemOpener), 'utf8')
        .trim()
        .replace(/;$/, '');
    this.file = path.join(root, 'accounts.json');
    fs.mkdirSync(root, { recursive: true });
    if (definition.accountGroup) {
      if (!services.sharedRoot) throw Error(hostText('services.webAccounts.sharedPathRequired'));
      this.group = getWebAccountGroup(
        definition.accountGroup.id,
        services.sharedRoot,
        path.resolve(root, '../..'),
        parseWebAccountSound,
      );
    } else if (fs.existsSync(path.join(root, 'group-binding.json')))
      throw Error(hostText('services.webAccounts.migrated'));
    if (!this.group?.hasMember(id) && fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const s = this.state;
      if (
        s.version !== 1 ||
        !Array.isArray(s.accounts) ||
        !s.accounts.length ||
        s.accounts.some(
          (a) =>
            !a ||
            !validId(a.id) ||
            typeof a.name !== 'string' ||
            !a.name.trim() ||
            a.name.length > 60,
        ) ||
        new Set(s.accounts.map((a) => a.id)).size !== s.accounts.length ||
        !s.accounts.some((a) => a.id === s.selected)
      )
        throw Error(hostText('services.webAccounts.readAccountsFailed'));
      for (const a of s.accounts) {
        if (a.temporaryName !== undefined && typeof a.temporaryName !== 'boolean')
          throw Error(hostText('services.webAccounts.readAliasesFailed'));
        if (a.sound !== undefined) parseWebAccountSound(a.sound);
        if (a.monitoring !== undefined && typeof a.monitoring !== 'boolean')
          throw Error(hostText('services.webAccounts.readMonitoringFailed'));
      }
    } else if (!this.group) {
      const id = randomUUID();
      this.state = {
        version: 1,
        accounts: [{ id, name: temporaryAccountName, temporaryName: true }],
        selected: id,
      };
      this.save(this.state);
    } else this.state = { version: 1, selected: '', accounts: [] };
    if (this.group) {
      this.group.connect(id, this.state.accounts.length ? this.state : undefined);
      this.state = this.group.snapshot(id);
      this.unsubscribeGroup = this.group.subscribe({
        changed: () => this.syncGroup(),
        removing: (accountId) => {
          this.deleting.add(accountId);
          this.dropView(accountId);
        },
        failed: () => this.services.failed(hostText('services.webAccounts.syncFailed')),
      });
    }
    nativeTheme.on('updated', this.themeChanged);
    this.unsubscribeSettings = this.services.onSettingsChanged?.(() => this.changed());
    screen.on('display-added', this.displaysChanged);
    screen.on('display-removed', this.displaysChanged);
    screen.on('display-metrics-changed', this.displaysChanged);
    if (!ipcInstalled) {
      ipcInstalled = true;
      ipcMain.handle('web-account:invoke', async (event, method: string, ...args: unknown[]) => {
        const c = [...controllers.values()].find((c) => c.uiContents === event.sender);
        if (
          !c ||
          c.disposed ||
          event.senderFrame !== event.sender.mainFrame ||
          event.senderFrame.url !== c.uiURL
        )
          throw Error('Untrusted Web account IPC source');
        return c.invoke(method, args);
      });
    }
  }
  private save(next: Saved) {
    if (this.group) {
      this.group.update(this.id, next);
      return;
    }
    atomicWrite(this.file, JSON.stringify(next, null, 2));
    this.state = next;
    this.changed();
  }
  settingsRoster(expected?: { root: string; groupId?: string }) {
    if (
      expected &&
      (path.resolve(expected.root) !== path.resolve(this.root) ||
        expected.groupId !== this.definition.accountGroup?.id)
    )
      throw new WebAccountRosterError('UNAVAILABLE');
    if (this.group) return this.group.settingsRoster(this.id, this.file);
    return new WebAccountRoster(this.file, {
      bindingFile: path.join(this.root, 'group-binding.json'),
      check: (raw) => {
        if (this.disposed || this.deleting.size) throw new WebAccountRosterError('UNAVAILABLE');
        if (JSON.stringify(raw) !== JSON.stringify(this.state))
          throw new WebAccountRosterError('REVISION_CONFLICT');
      },
      applied: (raw) => {
        this.state = raw as Saved;
        this.changed();
      },
    });
  }
  private syncGroup() {
    if (this.disposed || !this.group) return;
    const next = this.group.snapshot(this.id);
    for (const id of this.views.keys())
      if (!next.accounts.some((a) => a.id === id)) this.dropView(id);
    this.state = next;
    this.deleting.clear();
    if (this.group.removingId) this.deleting.add(this.group.removingId);
    if (this.initializing)
      for (const a of next.accounts) if (!this.deleting.has(a.id)) this.view(a.id);
    if (
      next.selected &&
      !this.deleting.has(next.selected) &&
      this.attached !== this.views.get(next.selected)
    )
      this.show(next.selected);
    this.changed();
  }
  private dropView(id: string) {
    const view = this.views.get(id);
    if (view) {
      this.contentView?.removeChildView(view);
      this.background?.contentView.removeChildView(view);
      if (this.attached === view) this.attached = undefined;
    }
    this.activityCleanup.get(id)?.dispose();
    this.activityCleanup.delete(id);
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    this.views.delete(id);
    this.avatars.get(id)?.abort?.abort();
    this.avatars.delete(id);
    this.generation.set(id, (this.generation.get(id) ?? 0) + 1);
    this.reads.delete(id);
    this.statuses.delete(id);
    this.acknowledgements.delete(id);
    this.monitoringResets.delete(id);
  }
  private changed() {
    if (this.uiContents && !this.uiContents.isDestroyed())
      this.uiContents.send('web-account:changed');
  }
  private account(id: unknown) {
    const a = this.state.accounts.find((a) => a.id === id);
    if (!a || this.deleting.has(a.id)) throw Error(hostText('services.webAccounts.missing'));
    return a;
  }
  private accountSession(id: string) {
    return session.fromPath(
      this.group ? this.group.sessionPath(id) : path.join(this.root, 'sessions', id),
    );
  }
  private updateAccountName(id: string, raw: unknown) {
    const a = this.account(id);
    const temporary =
      a.temporaryName ?? (a.name === temporaryAccountName || /^アカウント [1-9]\d?$/.test(a.name));
    if (
      !temporary ||
      typeof raw !== 'string' ||
      !raw.trim() ||
      raw.length > 60 ||
      /[\u0000-\u001f\u007f]/.test(raw)
    )
      return;
    this.save({
      ...this.state,
      accounts: this.state.accounts.map((item) =>
        item.id === id ? { ...item, name: raw.trim(), temporaryName: false } : item,
      ),
    });
  }
  private updateAvatar(id: string, raw: unknown) {
    const url = webAvatarURL(raw, this.definition.avatarOrigins ?? []);
    const previous = this.avatars.get(id);
    if (!url) {
      if (previous) {
        previous.abort?.abort();
        this.avatars.delete(id);
        this.changed();
      }
      return;
    }
    if (
      previous?.url === url &&
      (previous.image || previous.abort || previous.retryAt > Date.now())
    )
      return;
    previous?.abort?.abort();
    const abort = new AbortController();
    const entry = {
      url,
      image: '',
      retryAt: Date.now() + 60000,
      abort: abort as AbortController | undefined,
    };
    this.avatars.set(id, entry);
    if (previous?.image) this.changed();
    const timer = setTimeout(() => abort.abort(), 5000);
    void (async () => {
      try {
        const bytes = await fetchWebAvatar(
          url,
          this.definition.avatarOrigins ?? [],
          (url) =>
            webAvatarResponse(abort.signal, () =>
              net.request({
                url,
                session: this.accountSession(id),
                // Match the signed-in header image in this account's own session.
                credentials: 'include',
                redirect: 'manual',
              }),
            ),
          abort.signal,
        );
        const image = nativeImage.createFromBuffer(bytes);
        const size = image.getSize();
        if (image.isEmpty() || size.width > 4096 || size.height > 4096) return;
        const png = image.resize({ width: 64, height: 64 }).toPNG();
        if (
          png.length > 65536 ||
          this.disposed ||
          this.deleting.has(id) ||
          this.avatars.get(id) !== entry
        )
          return;
        entry.image = 'data:image/png;base64,' + png.toString('base64');
        this.changed();
      } catch {
        /* Avatar failure must not interrupt monitoring or login. */
      } finally {
        clearTimeout(timer);
        entry.abort = undefined;
      }
    })();
  }
  private bindShortcuts(wc: Electron.WebContents) {
    wc.on('before-input-event', (event, input) => {
      if (
        !this.disposed &&
        this.surface?.visible &&
        this.window?.isVisible() &&
        !this.window.isMinimized() &&
        this.window.isFocused() &&
        safePageShortcut(input) &&
        this.services.shortcut(input)
      )
        event.preventDefault();
    });
  }
  private requireCapability(capability: string) {
    if (!this.services.capabilities.includes(capability))
      throw Error(
        hostText('services.webAccounts.capabilityRequired', { capability: String(capability) }),
      );
  }
  private async sound(id: unknown, sound: unknown) {
    this.requireCapability('audio');
    const a = this.account(id);
    const parsed = parseWebAccountSound(sound);
    if (parsed.file) {
      if (path.isAbsolute(parsed.file)) parsed.file = await this.sounds.add(parsed.file);
      else parsed.file = path.basename(await this.sounds.resolve(parsed.file));
    }
    delete parsed.name;
    await this.refreshSounds();
    if (this.disposed) return;
    this.account(a.id);
    this.soundFailures.delete(a.id);
    this.save({
      ...this.state,
      accounts: this.state.accounts.map((item) =>
        item.id === a.id ? { ...item, sound: parsed } : item,
      ),
    });
  }
  private async refreshSounds() {
    const files = await this.sounds.list();
    if (this.disposed) return;
    if (JSON.stringify(files) !== JSON.stringify(this.registeredSounds)) {
      this.registeredSounds = files;
      this.changed();
    }
  }
  async cycle(direction: unknown) {
    if (this.disposed) throw Error('Web accounts are closed');
    if (direction !== 1 && direction !== -1) throw Error('Invalid account direction');
    const accounts = this.state.accounts.filter((a) => !this.deleting.has(a.id));
    if (!accounts.length) return;
    const index = accounts.findIndex((a) => a.id === this.state.selected);
    const next = accounts[(Math.max(0, index) + direction + accounts.length) % accounts.length];
    // Transfer input only inside the already-active mail window. Commands from
    // another app must keep that app's focus, including hidden/minimized mail.
    const transferInput =
      this.surface?.visible &&
      this.window?.isFocused() &&
      this.window.isVisible() &&
      !this.window.isMinimized() &&
      this.attached?.webContents.isFocused();
    this.save({ ...this.state, selected: next.id });
    this.show(next.id);
    if (
      transferInput &&
      this.window?.isFocused() &&
      this.attached &&
      this.contentView?.children.includes(this.attached)
    )
      this.attached.webContents.focus();
  }
  private backgroundWindow() {
    if (!this.background) {
      // A never-shown parent advances rAF but suppresses first-contentful-paint.
      // Start native painting outside every display without taking focus.
      this.background = new BrowserWindow({
        ...this.backgroundSize,
        useContentSize: true,
        show: false,
        skipTaskbar: true,
        focusable: false,
        frame: false,
        hasShadow: false,
        opacity: 0,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
          backgroundThrottling: false,
          partition: 'web-account-background-' + this.id,
        },
      });
      this.displaysChanged();
      this.background.showInactive();
    }
    return this.background;
  }
  private park(view: WebContentsView) {
    this.contentView?.removeChildView(view);
    const background = this.backgroundWindow();
    if (!background.contentView.children.includes(view)) background.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, ...this.backgroundSize });
    view.setVisible(true);
  }
  snapshot(includeData = true): WebAccountSnapshot {
    return {
      ...(includeData && this.definition.accountGroup
        ? { group: this.definition.accountGroup }
        : {}),
      navigationRevision: this.navigationRevision ?? 0,
      dark: nativeTheme?.shouldUseDarkColors ?? true,
      ...(includeData ? { registeredSounds: this.registeredSounds } : {}),
      ...(includeData && this.services?.settings ? { settings: this.services.settings() } : {}),
      selected: this.state.selected,
      accounts: this.state.accounts.map((a) => {
        const wc = this.views.get(a.id)?.webContents;
        const status = this.statuses.get(a.id);
        let url = this.definition.url;
        if (wc && !wc.isDestroyed()) {
          // OAuth queries/fragments must not reach the local UI or diagnostics.
          try {
            const u = new URL(wc.getURL());
            url =
              u.origin === this.definition.observeOrigin
                ? u.origin + u.pathname + u.hash
                : u.origin;
          } catch {}
        }
        return {
          ...a,
          monitoring: a.monitoring !== false,
          avatar: includeData ? (this.avatars?.get(a.id)?.image ?? '') : '',
          url,
          loading: !!wc && !wc.isDestroyed() && wc.isLoading(),
          error: status?.error ?? '',
          canGoBack: !!wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack(),
          canGoForward: !!wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward(),
          observation: status?.observation ?? null,
          status: status?.status ?? hostText('services.webAccounts.waitingInbox'),
          attention: status?.attention ?? false,
          data: includeData ? JSON.parse(status?.data ?? 'null') : null,
          sound: this.soundFailures.has(a.id)
            ? { enabled: false, file: '' }
            : (a.sound ?? { enabled: false, file: '' }),
          soundError: this.soundFailures.get(a.id),
        };
      }),
    };
  }
  private async outside(raw: string) {
    if (!this.window || this.disposed || this.openingExternal) return;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password)
      return;
    this.openingExternal = true;
    try {
      const key = this.definition.externalLinkSetting;
      const canRemember =
        !!key &&
        this.services.capabilities.includes('settings') &&
        !!this.services.setSetting &&
        typeof this.services.settings?.()[key] === 'boolean';
      if (canRemember && this.services.settings?.()[key!] === true) {
        await shell.openExternal(url.href);
        return;
      }
      const result = await dialog.showMessageBox(this.window, {
        type: 'question',
        title: hostText('services.webAccounts.externalTitle'),
        message: hostText('services.webAccounts.externalConfirmation'),
        detail: url.protocol === 'mailto:' ? hostText('services.webAccounts.mailLink') : url.origin,
        buttons: [hostText('services.webAccounts.cancel'), hostText('services.webAccounts.open')],
        defaultId: 0,
        cancelId: 0,
        ...(canRemember
          ? {
              checkboxLabel: hostText('services.webAccounts.rememberChoice'),
              checkboxChecked: false,
            }
          : {}),
      });
      if (!this.disposed && result.response === 1) {
        if (canRemember && result.checkboxChecked) this.services.setSetting!(key, true);
        await shell.openExternal(url.href);
      }
    } catch {
      if (!this.disposed) this.services.failed(hostText('services.webAccounts.externalOpenFailed'));
    } finally {
      this.openingExternal = false;
    }
  }
  async navigate(action: unknown) {
    if (!['back', 'forward', 'reload', 'inbox'].includes(action as string))
      throw Error('Invalid navigation action');
    await this.start();
    if (this.disposed) throw Error(hostText('services.webAccounts.stopped'));
    if (!this.state.selected) return;
    const wc = this.view(this.state.selected).webContents;
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward())
      wc.navigationHistory.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'inbox') await wc.loadURL(this.definition.url);
    this.navigationRevision++;
    this.changed();
  }
  private view(id: string): WebContentsView {
    this.account(id);
    const existing = this.views.get(id);
    if (existing && !existing.webContents.isDestroyed()) return existing;
    const ses = this.accountSession(id);
    ses.setSpellCheckerEnabled(false);
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    registerDisplayZoom(view.webContents);
    this.park(view);
    this.views.set(id, view);
    this.statuses.set(id, {
      error: '',
      status: hostText('services.webAccounts.waitingInbox'),
      attention: false,
      observation: null,
      data: 'null',
    });
    const wc = view.webContents;
    this.activityCleanup.get(id)?.dispose();
    this.activityCleanup.delete(id);
    if (this.definition.keepActive)
      this.activityCleanup.set(
        id,
        keepWebPageActive(wc, this.definition.observeOrigin, () =>
          this.services.failed(hostText('services.webAccounts.activationFailed')),
        ),
      );
    this.bindShortcuts(wc);
    const allowed = (url: string) => allowedWebNavigation(url, this.definition.origins);
    wc.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) void wc.loadURL(url).catch(() => {});
      else void this.outside(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (!allowed(url)) {
        event.preventDefault();
        void this.outside(url);
      }
    });
    wc.on('will-redirect', (event) => {
      if (event.isMainFrame && !allowed(event.url)) {
        event.preventDefault();
        this.statuses.get(id)!.error = hostText('services.webAccounts.unsupportedOrigin', {
          origin: String(new URL(event.url).origin),
        });
        this.changed();
      }
    });
    const invalidate = () => {
      this.generation.set(id, (this.generation.get(id) ?? 0) + 1);
      const s = this.statuses.get(id);
      if (s) s.observation = null;
    };
    wc.on('did-start-navigation', (event) => {
      if (!event.isMainFrame) return;
      invalidate();
      const s = this.statuses.get(id);
      if (s) {
        s.error = '';
        s.status = hostText('services.webAccounts.waitingInbox');
      }
      this.changed();
    });
    wc.on('did-stop-loading', () => {
      this.changed();
      if (this.returnAfterLoad.delete(view)) void this.returnHiddenViewToStart(view);
    });
    wc.on('did-navigate', () => this.changed());
    wc.on('did-navigate-in-page', () => this.changed());
    wc.on('did-fail-load', (_event, code, _description, _url, main) => {
      if (main && code !== -3) {
        invalidate();
        this.statuses.get(id)!.error = hostText('services.webAccounts.loadFailed', {
          code: String(code),
        });
        this.changed();
      }
    });
    wc.on('render-process-gone', () => {
      invalidate();
      this.statuses.get(id)!.error = hostText('services.webAccounts.rendererStopped');
      this.changed();
    });
    void wc.loadURL(this.definition.url).catch(() => {});
    return view;
  }
  async start() {
    if (this.disposed) throw Error('Web accounts are closed');
    if (!this.initializing)
      this.initializing = (async () => {
        let changed = false;
        const originalSounds = new Map(
          this.state.accounts.map((a) => [a.id, JSON.stringify(a.sound)]),
        );
        const accounts = [] as Saved['accounts'];
        for (const a of this.state.accounts) {
          let next = a;
          if (a.sound?.file && path.isAbsolute(a.sound.file)) {
            try {
              const file = await this.sounds.add(
                a.sound.file,
                a.sound.name || path.basename(a.sound.file),
              );
              next = {
                ...a,
                sound: { enabled: a.sound.enabled, file },
              };
              changed = true;
            } catch {
              this.soundFailures.set(a.id, hostText('services.webAccounts.soundCopyFailed'));
              this.services.failed(hostText('services.webAccounts.soundCopyFailed'));
            }
          }
          accounts.push(next);
        }
        if (!this.disposed && changed)
          this.save({
            ...this.state,
            accounts: this.state.accounts.map((current) => {
              const migrated = accounts.find((a) => a.id === current.id);
              return migrated && JSON.stringify(current.sound) === originalSounds.get(current.id)
                ? { ...current, ...(migrated.sound ? { sound: migrated.sound } : {}) }
                : current;
            }),
          });
      })();
    await this.initializing;
    if (this.disposed) return;
    await this.refreshSounds();
    if (!this.soundPoll)
      this.soundPoll = setInterval(() => {
        void this.refreshSounds().catch(() => {});
      }, 2000);
    for (const a of this.state.accounts) if (!this.deleting.has(a.id)) this.view(a.id);
  }
  private async returnHiddenViewToStart(view: WebContentsView) {
    const key = this.definition.returnToStartOnHideSetting;
    if (this.disposed || !key || this.services.settings?.()[key] !== true) return;
    if (this.surface?.visible && this.attached === view) return;
    const wc = view.webContents;
    if (wc.isDestroyed()) return;
    if (wc.isLoadingMainFrame()) {
      this.returnAfterLoad.add(view);
      return;
    }
    const start = new URL(this.definition.url);
    let current: URL;
    try {
      current = new URL(wc.getURL());
    } catch {
      return;
    }
    // Only change a settled service document's route. Authentication and other
    // documents must keep their URL, input and navigation unchanged.
    if (current.origin !== start.origin || current.pathname !== start.pathname) return;
    if (current.hash === start.hash) return;
    try {
      await wc.executeJavaScriptInIsolatedWorld(1001, [
        {
          code: `(() => {
          const start = new URL(${JSON.stringify(this.definition.url)});
          if (location.origin !== start.origin || location.pathname !== start.pathname) return;
          if (location.hash !== start.hash) location.hash = start.hash;
        })()`,
        },
      ]);
    } catch {
      if (!this.disposed && !wc.isDestroyed())
        this.services.failed(hostText('services.webAccounts.returnHomeFailed'));
    }
  }
  private checkSurfaceVisibility() {
    if (this.visibilityCheckPending || this.disposed) return;
    this.visibilityCheckPending = true;
    // Coalesce layout callbacks while moving the same surface between hosts.
    queueMicrotask(() => {
      this.visibilityCheckPending = false;
      if (this.disposed) return;
      const visible = this.surface?.visible === true;
      const hidden = this.surfaceWasVisible && !visible;
      this.surfaceWasVisible = visible;
      if (
        hidden &&
        this.definition.returnToStartOnHideSetting &&
        this.services.settings?.()[this.definition.returnToStartOnHideSetting] === true
      ) {
        if (this.attached) void this.returnHiddenViewToStart(this.attached);
        this.navigationRevision++;
        this.changed();
      }
    });
  }
  private layout() {
    this.checkSurfaceVisibility();
    if (!this.window || !this.attached) return;
    const { width: w, height: h } = this.surface!.size;
    const zoom = this.surface!.ui.webContents.getZoomFactor();
    const logical = this.viewport ?? {
      x: 236,
      y: 146,
      width: w / zoom - 236,
      height: h / zoom - 146,
    };
    const area = {
      x: Math.round(logical.x * zoom),
      y: Math.round(logical.y * zoom),
      width: Math.round(logical.width * zoom),
      height: Math.round(logical.height * zoom),
    };
    const visible = this.surface!.visible && this.viewport !== null && area.x < w && area.y < h;
    if (!visible) {
      this.park(this.attached);
      return;
    }
    this.backgroundSize = {
      width: Math.max(1, Math.min(area.width, w - area.x)),
      height: Math.max(1, Math.min(area.height, h - area.y)),
    };
    this.backgroundWindow().setContentSize(this.backgroundSize.width, this.backgroundSize.height);
    for (const child of this.backgroundWindow().contentView.children)
      child.setBounds({ x: 0, y: 0, ...this.backgroundSize });
    this.backgroundWindow().contentView.removeChildView(this.attached);
    if (!this.contentView!.children.includes(this.attached))
      this.contentView!.addChildView(this.attached);
    this.attached.setVisible(true);
    this.attached.setBounds({
      x: area.x,
      y: area.y,
      width: Math.max(1, Math.min(area.width, w - area.x)),
      height: Math.max(1, Math.min(area.height, h - area.y)),
    });
    this.surface?.updatePaletteBlur();
  }
  private show(id: string) {
    if (!this.window) return;
    const next = this.view(id);
    const previous = this.attached;
    if (previous) this.park(previous);
    this.attached = next;
    if (previous && previous !== next && this.surface?.visible)
      void this.returnHiddenViewToStart(previous);
    this.layout();
    this.changed();
  }
  async open() {
    if (this.disposed) throw Error('Web accounts are closed');
    if (this.opening) return this.opening;
    if (this.surface) {
      await this.surface.open();
      return;
    }
    this.opening = this.openWindow().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }
  private async openWindow() {
    await this.start();
    if (this.disposed) return;
    const page = this.services.page;
    this.surface = new AppletSurface({
      appletId: this.id,
      key: page ? pageKey(this.id, page.id) : undefined,
      title: page?.title ?? this.name,
      url: this.uiURL,
      preload: path.resolve(__dirname, '../web-account-preload.js'),
      stateFile: path.join(this.root, 'window-state.json'),
      defaultDisplay: page?.defaultDisplay,
      partition: 'web-account-ui-' + this.id,
      onLayout: () => this.layout(),
      onCreated: (contents) => this.bindShortcuts(contents),
    });
    try {
      await this.surface.open();
      if (!this.disposed && this.state.selected) this.show(this.state.selected);
    } catch {
      this.surface?.close();
      this.surface = undefined;
      throw Error(hostText('services.webAccounts.openFailed'));
    }
  }
  private async invoke(method: string, args: unknown[]) {
    switch (method) {
      case 'viewport':
        this.viewport = parseWebViewport(args[0]);
        this.layout();
        return;
      case 'snapshot':
        return this.snapshot();
      case 'setSetting':
        if (!this.services.capabilities.includes('settings') || !this.services.setSetting)
          throw Error(hostText('services.webAccounts.settingsForbidden'));
        this.services.setSetting(args[0], args[1]);
        return;
      case 'add': {
        const id = randomUUID();
        this.save({
          ...this.state,
          accounts: [
            ...this.state.accounts,
            { id, name: temporaryAccountName, temporaryName: true },
          ],
          selected: id,
        });
        this.show(id);
        return;
      }
      case 'select': {
        const a = this.account(args[0]);
        this.save({ ...this.state, selected: a.id });
        this.show(a.id);
        return;
      }
      case 'move': {
        const a = this.account(args[0]),
          direction = args[1];
        if (direction !== 1 && direction !== -1) throw Error('Invalid account direction');
        const accounts = [...this.state.accounts];
        const index = accounts.findIndex((item) => item.id === a.id),
          next = index + direction;
        if (next < 0 || next >= accounts.length) return;
        if (this.deleting.has(accounts[next].id))
          throw Error(hostText('services.webAccounts.deletionPending'));
        [accounts[index], accounts[next]] = [accounts[next], accounts[index]];
        this.save({ ...this.state, accounts });
        return;
      }
      case 'setMonitoring': {
        const a = this.account(args[0]),
          monitoring = args[1];
        if (typeof monitoring !== 'boolean') throw Error('Invalid account monitoring setting');
        if ((a.monitoring !== false) === monitoring) return;
        this.save({
          ...this.state,
          accounts: this.state.accounts.map((item) =>
            item.id === a.id ? { ...item, monitoring } : item,
          ),
        });
        const status = this.statuses.get(a.id);
        if (status) {
          status.attention = false;
          status.data = 'null';
          status.status = monitoring
            ? hostText('services.webAccounts.resuming')
            : hostText('services.webAccounts.monitorOff');
        }
        // A worker can miss a rapid OFF/ON between reads. Explicitly reset its
        // baseline on either transition, independently of display clearing.
        this.monitoringResets.add(a.id);
        this.changed();
        return;
      }
      case 'rename': {
        const a = this.account(args[0]);
        let name: string;
        try {
          name = webAccountName(args[1]);
        } catch {
          throw Error(hostText('services.webAccounts.invalidName'));
        }
        const roster = this.settingsRoster(),
          current = roster.publicConfiguration();
        roster
          .planPublicConfiguration(
            current.accounts.map((item) => (item.id === a.id ? { ...item, name } : item)),
            current.revision,
          )
          .commit();
        return;
      }
      case 'acknowledge':
        this.acknowledgements.add(this.account(args[0]).id);
        return;
      case 'cycle':
        return this.cycle(args[0]);
      case 'setSound':
        await this.sound(args[0], args[1]);
        return;
      case 'pickSound': {
        this.requireCapability('file-dialog');
        this.requireCapability('audio');
        const a = this.account(args[0]);
        const result = await dialog.showOpenDialog(this.window!, {
          title: hostText('services.webAccounts.soundTitle'),
          properties: ['openFile'],
          filters: [{ name: 'WAV', extensions: ['wav'] }],
        });
        if (!this.disposed && !this.deleting.has(a.id) && !result.canceled && result.filePaths[0])
          await this.sound(a.id, {
            ...(this.account(a.id).sound ?? { enabled: false }),
            file: result.filePaths[0],
            name: undefined,
          });
        return;
      }
      case 'testSound': {
        this.requireCapability('audio');
        const a = this.account(args[0]);
        queueSound(
          a.sound?.file ? await this.sounds.resolve(a.sound.file) : '',
          () =>
            !this.disposed &&
            this.state.accounts.some((item) => item.id === a.id) &&
            !this.deleting.has(a.id),
          () => this.services.failed(hostText('services.webAccounts.soundPlaybackFailed')),
        );
        return;
      }
      case 'openItem': {
        const a = this.account(args[0]);
        const key = serializeWebItemKey(args[1]);
        if (!this.itemOpener) return false;
        this.save({ ...this.state, selected: a.id });
        this.show(a.id);
        const wc = this.view(a.id).webContents;
        if (wc.isLoading() || new URL(wc.getURL()).origin !== this.definition.observeOrigin)
          return false;
        // Only the bundled function runs, with a JSON string argument, in the
        // same bridge-free isolated world as observation. Never accept UI code.
        const opened = await wc.executeJavaScriptInIsolatedWorld(
          1001,
          [{ code: `(${this.itemOpener})(${key})` }],
          true,
        );
        return !this.disposed && !this.deleting.has(a.id) && opened === true;
      }
      case 'navigate': {
        return this.navigate(args[0]);
      }
      case 'remove': {
        const a = this.account(args[0]);
        if (this.state.accounts.length < 2) throw Error(hostText('services.webAccounts.keepLast'));
        if (this.group) {
          const before = JSON.stringify(this.state.accounts.map(({ id, name }) => ({ id, name })));
          const result = await dialog.showMessageBox(this.window!, {
            type: 'warning',
            title: hostText('services.webAccounts.sharedDeleteTitle'),
            message: hostText('services.webAccounts.sharedDeleteConfirmation', {
              name: String(a.name),
              group: String(this.definition.accountGroup!.title),
            }),
            detail: hostText('services.webAccounts.sharedDeleteDetails'),
            buttons: [
              hostText('services.webAccounts.cancel'),
              hostText('services.webAccounts.delete'),
            ],
            defaultId: 0,
            cancelId: 0,
          });
          if (this.disposed || result.response !== 1) return;
          if (before !== JSON.stringify(this.state.accounts.map(({ id, name }) => ({ id, name }))))
            throw Error(hostText('services.webAccounts.changedDuringConfirmation'));
          await this.group.remove(a.id, async () => {
            const ses = this.accountSession(a.id);
            await ses.clearStorageData();
            await ses.clearCache();
            await ses.cookies.flushStore();
          });
          return;
        }
        this.deleting.add(a.id);
        try {
          const result = await dialog.showMessageBox(this.window!, {
            type: 'warning',
            title: hostText('services.webAccounts.deleteTitle'),
            message: hostText('services.webAccounts.deleteConfirmation', { name: String(a.name) }),
            detail: hostText('services.webAccounts.deleteDetails'),
            buttons: [
              hostText('services.webAccounts.cancel'),
              hostText('services.webAccounts.delete'),
            ],
            defaultId: 0,
            cancelId: 0,
          });
          if (this.disposed || result.response !== 1) return;
          if (this.state.accounts.length < 2)
            throw Error(hostText('services.webAccounts.keepLastSimple'));
          const view = this.views.get(a.id);
          if (view && this.attached === view) {
            this.contentView!.removeChildView(view);
            this.attached = undefined;
          }
          if (view) this.background?.contentView.removeChildView(view);
          this.activityCleanup.get(a.id)?.dispose();
          this.activityCleanup.delete(a.id);
          if (view && !view.webContents.isDestroyed()) view.webContents.close();
          this.views.delete(a.id);
          this.avatars.get(a.id)?.abort?.abort();
          this.avatars.delete(a.id);
          this.monitoringResets.delete(a.id);
          this.statuses.delete(a.id);
          this.acknowledgements.delete(a.id);
          const ses = this.accountSession(a.id);
          await ses.clearStorageData();
          await ses.clearCache();
          await ses.cookies.flushStore();
          const accounts = this.state.accounts.filter((item) => item.id !== a.id);
          this.save({
            ...this.state,
            accounts,
            selected: this.state.selected === a.id ? accounts[0].id : this.state.selected,
          });
          this.show(this.state.selected);
        } finally {
          this.deleting.delete(a.id);
        }
        return;
      }
      default:
        throw Error('Unknown Web account action');
    }
  }
  async read() {
    await this.start();
    // Sequential reads keep the IPC response bounded and avoid parallel DOM scans.
    for (const a of this.state.accounts) {
      if (this.disposed || this.deleting.has(a.id)) continue;
      const wc = this.views.get(a.id)?.webContents,
        status = this.statuses.get(a.id);
      if (!wc || wc.isDestroyed() || !status) continue;
      if (wc.isLoadingMainFrame() || status.error) {
        status.observation = null;
        continue;
      }
      let origin = '';
      try {
        origin = new URL(wc.getURL()).origin;
      } catch {}
      if (origin !== this.definition.observeOrigin) {
        this.updateAvatar(a.id, null);
        status.observation = null;
        status.status = hostText('services.webAccounts.loginRequired');
        continue;
      }
      const generation = this.generation.get(a.id);
      const url = wc.getURL();
      try {
        let read = this.reads.get(a.id);
        if (!read) {
          // Applet-owned source runs in an isolated world; remote pages receive no host bridge.
          read = wc.executeJavaScriptInIsolatedWorld(1001, [{ code: this.source }]);
          this.reads.set(a.id, read);
          void read
            .finally(() => {
              if (this.reads.get(a.id) === read) this.reads.delete(a.id);
            })
            .catch(() => {});
        }
        const timedOut = Symbol('timeout');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          read,
          new Promise<symbol>((resolve) => {
            timer = setTimeout(() => resolve(timedOut), 800);
          }),
        ]).finally(() => clearTimeout(timer));
        if (result === timedOut) {
          status.observation = null;
          status.status = hostText('services.webAccounts.waitingResponse');
          continue;
        }
        if (
          this.disposed ||
          this.deleting.has(a.id) ||
          wc.isDestroyed() ||
          wc.getURL() !== url ||
          this.generation.get(a.id) !== generation
        )
          continue;
        if (Buffer.byteLength(JSON.stringify(result ?? null)) > 60000)
          throw Error('Observation too large');
        status.observation = result;
        this.updateAccountName(
          a.id,
          result && typeof result === 'object' && 'accountName' in result
            ? result.accountName
            : null,
        );
        this.updateAvatar(
          a.id,
          result && typeof result === 'object' && 'avatar' in result ? result.avatar : null,
        );
        if (result && typeof result === 'object' && 'ready' in result && result.ready === true)
          this.activityCleanup.get(a.id)?.ready();
      } catch {
        status.observation = null;
        status.status = hostText('services.webAccounts.waitingAnalysis');
      }
    }
    const acknowledged = [...this.acknowledgements];
    this.acknowledgements.clear();
    // Reports belong to the local UI, not the worker that produced them. Avoid
    // duplicating ten accounts' histories in the bounded 1 MB JSON-RPC response.
    const monitoringResets = [...this.monitoringResets];
    this.monitoringResets.clear();
    return { ...this.snapshot(false), acknowledged, monitoringResets };
  }
  report(id: string, status: string, attention: boolean, data?: unknown) {
    if (this.group && (this.deleting.has(id) || !this.state.accounts.some((a) => a.id === id)))
      return;
    const account = this.account(id);
    if (typeof status !== 'string' || status.length > 200 || typeof attention !== 'boolean')
      throw Error('Invalid Web account report');
    const s = this.statuses.get(id);
    if (account.monitoring === false) {
      status = hostText('services.webAccounts.monitorOff');
      attention = false;
      data = null;
    }
    const json = serializeWebReport(data);
    if (s && (s.status !== status || s.attention !== attention || s.data !== json)) {
      s.status = status;
      s.attention = attention;
      s.data = json;
      this.changed();
    }
  }
  async close() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.soundPoll);
    this.unsubscribeGroup?.();
    this.unsubscribeSettings?.();
    nativeTheme.removeListener('updated', this.themeChanged);
    screen.removeListener('display-added', this.displaysChanged);
    screen.removeListener('display-removed', this.displaysChanged);
    screen.removeListener('display-metrics-changed', this.displaysChanged);
    const ids = [...this.views.keys()];
    for (const avatar of this.avatars.values()) avatar.abort?.abort();
    this.avatars.clear();
    for (const activity of this.activityCleanup.values()) activity.dispose();
    this.activityCleanup.clear();
    for (const view of this.views.values())
      if (!view.webContents.isDestroyed()) view.webContents.close();
    this.views.clear();
    this.attached = undefined;
    this.surface?.close();
    this.surface = undefined;
    this.background?.destroy();
    this.background = undefined;
    await this.initializing?.catch(() => {});
    // Registered assets outlive accounts and may be used on another PC.
    await Promise.allSettled(
      ids.map(async (id) => {
        const ses = this.accountSession(id);
        ses.flushStorageData();
        await ses.cookies.flushStore();
      }),
    );
  }
}
export function getWebAccounts(
  id: string,
  name: string,
  folder: string,
  dataRoot: string,
  definition?: WebAccountDefinition,
  services?: WebAccountServices,
) {
  const existing = controllers.get(id);
  if (existing) return existing;
  if (!definition) throw Error(hostText('services.webAccounts.manifestRequired'));
  const controller = new WebAccountController(
    id,
    name,
    folder,
    path.join(dataRoot, 'web-accounts', id),
    definition,
    services,
  );
  controllers.set(id, controller);
  return controller;
}
export async function closeWebAccounts(id: string) {
  const c = controllers.get(id);
  controllers.delete(id);
  await c?.close();
}

/** Resolve a declared roster without constructing a controller, migrating or opening a page. */
export function webAccountSettingsRoster(
  id: string,
  definition: WebAccountDefinition,
  localRoot: string,
  sharedRoot: string,
) {
  const directory = path.join(localRoot, 'web-accounts', id);
  const controller = controllers.get(id);
  if (controller)
    return controller.settingsRoster({ root: directory, groupId: definition.accountGroup?.id });
  const file = path.join(directory, 'accounts.json');
  const group = definition.accountGroup;
  if (group) {
    const active = findWebAccountGroup(group.id, sharedRoot, localRoot);
    if (active) return active.settingsRoster(id, file);
  }
  return new WebAccountRoster(
    group ? path.join(sharedRoot, 'web-account-groups', group.id, 'accounts.json') : file,
    {
      bindingFile: path.join(directory, 'group-binding.json'),
      ...(group
        ? {
            group: {
              id: group.id,
              owner: id,
              legacyFile: file,
              stateFile: path.join(localRoot, 'web-account-groups', group.id, 'state.json'),
            },
          }
        : {}),
    },
  );
}

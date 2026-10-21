import { McpClientSettings, McpSettingsError } from './core/mcp-client-settings';
import {
  appearanceArguments,
  configureAppearance,
  registerAppearance,
  refreshAppearance,
} from './core/appearance-host';
import { resolveAppearance } from '../shared/appearance';
import { inputCommandType, normalizeInputKeys } from '../shared/input-command';
import { executionAuthorized, type ExecutionPermission } from './core/execution-permissions';
import { processCommandType } from '../shared/process-launch';
import { ProcessLaunchService, ProcessLaunchError, processLaunchSpec } from './core/process-launch';
import { McpClientService, type McpActor } from './core/mcp-client';
import { ShellProviderRegistry } from './core/shell-provider-registry';
import { isDeepStrictEqual } from 'node:util';
import { shellRegions, isShellRegion, type ShellRegion } from '../shared/shell';
import type { ExtensionSnapshot } from '../shared/contracts';
import type { SettingsPageDefinition } from '../shared/settings-catalog';
import type { SettingsPageAuxiliary } from '../shared/settings-page';
import type { AppletPackagePreviewResult } from '../shared/applet-packages';
import { ShellHost } from './core/shell-host';
import { ShellBarHost } from './core/shell-bar-host';
import { WindowBars } from './core/window-bars';
import { OverlayHost } from './core/overlay-host';
import { HostModalLayer } from './core/host-modal-layer';
import { HostPages } from './core/host-pages';
import { HomePageSession, HomeCommandExecution } from './core/home-page';
import { ImageLibraryPageSession, ImageLibraryPageState } from './core/image-library-page';
import { ImageLibraryDialogs } from './core/image-library-dialogs';
import { GalleryViewStateStore } from './core/gallery-view-state';
import { GalleryImages } from './core/gallery-images';
import { NotificationCenterController } from './core/notification-center';
import { publishUpdateResult } from './core/update-result-notification';
import { LogPageSession } from './core/log-page';
import { CommandPaletteSession } from './core/command-palette';
import type { CommandPaletteRequest } from '../shared/overlays';
import { NavigationCoordinator, UiPresentation } from './core/ui-presentation';
import { defaultShellId } from '../shared/shell';
import { NativeInput } from './core/native-input';
import {
  app,
  BrowserWindow,
  WebContentsView,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  dialog,
  nativeTheme,
  session,
  shell,
  protocol,
  net,
  screen,
  safeStorage,
  clipboard,
  powerMonitor,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SettingsConflictError } from './core/settings';
import { DeviceSettingsStore } from './core/device-settings-store';
import { deviceHostKeys, readDeviceCollections, readDeviceManifests } from './core/device-settings';
import { restoreSettingsCollections } from '../shared/settings-storage';
import { settingsPaths, appletSettingsPageId } from '../shared/settings-catalog';
import { recoverSettingsAtStartup, type SettingsRecoveryUi } from './core/settings-recovery';
import {
  SettingsHealthNotifications,
  settingsRestartReason,
} from './core/settings-health-notifications';
import { SettingsCommands } from './core/settings-commands';
import { SettingsInputSession } from './core/settings-input-session';
import { CustomCommandService, CustomCommandError } from './core/custom-commands';
import { mcpCommandType } from '../shared/mcp-command';
import type { InputInvocation } from './core/command-contexts';
import { SettingsPageSession } from './core/settings-page';
import { SettingsPageHost } from './core/settings-page-host';
import { dataPaths } from './core/data-paths';
import { RegisteredImages } from './core/registered-images';
import { ImageLibraryHost, decodeRegisteredImage, ownsImage } from './core/image-library-host';
import { stopRegisteredImageDecoder } from './core/registered-image-decoder';
import { coverAppletPagesForImagePicker } from './core/applet-pages';
import { imageReference } from '../shared/registered-images';
import { WindowsLaunch } from './core/windows-launch';
import { WindowStateStore, windowMinimum, restoreWindowBounds } from './core/window-state';
import { ExtensionManager } from './core/extensions';
import { PortableUpdates, type UpdateTarget } from './core/portable-updates';
import { execFileSync } from 'node:child_process';
import { HostLog } from './core/log';
import { createHostApi } from './core/host-api';
import { RibbonState } from './core/ribbon-state';
import { RibbonBadges } from './core/ribbon-badges';
import { RibbonGroupSession } from './core/ribbon-group-session';
import { RibbonCommands } from './core/ribbon-commands';
import { appletEnabled } from '../shared/applet-state';
import { validateAppletSettings } from '../shared/setting-definitions';
import { parseSettings } from '../shared/settings-schema';
import {
  getKeybindings,
  initializeExtensionDefaults,
  initializeCollectionDefaults,
  resolveKeybindings,
  safePageShortcut,
} from '../shared/keybindings';
import { ShortcutDispatcher } from './core/shortcut-dispatcher';
import { GestureManager, type GestureInvocation, type ShortcutPress } from './core/gestures';
import { initializeGestureDefaults } from '../shared/gestures';
import { normalizeShortcut } from '../shared/commands';
import { hostCommands, hostCommandsForApplets, shortcutFromEvent } from '../shared/commands';
import { settingsPageCommands } from '../shared/settings-navigation';
import { updateCommands } from '../shared/update-commands';
import { AppletManagement } from './core/applet-management';
import {
  appletManagementCommands,
  managedApplets,
  reorderManagedApplets,
} from '../shared/applet-management';
import { GlobalHotKeyManager, InputCaptureHotKeyBackend } from './core/global-hotkeys';
import { trayCommandGroups, withoutMissingSamples } from './core/tray-commands';
import {
  getTrayMenu,
  resolveTrayMenu,
  trayCommandCatalog,
  gesturePauseCommand,
  type ResolvedTrayItem,
} from '../shared/tray-menu';
import {
  DEFAULT_DOUBLE_CLICK_TIME_MS,
  TrayClickDispatcher,
  readDoubleClickTime,
} from './core/tray-clicks';
import type { HostSnapshot, Settings } from '../shared/contracts';
import { configureWindowRendering } from './core/window-rendering';
import { trayIdentity } from './core/tray-identity';
import { configureNotifications, activateNotification } from './core/notifications';
import {
  activeShortcutPage,
  configurePageHost,
  updatePageViewport,
  refreshPageDisplays,
  localPageSource,
} from './core/applet-pages';
import { pageDisplay, pageKey, defaultRibbon } from '../shared/applet-pages';
import { hostShortcutPage, shortcutPageChoices } from '../shared/shortcut-pages';
import { PageCollectionManager } from './core/page-collections';
import { WebProfileStore } from './core/web-profiles';
import { contained } from './core/extensions';
import { openLocalPage, pageHostShortcut } from './core/applet-pages';

import { orderApplets } from '../shared/applet-order';
import { TypedNotifications } from './core/typed-notifications';
import {
  notificationCatalog,
  validateNotificationPreferenceChanges,
} from '../shared/notification-types';
import { NotificationService } from './core/notification-service';
import { NotificationHistoryStore } from './core/notification-history';
import { NotificationSurfaceHost } from './core/notification-surface-host';
import { NotificationDesktopHost } from './core/notification-desktop-host';
import { NotificationWindowsAdapter } from './core/notification-windows-adapter';
import { NotificationSurfaceController } from './core/notification-surface-controller';

import { AutomationService } from './core/automation';
import { InformationReporter } from './core/information-reporter';
import { AppDockApi, AutomationError } from './core/appdock-api';
import { TtsService } from './core/tts-service';
import { AiService } from './core/ai-service';
import { AiSecrets } from './core/ai-secrets';
import { AiSettingsController } from './core/ai-settings';
import { ErrorReporter } from './core/error-reporter';
import { WarningReporter } from './core/warning-reporter';
import { LegacyLocalDataMonitor, inspectLegacyLocalData } from './core/legacy-local-data';
import { defaultAiSettings } from '../shared/ai';
import { TtsSecrets } from './core/tts-secrets';
import { playTtsWave } from './core/tts-player';
import { audioPlayback } from './core/audio-service';
import { notificationSounds } from './core/sounds';
import { NotificationSession } from './core/notification-session';
import { NotificationAvailability } from './core/notification-availability';
import { NativeNotificationState } from './core/native-notification-state';
import { NotificationSpeechService } from './core/notification-speech';
import { resolveNotificationSpeech } from '../shared/notification-types';
import { defaultTtsSettings } from '../shared/tts';
import { AppletApiAccess, callAppletApi } from './core/applet-api-access';
import { automationApplets, automationCommands } from './core/automation-commands';
import type { AutomationAction } from '../shared/automation';

configureWindowRendering(app);

protocol.registerSchemesAsPrivileged([
  { scheme: 'appdock', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const restoreView = process.argv.includes('--restore-view');
const hostDocumentUrl = `appdock://host/index.html${restoreView ? '?restoreView=1' : ''}`;
let startupReady = false;
let pendingNotificationArgs: string[] | undefined;
const smoke = process.argv.includes('--smoke-test');
const smokeDirectory = process.argv
  .find((a) => a.startsWith('--smoke-dir='))
  ?.slice('--smoke-dir='.length);
const testDirectory = process.argv
  .find((a) => a.startsWith('--test-profile='))
  ?.slice('--test-profile='.length);
const baseDirectory = testDirectory
  ? path.resolve(testDirectory)
  : smoke && smokeDirectory
    ? path.resolve(smokeDirectory)
    : app.isPackaged
      ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
      : app.getAppPath();
const isolatedLocal = process.argv
  .find((a) => a.startsWith('--test-local-state='))
  ?.slice('--test-local-state='.length);
const paths = dataPaths(
  baseDirectory,
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  testDirectory || smoke ? isolatedLocal || path.join(baseDirectory, 'data') : undefined,
);
const dataDirectory = paths.local;
const sharedDirectory = paths.shared;
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', path.join(dataDirectory, 'chromium'));
app.setAppUserModelId('at365.appdock');
const locked = app.requestSingleInstanceLock({ baseDirectory });
if (locked)
  configureNotifications(
    app.isPackaged
      ? process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe')
      : app.getPath('exe'),
    baseDirectory,
    [
      ...(app.isPackaged ? [] : [app.getAppPath()]),
      ...(testDirectory ? [`--test-profile=${baseDirectory}`] : []),
      ...(smoke && smokeDirectory ? ['--smoke-test', `--smoke-dir=${baseDirectory}`] : []),
    ],
  );
const deviceManifestRoots = () => [
  path.join(baseDirectory, 'extensions'),
  app.isPackaged
    ? path.join(process.resourcesPath, 'shells')
    : path.join(app.getAppPath(), 'out', 'shells'),
];
const deviceCollections = () => readDeviceCollections(deviceManifestRoots());
const settings = new DeviceSettingsStore(
  path.join(baseDirectory, 'settings.json'),
  dataDirectory,
  os.hostname(),
  deviceCollections,
  () => readDeviceManifests(deviceManifestRoots()),
);
const launch = new WindowsLaunch(
  app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe') : '',
  baseDirectory,
  testDirectory ? [`--test-profile=${baseDirectory}`] : [],
  undefined,
  undefined,
  {
    failed: () => settings.health.set('launch', 'launch-save-failed'),
    succeeded: () => settings.health.clear('launch'),
    changed: () => {
      settings.writesBlocked = settingsRecoveryBusy || launch.recoveryPending;
      settingsHealthNotifications?.refresh();
      changed();
    },
  },
  {
    file: path.join(dataDirectory, 'settings-transactions', 'launch.json'),
    desiredSaved: (next) =>
      settings.value.host.startAtLogon === next.startAtLogon &&
      settings.value.host.runAsAdministrator === next.runAsAdministrator,
  },
);
let settingsLoadError: Error | undefined;
if (locked) {
  try {
    settings.load();
    // Electron requires this before app.ready and before the renderer/GPU starts.
    if (!settings.value.host.hardwareAcceleration) app.disableHardwareAcceleration();
  } catch (error) {
    settingsLoadError = error instanceof Error ? error : new Error(String(error));
    app.disableHardwareAcceleration();
  }
}
const startupHardwareAcceleration = settings.value.host.hardwareAcceleration;
configureAppearance(
  () =>
    resolveAppearance(settings.value.host.accentColor, nativeTheme.shouldUseDarkColors, 0, {
      dark: settings.value.host.customAccentDark,
      light: settings.value.host.customAccentLight,
    }),
  ipcMain,
);
function applyAudioPlaybackSettings() {
  const enabled = settings.value.host.soundEnabled;
  audioPlayback.setEnabled(enabled);
  notificationSounds.setEnabled(enabled);
}
applyAudioPlaybackSettings();
let window: BrowserWindow | null = null;
let primaryWindowCreated = false;
let shellRegistry: ShellProviderRegistry | undefined;
const shellStateSent = new Map<string, string>();
let lastShellRevision = -1;
let notificationBanner: NotificationSurfaceHost | undefined;
let notificationDesktop: NotificationDesktopHost | undefined;
let notificationWindows: NotificationWindowsAdapter | undefined;
let notificationService: NotificationService | undefined;
let typedNotifications: TypedNotifications | undefined;
let settingsHealthNotifications: SettingsHealthNotifications | undefined;
let settingsRecoveryBusy = false;
const settingsOperationBusy = () => settingsRecoveryBusy || launch.isBusy;
let notificationSpeech: NotificationSpeechService | undefined;
let notificationAvailability: NotificationAvailability | undefined;
let notificationSession: NotificationSession | undefined;
const settingsInputFlushes = new Map<string, () => void>();
async function flushSettingsInputs() {
  if (!window || window.isDestroyed() || window.webContents.isLoading())
    throw Error('設定画面の準備中です。');
  const id = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      settingsInputFlushes.delete(id);
      reject(Error('設定入力の反映を確認できませんでした。もう一度お試しください。'));
    }, 3000);
    settingsInputFlushes.set(id, () => {
      clearTimeout(timer);
      settingsInputFlushes.delete(id);
      resolve();
    });
    window!.webContents.send('dock:flushSettingsInputs', id);
  });
}
let shellHost: ShellHost | undefined;
let shellBarHost: ShellBarHost | undefined;
let overlayHost: OverlayHost | undefined;
let hostModalLayer: HostModalLayer | undefined;
let hostPages: HostPages | undefined;
let imageLibraryDialogs: ImageLibraryDialogs | undefined;
let galleryViewState: GalleryViewStateStore;
let galleryImages: GalleryImages;
let settingsPageHost: SettingsPageHost | undefined;
let paletteSession: CommandPaletteSession | undefined;
let ribbonState: RibbonState | undefined;
const safeShell = process.argv.includes('--safe-shell');
const navigation = new NavigationCoordinator(
  () => changed(),
  async () => {
    await flushSettingsInputs();
  },
  (error) => log.write('error', 'navigation', String(error)),
);
const presentation = new UiPresentation({
  settings: () => (safeShell ? { ...settings.value, ribbon: defaultRibbon() } : settings.value),
  applets: () => (manager ? allApplets() : []),
  commands: () => (manager ? ribbonUiCommands() : hostCommands),
  dark: () => nativeTheme.shouldUseDarkColors,
  image: (ref, shape) => registeredImages.icon(ref, shape),
  navigation,
  execute: executeCommand,
  theme: toggleTheme,
  expanded: (id) => ribbonState?.isExpanded(id) ?? false,
  temporaryExpanded: (id) => overlayHost?.kind === 'ribbon-group' && overlayHost.sourceId === id,
  toggleGroup: (id) => {
    if (!ribbonState) throw Error('リボンは準備中です。');
    ribbonState.set(id, !ribbonState.isExpanded(id));
  },
  badge: (id) => ribbonBadges.get(id),
});
async function toggleTheme() {
  commitSettings(
    prepareSettings({
      ...settings.value,
      host: { ...settings.value.host, theme: nativeTheme.shouldUseDarkColors ? 'light' : 'dark' },
    }),
    settings.revision,
  );
  return { accepted: true, settingsSaved: true };
}
let tray: Tray | null = null;
let trayClicks: TrayClickDispatcher | undefined;
let manager: ExtensionManager;
const ribbonBadges = new RibbonBadges(
  (owner) => {
    const e = manager?.items.get(owner);
    if (
      !e ||
      !e.runtimeSession ||
      !['starting', 'running'].includes(e.state) ||
      settings.value.extensions[owner]?.enabled === false
    )
      return;
    return {
      generation: e.runtimeSession,
      ids: new Set([
        ...(e.manifest.pages ?? []).map((page) => `page:${owner}:${page.id}`),
        ...(e.dynamicPages ?? []).map((page) => `page:${owner}:${page.id}`),
        ...(pageCollections?.entries() ?? [])
          .filter((page) => page.binding.owner === owner && page.item.enabled)
          .map((page) => `page:${page.id}:main`),
      ]),
    };
  },
  () => changed(),
);
const settingsNavigation: import('../shared/settings-page').SettingsNavigationState = { query: '' };
const settingsEditing = new SettingsInputSession({
  current: () => settings.snapshot(),
  scope: (page) => settingsPageStorage(page).signature,
  applets: () => (manager ? allApplets() : []),
  save: async (value, revision, resetPage) => {
    assertSettingsWritable();
    const next = prepareSettings(value);
    return launch.save(
      next.host,
      settings.value.host,
      () => settings.assertRevision(revision),
      () => commitSettings(next, revision, resetPage),
    );
  },
  changed: () => {
    if (window && !window.isDestroyed()) window.webContents.send('dock:settingsEditingChanged');
    changed();
  },
});
let pageCollections: PageCollectionManager;
const allApplets = () => [...manager.snapshot(), ...(pageCollections?.snapshot() ?? [])];
const appletManagement = new AppletManagement({
  settings,
  applets: allApplets,
  ready: () => startupReady && !quitting,
  reconcile: async () => {
    pageCollections.reconcile();
    await manager.reconcile();
  },
  restart: (id) => (pageCollections.find(id) ? pageCollections.restart(id) : manager.restart(id)),
});
const settingsCommands = new SettingsCommands({
  settings,
  applets: allApplets,
  save: (value, revision) => commitSettings(prepareSettings(value), revision),
});
let log: HostLog;
let hotKeys: GlobalHotKeyManager | undefined;
let gestures: GestureManager | undefined;
let shortcutRecording = false;
let shortcutCaptured: { token: string; key: string; sequence: number } | undefined;
let globalShortcutOwnership = new Set<string>();
let ownershipGeneration = 0;
const ownershipAcks = new Map<number, { sender: number; resolve(): void }>();
ipcMain.on('dock:shortcutOwnership:get', (event) => {
  event.returnValue = event.sender === window?.webContents ? [...globalShortcutOwnership] : [];
});
ipcMain.on('dock:shortcutOwnership:ack', (event, generation: number) => {
  const pending = ownershipAcks.get(generation);
  if (pending?.sender === event.sender.id) pending.resolve();
});
async function setShortcutOwnership(keys: string[]) {
  const next = new Set(keys);
  if (
    next.size === globalShortcutOwnership.size &&
    [...next].every((key) => globalShortcutOwnership.has(key))
  )
    return;
  globalShortcutOwnership = next;
  const contents = window?.webContents;
  if (!contents || contents.isDestroyed() || contents.isLoadingMainFrame()) return;
  const generation = ++ownershipGeneration;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ownershipAcks.delete(generation);
      reject(Error('入力所有情報を画面へ適用できませんでした。'));
    }, 2000);
    ownershipAcks.set(generation, {
      sender: contents.id,
      resolve: () => {
        clearTimeout(timer);
        ownershipAcks.delete(generation);
        resolve();
      },
    });
    contents.send('dock:shortcutOwnership', { generation, keys: [...next] });
  });
}
async function setShortcutCapture(request: { token: string; active: boolean; allowWin: boolean }) {
  if (
    !request ||
    typeof request.token !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(request.token) ||
    typeof request.active !== 'boolean' ||
    typeof request.allowWin !== 'boolean'
  )
    throw Error('キー記録の状態が不正です。');
  if (request.active && (!shortcutRecording || !window?.isFocused()))
    throw Error('記録欄を最前面にしてください。');
  await gestures?.record(
    request,
    window?.getNativeWindowHandle().readBigUInt64LE().toString() ?? '',
  );
}
let windowState: WindowStateStore | undefined;
let restoreMaximized = false;
let quitting = false;
let shutdownFinished = false;
let shutdownStarted = false;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
const registeredImages = new RegisteredImages(
  path.join(paths.assets, 'images'),
  decodeRegisteredImage,
  () => changed(),
);
const imageLibraryHost = new ImageLibraryHost(registeredImages, {
  settings,
  window: () => window,
  writable: assertSettingsWritable,
  show: showWindow,
  cover: coverAppletPagesForImagePicker,
  referenced: (ref) =>
    [...(manager?.items.values() ?? [])].some((item) =>
      ownsImage(item.manifest, settings.value.extensions[item.manifest.id]?.settings ?? {}, ref),
    ),
});
let updater: PortableUpdates;
let startupUpdateTimer: ReturnType<typeof setTimeout> | undefined;
let automation: AutomationService | undefined;
const appletApiAccess = new AppletApiAccess(path.join(dataDirectory, 'applet-api.json'));
const mcpAllowed = (key: Parameters<AutomationService['allowed']>[0]) =>
  !quitting && (automation?.allowed(key) ?? false);
const externalUiPermissions = (id?: string) =>
  id
    ? ['starting', 'running'].includes(manager?.items.get(id)?.state ?? '')
      ? appletApiAccess.get()
      : {}
    : { execute: mcpAllowed('allowExecute'), write: mcpAllowed('allowWrite') };
let nativeInput: NativeInput | undefined;
const sendInput =
  (method: string) =>
  async (
    params: Record<string, unknown>,
    id: string | undefined,
    context: import('./core/command-contexts').InputInvocation,
  ) => {
    if (!id || !nativeInput) throw Error('入力機能は準備中です。');
    return nativeInput.send(method, params, id, context);
  };
const ttsSecrets = new TtsSecrets(path.join(dataDirectory, 'tts-key.json'), {
  encrypt: (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw Error('APIキーの暗号化が利用できません。');
    return safeStorage.encryptString(value).toString('base64');
  },
  decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
});
let notificationVoiceListRevision = 0;
let notificationVoiceListSignature = '';
function notificationVoicesRevision() {
  const signature = JSON.stringify(settings.value.tts ?? defaultTtsSettings());
  if (signature !== notificationVoiceListSignature) {
    notificationVoiceListSignature = signature;
    notificationVoiceListRevision++;
  }
  return notificationVoiceListRevision;
}
const ttsOwner = (id?: string) =>
  id ? 'applet:' + id + ':' + manager.items.get(id)?.runtimeSession : 'mcp';
const tts = new TtsService({
  settings: () => settings.value.tts ?? defaultTtsSettings(),
  key: (url) => ttsSecrets.get(url),
  canUse: (owner, speak) => {
    if (quitting) return false;
    if (owner === 'host' || owner === 'notification-preview') return startupReady;
    if (owner.startsWith('notification:')) return notificationSpeech?.allows(owner) ?? false;
    if (owner === 'mcp') return mcpAllowed('allowUseTts') && (!speak || mcpAllowed('allowExecute'));
    const item = [...(manager?.items.values() ?? [])].find(
      (e) => owner === ttsOwner(e.manifest.id),
    );
    const grants =
      item && ['starting', 'running'].includes(item.state)
        ? appletApiAccess.get(item.manifest)
        : {};
    return !!grants.read && !!grants.useTts && (!speak || !!grants.execute);
  },
  play: playTtsWave,
  fetcher: (url, init) => net.fetch(url instanceof URL ? url.href : url, init),
  changed: () => changed(),
  audit: (owner, id, state, code) =>
    log.write(
      'info',
      owner.startsWith('applet:')
        ? owner.split(':')[1]
        : owner.startsWith('notification:')
          ? 'notifications'
          : ['host', 'notification-preview'].includes(owner)
            ? 'host'
            : 'automation',
      '[TTS] jobId=' + id + ' state=' + state + (code ? ' code=' + code : ''),
    ),
});
const aiSecrets = new AiSecrets(path.join(dataDirectory, 'ai-keys.json'), {
  encrypt: (value) => {
    if (!safeStorage.isEncryptionAvailable())
      throw Error('Windowsの認証情報保護を利用できません。');
    return safeStorage.encryptString(value).toString('base64');
  },
  decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
});
const aiSettings = new AiSettingsController(settings, aiSecrets, (id) => {
  ai.reconcile(id ?? false);
  changed();
});
let aiMcpGeneration = 0;
const aiOwner = (id?: string) =>
  id ? 'applet:' + id + ':' + manager.items.get(id)?.runtimeSession : 'mcp:' + aiMcpGeneration;
const errors = new ErrorReporter({
  notifications: () => (quitting ? undefined : typedNotifications),
  log: (source, message) => log.write('error', source, message),
});
const warnings = new WarningReporter({
  notifications: () => (quitting ? undefined : typedNotifications),
  log: (source, message) => log.write('warning', source, message),
});
const information = new InformationReporter({
  notifications: () => (quitting ? undefined : typedNotifications),
  log: (source, message) => log.write('info', source, message),
});
let legacyLocalData: LegacyLocalDataMonitor | undefined;
const ai = new AiService({
  settings: () => settings.value.ai ?? defaultAiSettings(),
  key: (c) => aiSecrets.key(c),
  canUse: (owner, kind) => {
    if (quitting) return false;
    if (owner === 'host') return startupReady;
    if (owner === aiOwner()) {
      const state = automation?.state();
      return (
        !!state?.enabled &&
        (kind === 'read' ||
          (kind === 'cancel'
            ? mcpAllowed('allowExecute')
            : mcpAllowed('allowUseAi') && (kind !== 'generate' || mcpAllowed('allowExecute'))))
      );
    }
    const item = [...(manager?.items.values() ?? [])].find((e) => owner === aiOwner(e.manifest.id));
    const grants =
      item && ['starting', 'running'].includes(item.state)
        ? appletApiAccess.get(item.manifest)
        : {};
    return (
      !!grants.read &&
      (kind === 'read' ||
        (kind === 'cancel'
          ? !!grants.execute
          : !!grants.useAi && (kind !== 'generate' || !!grants.execute)))
    );
  },
  fetcher: (url, init) => net.fetch(url instanceof URL ? url.href : url, init),
  changed: () => changed(),
  audit: (owner, id, state, code) => {
    if (state !== 'failed')
      log.write(
        'info',
        owner.startsWith('applet:') ? owner.split(':')[1] : 'host',
        '[AI] jobId=' + id + ' state=' + state + (code ? ' code=' + code : ''),
      );
  },
  failed: (owner, id, error) =>
    errors.report({
      eventId: id,
      source: owner.startsWith('applet:') ? owner.split(':')[1] : 'host',
      title: 'AI文章生成に失敗しました',
      code: error.code,
      message:
        error.message +
        '\n実行元: ' +
        (owner === 'host'
          ? '試験画面'
          : owner.startsWith('applet:')
            ? 'Applet (' + owner.split(':')[1] + ')'
            : 'MCP'),
    }),
});
const aiPreviewJobs = new Set<string>();
const previewJobs = new Set<string>();
const notificationPreviewJobs = new Set<string>();
const mcpHostActor: McpActor = { owner: 'host', kind: 'host', external: false };
let mcpConfigurationWarning: ReturnType<WarningReporter['episode']> | undefined;
function mcpChanged() {
  if (!startupReady || quitting) return;
  customCommands.reconcile();
  const invalid =
    mcpSettings.health().error ||
    mcpClient.statuses().some((s) => s.state === 'error' || s.state === 'unconfigured');
  if (invalid)
    (mcpConfigurationWarning ??= warnings.episode()).update({
      eventId: 'mcp-configuration',
      source: 'mcp-client',
      title: 'MCP接続先を確認してください',
      code: 'MCP_CONFIGURATION_REQUIRED',
      message:
        'このPCで利用できないMCP接続先があります。設定の「MCP接続先」で状態と認証情報を確認してください。',
    });
  else {
    mcpConfigurationWarning?.resolve();
    mcpConfigurationWarning = undefined;
  }
  changed();
}
function mcpActor(id?: string, context: InputInvocation = {}): McpActor {
  const root: McpActor['origin'] =
    context.origin?.kind === 'mcp'
      ? { kind: 'mcp' }
      : context.origin?.kind === 'applet'
        ? context.origin
        : undefined;
  const origin =
    (root?.kind === 'mcp' && !id) || (root?.kind === 'applet' && root.appletId === id)
      ? undefined
      : root;
  const identity = id
    ? 'applet:' + id + ':' + manager?.items.get(id)?.runtimeSession
    : 'mcp:' + aiMcpGeneration;
  const suffix =
    origin?.kind === 'mcp'
      ? '|mcp:' + aiMcpGeneration
      : origin?.kind === 'applet'
        ? '|applet:' + origin.appletId + ':' + manager?.items.get(origin.appletId)?.runtimeSession
        : '';
  return {
    owner: identity + suffix,
    kind: id ? 'applet' : 'mcp',
    appletId: id,
    external: !id || origin?.kind === 'mcp',
    origin,
  };
}
const mcpSettings = new McpClientSettings(
  settings,
  path.join(dataDirectory, 'mcp-client.json'),
  {
    encrypt: (v) => {
      if (!safeStorage.isEncryptionAvailable())
        throw Error('Windowsの認証情報保護を利用できません。');
      return safeStorage.encryptString(v).toString('base64');
    },
    decrypt: (v) => safeStorage.decryptString(Buffer.from(v, 'base64')),
  },
  () => {
    mcpClient.reconcile();
    mcpChanged();
  },
);
const mcpClient = new McpClientService({
  settings: mcpSettings,
  authorized: (actor, execute) => {
    if (quitting) return false;
    if (actor.kind === 'host') return startupReady;
    if (actor.owner !== mcpActor(actor.appletId, { origin: actor.origin }).owner) return false;
    const allowed = (id?: string) => {
      if (!id)
        return (
          mcpAllowed('allowUseMcp') &&
          (!execute || mcpAllowed('allowExecute')) &&
          (!actor.management || mcpAllowed('allowManageMcpServers'))
        );
      const e = manager?.items.get(id);
      const p =
        e && ['starting', 'running'].includes(e.state) ? appletApiAccess.get(e.manifest) : {};
      return (
        p.read === true &&
        p.useMcp === true &&
        (!execute || p.execute === true) &&
        (!actor.management || p.manageMcpServers === true)
      );
    };
    return (
      allowed(actor.appletId) &&
      (!actor.origin || allowed(actor.origin.kind === 'applet' ? actor.origin.appletId : undefined))
    );
  },
  fetcher: (url, init) =>
    net.fetch(url instanceof URL ? url.href : typeof url === 'string' ? url : url.url, init),
  changed: mcpChanged,
  failed: (id, error) =>
    errors.report({
      eventId: id,
      source: 'mcp-client',
      title: 'MCPツールの処理を完了できませんでした',
      ...error,
    }),
  audit: (job) =>
    log.write(
      'info',
      'mcp-client',
      'jobId=' +
        job.jobId +
        ' serverId=' +
        job.serverId +
        ' state=' +
        job.state +
        (job.error ? ' code=' + job.error.code : ''),
    ),
});
let customCommandWarning: ReturnType<WarningReporter['episode']> | undefined;
function customExecutionAllowed(
  permission: ExecutionPermission,
  context: import('./core/command-contexts').InputInvocation,
) {
  return (
    !quitting &&
    startupReady &&
    executionAuthorized(permission, context, (actor) => {
      if (actor.kind === 'mcp')
        return {
          read: true,
          execute: mcpAllowed('allowExecute'),
          sendInput: mcpAllowed('allowSendInput'),
          runProcesses: mcpAllowed('allowRunProcesses'),
        };
      const item = manager?.items.get(actor.appletId);
      return item && ['starting', 'running'].includes(item.state)
        ? appletApiAccess.get(item.manifest)
        : {};
    })
  );
}
const processAppDirectory = path.dirname(
  process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'),
);
const processLauncher = new ProcessLaunchService(
  processAppDirectory,
  path.join(
    app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), '.artifacts'),
    'dotnet-host',
    'process',
    'AppDock.ProcessHost.exe',
  ),
  async (processId) => {
    const press = shortcutInvocation.getStore();
    if (press)
      await gestures
        ?.activateProcess(press.pressId, processId)
        .catch((error) => log.write('error', 'hotkeys', String(error)));
  },
);
const customCommands = new CustomCommandService({
  settings,
  settingsCommands,
  save: (value, revision) => commitSettings(prepareSettings(value), revision),
  providers: () => manager?.customCommandProviders() ?? [],
  reservedIds: () => [
    ...hostCommandsForApplets(manager ? allApplets() : []).map((c) => c.id),
    ...(manager?.snapshot() ?? []).flatMap((a) => a.commands.map((c) => c.id)),
  ],
  authorized: (context) => {
    if (quitting) return false;
    if (context.origin?.kind === 'mcp') return mcpAllowed('allowExecute');
    if (context.origin?.kind === 'applet') {
      const owner = manager?.items.get(context.origin.appletId);
      const permissions =
        owner && ['starting', 'running'].includes(owner.state)
          ? appletApiAccess.get(owner.manifest)
          : {};
      return permissions.read === true && permissions.execute === true;
    }
    return true;
  },
  changed: () => {
    if (startupReady) changed();
  },
  unavailable: (ids) => {
    if (!startupReady || quitting) return;
    if (!ids.length) {
      customCommandWarning?.resolve();
      customCommandWarning = undefined;
      return;
    }
    (customCommandWarning ??= warnings.episode()).update({
      eventId: 'custom-commands-unavailable',
      source: 'custom-commands',
      title: 'カスタムコマンドを確認してください',
      code: 'CUSTOM_COMMAND_UNAVAILABLE',
      message:
        '利用できない種類または設定があります。カスタムコマンド設定で提供元と設定形式を確認してください。',
      logDetails: ids,
    });
  },
  failed: (code, id) => {
    log.write('warn', 'custom-commands', `${code} command=${id}`);
    errors.report({
      eventId: randomUUID(),
      source: 'commands',
      title: 'コマンドを完了できませんでした',
      code,
      message: '操作先の状態を確認してから再実行してください。',
    });
  },
});
const validateProcessConfig = (config: Record<string, unknown>) => {
  try {
    processLaunchSpec(config, processAppDirectory);
    return null;
  } catch {
    return '実行ファイル・引数・コマンドの長さ・実行方法を確認してください。';
  }
};
const validateInputConfig = (config: Record<string, unknown>) => {
  try {
    normalizeInputKeys(config.keys);
    return null;
  } catch {
    return '送信キーを確認してください。例: Ctrl+Shift+T、Enter、Win+E';
  }
};
customCommands.registerHost(
  processCommandType,
  async (config, context) => {
    try {
      return await processLauncher.start(config, context, () =>
        customExecutionAllowed('runProcesses', context),
      );
    } catch (error) {
      if (error instanceof ProcessLaunchError)
        throw new CustomCommandError(error.code, error.message);
      throw error;
    }
  },
  {
    authorized: (context) => customExecutionAllowed('runProcesses', context),
    validateConfig: validateProcessConfig,
    unavailableReason: validateProcessConfig,
  },
);
customCommands.registerHost(
  inputCommandType,
  async (config, context) => {
    if (!customExecutionAllowed('sendInput', context))
      throw new CustomCommandError('API_DISABLED', 'キー送信を許可してください。');
    if (!nativeInput) throw new CustomCommandError('NOT_READY', '入力機能は準備中です。');
    try {
      return await nativeInput.send(
        'input.sendKeys',
        { keys: normalizeInputKeys(config.keys) },
        'host:custom-input',
        context,
      );
    } catch (error) {
      if (error instanceof AutomationError) throw new CustomCommandError(error.code, error.message);
      throw error;
    }
  },
  {
    authorized: (context) => customExecutionAllowed('sendInput', context),
    validateConfig: validateInputConfig,
    unavailableReason: validateInputConfig,
  },
);
customCommands.registerHost(
  mcpCommandType,
  async (config, context) => {
    const caller = context.apiCaller ?? context.origin;
    const actor =
      caller?.kind === 'applet'
        ? mcpActor(caller.appletId, context)
        : caller?.kind === 'mcp'
          ? mcpActor(undefined, context)
          : mcpHostActor;
    try {
      const job = await mcpClient.start(
        actor,
        {
          serverId: config.serverId,
          name: config.toolName,
          toolRevision: config.toolRevision,
          arguments: config.arguments,
          timeoutMs: config.timeoutMs ?? 60000,
          requestId: randomUUID(),
        },
        context.signal,
        true,
      );
      return { completion: 'accepted', jobId: job.jobId, state: job.state };
    } catch (error) {
      if (error instanceof AutomationError) throw new CustomCommandError(error.code, error.message);
      throw error;
    }
  },
  {
    validateConfig: (config) => mcpClient.commandValidation(config),
    unavailableReason: (config) => mcpClient.commandUnavailable(config),
  },
);
function mcpSettingsOperation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    const code = error instanceof McpSettingsError ? error.code : 'INVALID_ARGUMENT';
    const message =
      error instanceof McpSettingsError
        ? error.message
        : 'MCP接続設定の入力形式と認証情報を確認してください。';
    if (code === 'SAVE_FAILED')
      errors.report({
        eventId: randomUUID(),
        source: 'mcp-client',
        title: 'MCP接続設定を保存できませんでした',
        code,
        message,
      });
    throw new AutomationError(code, message);
  }
}
const operationApi = new AppDockApi({
  handlers: {
    'mcp.servers.getSettings': async (p) =>
      mcpSettingsOperation(() => mcpSettings.getSettings(p.serverId)),
    'mcp.servers.updateSettings': async (p) => {
      try {
        assertSettingsWritable();
      } catch {
        throw new AutomationError('BUSY', '設定の復元・再起動が完了してから操作してください。');
      }
      return mcpSettingsOperation(() => mcpSettings.update(p));
    },
    'mcp.servers.inspectTools': (p, id, c) => mcpClient.inspectTools(mcpActor(id, c), p),
    'mcp.servers.list': async (p, id, c) => mcpClient.servers(mcpActor(id, c), p),
    'mcp.tools.list': (p, id, c) => mcpClient.tools(mcpActor(id, c), p),
    'mcp.tools.get': (p, id, c) => mcpClient.tool(mcpActor(id, c), p),
    'mcp.tools.call': async (p, id, c) => ({
      ...(await mcpClient.start(mcpActor(id, c), p, c.signal)),
    }),
    'mcp.jobs.get': async (p, id, c) => ({ ...mcpClient.get(mcpActor(id, c), p.jobId) }),
    'mcp.jobs.cancel': async (p, id, c) => ({ ...mcpClient.cancel(mcpActor(id, c), p.jobId) }),
    'ai.text.generate': async (params, id) => ({ ...ai.generate(aiOwner(id), params) }),
    'ai.jobs.get': async (params, id) => ({ ...ai.get(aiOwner(id), params.jobId) }),
    'ai.jobs.cancel': async (params, id) => ({ ...ai.cancel(aiOwner(id), params.jobId) }),
    'ai.models.list': async (params, id) => ({
      ...(await ai.models(aiOwner(id), params.connectionId)),
    }),
    'tts.speak': async (params, id) => tts.speak(ttsOwner(id), params),
    'tts.voices.list': async (_params, id) => ({ ...(await tts.voices(ttsOwner(id))) }),
    'tts.jobs.get': async (params, id) => ({ ...tts.get(ttsOwner(id), params.jobId) }),
    'tts.stop': async (params, id) => ({ ...(await tts.stop(ttsOwner(id), params.jobId)) }),
    'ui.ribbon.get': async (params, id, context) => {
      const permissions = externalUiPermissions(id);
      const published = (await operationApi.call('commands.list', {}, id, context))
        .commands as import('./core/automation-commands').AutomationCommand[];
      return {
        ...presentation.get(
          (action) =>
            !!permissions.execute &&
            (!action.theme || !!permissions.write) &&
            (!action.command || published.some((c) => c.id === action.command && c.available)),
          params.schemaVersion === 2 ? 2 : 1,
          false,
        ),
      };
    },
    'ui.assets.get': async (params) => presentation.getAsset(params.id),
    'ui.actions.invoke': async (params, id, context) => ({
      result: await presentation.invoke(
        params as unknown as import('../shared/shell').UiActionRequest,
        id ? 'applet:' + id + ':' + manager.items.get(id)?.runtimeSession : 'mcp',
        async (action) => {
          if (!externalUiPermissions(id).execute)
            throw new AutomationError('API_DISABLED', '操作が許可されていません。');
          if (action.group) {
            presentation.toggleGroup(action.group);
            return { accepted: true };
          }
          if (action.command)
            return operationApi.call('commands.execute', { id: action.command }, id, context);
          if (action.theme) {
            if (!externalUiPermissions(id).write) throw Error('設定変更が許可されていません。');
            return toggleTheme();
          }
          navigation.navigate(action.route!, action.section);
          showWindow();
          return { accepted: true };
        },
      ),
    }),
    'input.sendKeys': sendInput('input.sendKeys'),
    'processes.start': async (params, id, context) => {
      const invocation = {
        ...context,
        apiCaller: id ? { kind: 'applet' as const, appletId: id } : { kind: 'mcp' as const },
      };
      try {
        return await processLauncher.start(params, invocation, () =>
          customExecutionAllowed('runProcesses', invocation),
        );
      } catch (error) {
        if (error instanceof ProcessLaunchError)
          throw new AutomationError(error.code, error.message);
        throw error;
      }
    },
    'input.appCommand': sendInput('input.appCommand'),
  },
  settings,
  settingsCommands,
  appletManagement,
  customCommands,
  mcpClientAllowed: () => mcpAllowed('allowUseMcp'),
  inputAllowed: () => mcpAllowed('allowSendInput'),
  processesAllowed: () => mcpAllowed('allowRunProcesses'),
  mcpServersManageable: () => mcpAllowed('allowManageMcpServers'),
  customCommandsManageable: () => mcpAllowed('allowManageCustomCommands'),
  appletPermissions: (id) => {
    const e = manager?.items.get(id);
    return e && ['starting', 'running'].includes(e.state) ? appletApiAccess.get(e.manifest) : {};
  },
  ttsAllowed: () => mcpAllowed('allowUseTts'),
  aiAllowed: () => mcpAllowed('allowUseAi'),
  writable: () => mcpAllowed('allowWrite'),
  executable: () => mcpAllowed('allowExecute'),
  manageable: () => mcpAllowed('allowManageApplets'),
  shortcutsEditable: () => mcpAllowed('allowEditShortcuts'),
  gesturesEditable: () => mcpAllowed('allowEditGestures'),
  ribbonEditable: () => mcpAllowed('allowEditRibbon'),
  trayEditable: () => mcpAllowed('allowEditTray'),
  ribbonApplets: allApplets,
  trayApplets: allApplets,
  shortcutStatus: () => hotKeys?.statuses ?? [],
  inputPages: () => shortcutPageChoices(allApplets()),
  save: (value, revision) => commitSettings(prepareSettings(value), revision),
  applets: () => automationApplets(allApplets()),
  commands: () => automationCommands(allApplets()),
  execute: executeCommand,
  version: app.getVersion(),
  instanceId:
    'appdock_' +
    createHash('sha256')
      .update(path.resolve(baseDirectory).toLowerCase())
      .digest('hex')
      .slice(0, 16),
  ready: () => startupReady && !quitting,
});
const changed = () => {
  refreshAppearance();
  if (quitting || notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = undefined;
    if (quitting) return;
    notificationBanner?.refresh();
    notificationDesktop?.refresh();
    notificationWindows?.refresh();
    shellHost?.refresh();
    shellBarHost?.refresh();
    hostPages?.refresh();
    settingsPageHost?.refresh();
    overlayHost?.refresh();
    shellRegistry?.touch();
    if (shellRegistry && manager)
      for (const e of manager.items.values()) {
        if (
          !['starting', 'running'].includes(e.state) ||
          !e.shellStateRequested ||
          !e.manifest.capabilities?.includes('shell') ||
          !e.peer ||
          e.peer.closed
        )
          continue;
        const state = shellRegistry.ownState(e.manifest.id);
        const signature = e.runtimeSession + ':' + JSON.stringify(state);
        if (shellStateSent.get(e.manifest.id) !== signature) {
          shellStateSent.set(e.manifest.id, signature);
          e.peer.send({ jsonrpc: '2.0', method: 'shell.changed', params: state });
        }
      }
    const shellRevision = shellRegistry?.snapshot().revision;
    if (shellRevision !== undefined && shellRevision !== lastShellRevision) {
      lastShellRevision = shellRevision;
      void syncHotKeys();
      trayMenu();
    }
    if (window && !window.isDestroyed()) window.webContents.send('dock:changed');
  }, 60);
};
const shortcutInvocation = new AsyncLocalStorage<ShortcutPress>();
function showWindow() {
  if (window) {
    if (restoreMaximized) {
      restoreMaximized = false;
      window.maximize();
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    const press = shortcutInvocation.getStore();
    if (press)
      void gestures
        ?.activate(press.pressId, window.getNativeWindowHandle().readBigUInt64LE().toString())
        .catch((error) => log.write('error', 'hotkeys', String(error)));
  }
}
function trayMenu() {
  if (quitting || !tray || tray.isDestroyed() || !manager) return;
  const attention = [...manager.items.values()].some((e) => e.state === 'running' && e.attention);
  const icon = nativeImage
    .createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png'))
    .resize({ width: 20, height: 20 });
  if (attention) {
    const pixels = icon.toBitmap();
    for (let y = 0; y < 8; y++)
      for (let x = 12; x < 20; x++) {
        const offset = (y * 20 + x) * 4;
        pixels[offset] = 70;
        pixels[offset + 1] = 170;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
      }
    tray.setImage(nativeImage.createFromBitmap(pixels, { width: 20, height: 20 }));
  } else tray.setImage(icon);
  tray.setToolTip(attention ? 'AppDock.at365 — 新しい通知があります' : 'AppDock.at365');
  const applets = allApplets();
  const entries = resolveTrayMenu(
    getTrayMenu(settings.value, applets),
    trayCommandCatalog(applets, customCommands.uiCommands()),
  );
  const template = (items: ResolvedTrayItem[]): Electron.MenuItemConstructorOptions[] =>
    items.map((item) =>
      item.type === 'separator'
        ? { type: 'separator' }
        : item.type === 'group'
          ? { label: item.title!.replace(/&/g, '&&'), submenu: template(item.children!) }
          : {
              label: (
                item.title! + (item.disabledReason ? '（' + item.disabledReason + '）' : '')
              ).replace(/&/g, '&&'),
              enabled: item.enabled,
              ...(item.command === gesturePauseCommand
                ? { type: 'checkbox' as const, checked: gestures?.paused ?? false }
                : {}),
              click: () => runTrayCommand(item.command!),
            },
    );
  const menu = Menu.buildFromTemplate([
    ...template(entries),
    ...(entries.length ? [{ type: 'separator' as const }] : []),
    { label: '設定…', click: () => runTrayCommand('appdock.settings.open') },
    { label: '終了', click: () => runTrayCommand('appdock.quit') },
  ]);
  menu.on('menu-will-show', () => trayClicks?.cancel());
  tray.setContextMenu(menu);
}
function quitHost(restart = false) {
  if (quitting) return;
  if (restart && settingsOperationBusy())
    throw Error('設定の保存・復元が完了してから再起動してください。');
  if (restart) {
    const portableExecutable = app.isPackaged && process.env.PORTABLE_EXECUTABLE_FILE;
    if (portableExecutable) {
      // Relaunch the original EXE; its gate protects extraction and final cleanup.
      process.chdir(path.dirname(portableExecutable));
      app.relaunch({
        execPath: portableExecutable,
        args: [
          ...process.argv.slice(1).filter((arg) => arg !== '--restore-view'),
          '--restore-view',
        ],
      });
    } else {
      app.relaunch({
        args: [
          ...process.argv.slice(1).filter((arg) => arg !== '--restore-view'),
          '--restore-view',
        ],
      });
    }
  }
  quitting = true;
  app.quit();
}
function executeShellCommand(provider: string, command: string) {
  const applet = manager
    .snapshot()
    .find((p) => p.id === provider && p.enabled && p.state === 'running');
  if (!applet?.commands.some((c) => c.id === command && c.available))
    throw Error('Command is not available from this Shell Applet');
  return executeCommand(command);
}
const knownSettingsCommands = new Map<string, ReturnType<typeof uiCommands>[number]>();
function uiCommands(): import('../shared/commands').UiCommand[] {
  const commands = [
    ...hostCommandsForApplets(allApplets()).map((c) => ({ ...c, extensionId: null })),
    ...customCommands.uiCommands(),
    ...appletManagementCommands(allApplets()),
    ...allApplets().flatMap((e) =>
      e.commands.map((c) => ({ ...c, extension: e.displayName, extensionId: e.id })),
    ),
  ];
  for (const command of commands) knownSettingsCommands.set(command.id, command);
  return commands;
}
function settingsUiCommands() {
  const commands = uiCommands(),
    ids = new Set(commands.map((c) => c.id)),
    published = operationApi.publishedCommandIds();
  return [
    ...commands,
    ...[...knownSettingsCommands.values()]
      .filter((c) => !ids.has(c.id))
      .map((c) => ({ ...c, available: false, customDefinitionId: undefined })),
  ].map((command) => ({ ...command, automation: published.has(command.id) }));
}
function settingsCommandAssignments() {
  return {
    shortcuts: [...new Set(getKeybindings(settings.value).map((binding) => binding.command))],
    gestures: [
      ...new Set((settings.value.gestures?.bindings ?? []).map((binding) => binding.command)),
    ],
  };
}
function settingsAppletAssignments() {
  const commands = settingsUiCommands();
  const assignments = settingsCommandAssignments();
  const owners = (ids: string[]) => {
    const assigned = new Set(ids);
    return [
      ...new Set(
        commands.flatMap((command) =>
          command.extensionId && assigned.has(command.id) ? [command.extensionId] : [],
        ),
      ),
    ];
  };
  return { shortcuts: owners(assignments.shortcuts), gestures: owners(assignments.gestures) };
}
function ribbonUiCommands() {
  const applets = allApplets();
  return settingsUiCommands().map((command) => ({
    ...command,
    available:
      command.available &&
      (!command.extensionId ||
        applets.some((a) => a.id === command.extensionId && a.enabled && a.state === 'running')),
  }));
}
function openCommandPalette(request: CommandPaletteRequest) {
  if (!startupReady || quitting || !overlayHost) throw Error('AppDockは準備中です。');
  const session = new CommandPaletteSession(request, {
    commands: uiCommands,
    pins: () => settings.value.pinnedCommands,
    shortcuts: () => settings.value.shortcuts,
    dark: () => nativeTheme.shouldUseDarkColors,
    savePins: (ids) => {
      settings.save({ ...settings.value, pinnedCommands: ids }, settings.revision);
    },
    execute: executeCommand,
    changed,
  });
  paletteSession = session;
  overlayHost.open(session);
  return session.result
    .then((result) => {
      if (result.status === 'executed') {
        if (window && !window.isDestroyed()) window.webContents.send('dock:paletteExecuted');
      }
      return result;
    })
    .finally(() => {
      if (paletteSession === session) paletteSession = undefined;
    });
}
async function executeCommand(id: string, invocation?: InputInvocation) {
  if (quitting) return;
  const settingsPage = settingsPageCommands(allApplets()).find((command) => command.id === id);
  if (settingsPage) {
    showWindow();
    await flushSettingsInputs();
    const state = settingsEditing.snapshot();
    await settingsEditing.act({
      sessionId: state.sessionId,
      editRevision: state.editRevision,
      operationId: randomUUID(),
      action: { type: 'select-page', pageId: settingsPage.pageId },
    });
    releaseSettingsView();
    settingsNavigation.provider = undefined;
    settingsNavigation.move = undefined;
    await navigation.navigate('settings');
    return { accepted: true };
  }
  const update = updateCommands.find((command) => command.id === id);
  if (update) {
    if (!startupReady || !updater) throw Error('AppDockは準備中です。');
    return update.scope === 'check' ? updater.check() : updater.install(update.scope);
  }
  if (customCommands.has(id)) return customCommands.execute(id, invocation);
  if (id === 'appdock.commands.search') {
    showWindow();
    if (overlayHost?.active) overlayHost.cancel('toggle');
    else void openCommandPalette({ requestId: randomUUID(), mode: 'execute' });
    return;
  }
  if (appletManagement.has(id)) return appletManagement.execute(id);
  if (settingsCommands.hasGenerated(id)) return settingsCommands.execute(id, {}, false);
  if (id === gesturePauseCommand) {
    gestures?.togglePause();
    trayMenu();
    changed();
    return;
  }
  if (id === 'appdock.restart' || id === 'appdock.quit') {
    quitHost(id === 'appdock.restart');
    return;
  }
  if (hostCommands.some((command) => command.id === id)) {
    showWindow();
    if (id !== 'appdock.open') window?.webContents.send('dock:hostCommand', id);
    return;
  }
  const split = id.lastIndexOf('.');
  const web = id.slice(0, split);
  if (pageCollections.find(web))
    return id.endsWith('.open')
      ? pageCollections.open(web)
      : pageCollections.navigate(web, id.slice(split + 1));
  return manager.execute(id, invocation);
}
const shortcutDispatcher = new ShortcutDispatcher(
  executeCommand,
  (message) => log.write('error', 'shortcuts', message),
  () => quitting || shortcutRecording || !!overlayHost?.active,
);
function shortcutContext(foregroundWindow?: string) {
  const { appletId, pageId } = activeShortcutPage(foregroundWindow);
  const hostFocused =
    foregroundWindow === undefined
      ? !!window?.isFocused()
      : window?.getNativeWindowHandle().readBigUInt64LE().toString() === foregroundWindow;
  return {
    appFocused: !!appletId || hostFocused,
    appletId,
    pageId: pageId ?? (hostFocused ? hostShortcutPage(navigation.state.route) : undefined),
  };
}
function availableShortcutCommands() {
  return [
    ...hostCommandsForApplets(allApplets()).map((c) => ({
      id: c.id,
      title: c.title,
      extensionId: null,
    })),
    ...customCommands.uiCommands().filter((c) => c.available),
    ...appletManagementCommands(allApplets()).filter((c) => c.available),
    ...allApplets().flatMap((e) =>
      e.commands
        .filter((c) => c.available)
        .map((c) => ({ id: c.id, title: c.title, extensionId: e.id })),
    ),
  ];
}
function dispatchShortcut(key: string, globalEvent = false, press?: ShortcutPress) {
  if (shortcutRecording || quitting || overlayHost?.active) return Promise.resolve();
  const currentContext = shortcutContext();
  const context =
    press &&
    (press.window !==
      BrowserWindow.getFocusedWindow()?.getNativeWindowHandle().readBigUInt64LE().toString() ||
      press.context !== JSON.stringify({ ...currentContext, window: press.window }))
      ? { appFocused: false }
      : currentContext;
  const rows = getKeybindings(settings.value);
  const keys = press?.shortcuts ?? [key];
  const commands = resolveKeybindings(
    rows,
    keys,
    context,
    availableShortcutCommands(),
    globalEvent,
  );
  return press
    ? shortcutInvocation.run(press, () => shortcutDispatcher.dispatch(key, commands))
    : shortcutDispatcher.dispatch(key, commands);
}
function runTrayCommand(id: string) {
  void executeCommand(id).catch((error) => {
    log.write('error', 'tray', `${id}: ${String(error)}`);
    // Keep settings reachable when the selected Applet is no longer available.
    showWindow();
  });
}
function snapshot(): HostSnapshot {
  return {
    overlay: { active: !!overlayHost?.active, kind: overlayHost?.kind ?? null },
    navigation: navigation.state,
    shellRegions: shellRegistry?.snapshot(),
    shell: shellHost?.status ?? {
      selected: defaultShellId,
      active: null,
      error: null,
      safeMode: safeShell,
    },
    appletApi: {
      permissions: appletApiAccess.get(),
      error: appletApiAccess.error,
    },
    launch: launch.state,
    startupReady,
    windowVisible: !!window && !window.isDestroyed() && window.isVisible() && !window.isMinimized(),
    updates: updater?.state ?? { busy: false, phase: '', results: [] },
    globalHotKeys: hotKeys?.statuses ?? [],
    settings: settings.snapshot(),
    extensions: allApplets(),
    webPages: pageCollections.states(),
    webAccounts: pageCollections.accounts(),
    logs: log.entries,
    version: app.getVersion(),
    runtime: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    dataDirectory,
    sharedDirectory,
    legacyLocalData: !!legacyLocalData?.snapshot().targets.length,
    dark: nativeTheme.shouldUseDarkColors,
  };
}
function refreshWindowTheme() {
  if (window && !window.isDestroyed())
    window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#101116' : '#fafbfc');
}
function applySettings() {
  try {
    pageCollections?.reconcile();
    trayClicks?.cancel();
    nativeTheme.themeSource = settings.value.host.theme;
    refreshWindowTheme();
    refreshPageDisplays();
    trayMenu();
    changed();
    settings.health.clear('apply-window', settings.revision);
  } catch {
    settings.health.set('apply-window', 'apply-failed', settings.revision);
  }
}
let hotKeyApplyGeneration = 0;
let appletApplyGeneration = 0;
function syncHotKeys(retry = false) {
  if (quitting || !hotKeys) return Promise.resolve();
  const available = [
    ...hostCommandsForApplets(allApplets()).map((command) => command.id),
    ...customCommands
      .uiCommands()
      .filter((c) => c.available)
      .map((c) => c.id),
    ...appletManagementCommands(allApplets())
      .filter((c) => c.available)
      .map((c) => c.id),
    ...allApplets().flatMap((extension) =>
      extension.commands.filter((command) => command.available).map((command) => command.id),
    ),
  ];
  const revision = settings.revision;
  const generation = ++hotKeyApplyGeneration;
  const suspended = shortcutRecording || !!overlayHost?.active;
  return hotKeys
    .sync(settings.value, available, suspended, retry)
    .then(() => {
      if (
        quitting ||
        revision !== settings.revision ||
        suspended ||
        generation !== hotKeyApplyGeneration
      )
        return;
      if (hotKeys?.statuses.some((s) => !s.registered))
        settings.health.set('apply-hotkeys', 'apply-failed', generation);
      else settings.health.clear('apply-hotkeys', generation);
    })
    .catch(() => {
      if (generation === hotKeyApplyGeneration)
        settings.health.set('apply-hotkeys', 'apply-failed', generation);
    });
}
async function reconcileSettingsApplets() {
  const generation = ++appletApplyGeneration;
  try {
    await manager.reconcile();
    if (generation === appletApplyGeneration) settings.health.clear('apply-applets', generation);
  } catch {
    if (generation === appletApplyGeneration)
      settings.health.set('apply-applets', 'apply-failed', generation);
  }
}
function assertSettingsWritable() {
  if (quitting || settingsRecoveryBusy)
    throw Error('設定の復元・再起動中です。完了後に操作してください。');
  if (launch.recoveryPending) throw Error('一般設定で中断したWindows起動設定を復旧してください。');
}
const settingsRestartRequired = () =>
  settings.value.host.hardwareAcceleration !== startupHardwareAcceleration;
const settingsRecoveryUi: SettingsRecoveryUi = {
  confirm: async (plan) =>
    (
      await dialog.showMessageBox({
        type: 'warning',
        message: `正常な設定で${plan.scope === 'device' ? 'このPCの設定ファイル' : '共有ファイル'}を復元しますか？`,
        detail: `復元元の更新日時: ${new Date(plan.modifiedAt).toLocaleString()}\n${plan.scope === 'device' ? 'このPCの設定だけを復元します。' : '復元した共有設定は同期先のPCにも届きます。'}現在の破損ファイルはこのPCへ退避します。`,
        buttons: ['キャンセル', '復元'],
        defaultId: 0,
        cancelId: 0,
      })
    ).response === 1,
  chooseJson: async () => {
    const result = await dialog.showOpenDialog({
      title: '正常な設定JSONを選択',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    return result.canceled ? undefined : result.filePaths[0];
  },
  openDirectory: async () => {
    const error = await shell.openPath(path.dirname(settings.file));
    if (error) throw Error('保存先を開けませんでした。');
  },
  chooseStartupAction: async (message) => {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'AppDock — 設定の復旧',
      message: '設定を確認して再起動してください',
      detail: `${message}\n\n${settings.recoveryPath()}\n復旧記録: ${path.join(dataDirectory, 'settings-transactions')}`,
      buttons: ['正常なJSONから復元', '保存先を開く', '再読み込み', '終了'],
      defaultId: 2,
      cancelId: 3,
    });
    return (['restore', 'open', 'reload', 'quit'] as const)[result.response] ?? 'quit';
  },
};
async function restoreSettingsBackup(scope?: 'shared' | 'device') {
  if (settingsOperationBusy() || quitting)
    throw Error('設定を処理中です。完了後に操作してください。');
  settingsRecoveryBusy = true;
  settings.writesBlocked = true;
  settingsHealthNotifications?.refresh();
  changed();
  try {
    const plan = settings.prepareRecovery(undefined, scope);
    if (!(await settingsRecoveryUi.confirm(plan))) return null;
    return settings.restoreRecovery(plan);
  } catch (error) {
    if (error instanceof SettingsConflictError) throw error;
    settings.health.set('save', 'save-failed');
    throw Error('設定を復元できませんでした。元のファイルは保持しています。');
  } finally {
    settings.writesBlocked = false;
    settingsRecoveryBusy = false;
    settingsHealthNotifications?.refresh();
    changed();
  }
}
function prepareSettings(value: Settings) {
  value = restoreSettingsCollections(value, manager.snapshot());
  let next = parseSettings(value);
  validateNotificationPreferenceChanges(next, settings.value, notificationCatalog(allApplets()));
  pageCollections.validate(next, settings.value);
  validateAppletSettings(next, manager.snapshot());
  return initializeCollectionDefaults(next, settings.value, manager.snapshot());
}
function commitSettings(value: Settings, revision: number, resetPage?: SettingsPageDefinition) {
  assertSettingsWritable();
  customCommands.validateReplacement(value);
  return settings.save(
    value,
    revision,
    undefined,
    resetPage ? settingsPageStorage(resetPage).files.map((file) => file.scope) : [],
  );
}
function settingsPageStorage(
  page: SettingsPageDefinition,
): NonNullable<SettingsPageAuxiliary['storage']> {
  const owner = page.collection?.owner ?? page.owner;
  const local =
    page.kind === 'applet'
      ? settings.localSettings(owner!)
      : ['appearance', 'general'].includes(page.id);
  const scopes = new Set<'shared' | 'device'>();
  for (const p of settingsPaths(page, allApplets())) {
    scopes.add(
      p[0] === 'host' && (deviceHostKeys as readonly string[]).includes(p[1])
        ? 'device'
        : p[0] === 'extensions' && p[2] !== 'updateSource'
          ? settings.localSettings(p[1])
            ? 'device'
            : 'shared'
          : 'shared',
    );
  }
  if (
    page.kind === 'applet' &&
    !local &&
    deviceCollections().some((item) => item.owner === owner) &&
    (!page.collection ||
      allApplets()
        .find((a) => a.id === page.owner)
        ?.settings?.some((field) => field.key === 'enabled'))
  )
    scopes.add('device');
  return {
    canSwitch: page.kind === 'applet' && !page.collection,
    local,
    signature: `${page.id}:${local ? 'device' : 'shared'}${
      page.id === 'custom-commands'
        ? ':' +
          createHash('sha256')
            .update(JSON.stringify(customCommands.descriptors().map((t) => t.typeRevision)))
            .digest('hex')
        : ''
    }`,
    revision: settings.revision,
    files: [...scopes].map((scope) => ({ scope, name: path.basename(settings.targetFile(scope)) })),
  };
}
function settingsPageAuxiliary(page: SettingsPageDefinition): SettingsPageAuxiliary {
  const host = snapshot();
  const state = settingsEditing.snapshot();
  const id = page.id;
  if (id === 'mcp-client')
    return {
      mcpClient: {
        ...mcpSettings.health(),
        connections: mcpClient.statuses(),
        jobs: mcpClient.summaries(),
      },
    };
  if (id === 'custom-commands')
    return {
      commands: settingsUiCommands(),
      commandAssignments: settingsCommandAssignments(),
      customCommands: {
        types: customCommands.descriptors(),
        summaries: customCommands.summaries(),
        revision: settingsCommands.revision(),
      },
    };
  const summary = (a: ExtensionSnapshot): ExtensionSnapshot => ({
    apiVersion: 1,
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    version: id === 'about' || id === 'applets' || page.kind === 'applet' ? a.version : '',
    runtime: a.runtime,
    collection: a.collection,
    sourceKind: a.sourceKind,
    entry: '',
    folder: '',
    state: a.state,
    error: id === 'applets' && a.error ? '起動または停止に失敗しました。' : null,
    scheduledStartAt: a.scheduledStartAt,
    enabled: a.enabled,
    commands: page.kind === 'applet' || id === 'tray' ? a.commands : [],
    tray: id === 'tray' ? a.tray : [],
    panel: null,
    settingOptions: {},
    pages:
      page.kind === 'applet' || ['ribbon', 'gestures', 'shortcuts'].includes(id)
        ? a.pages
        : undefined,
    ribbonItems: id === 'ribbon' ? a.ribbonItems : undefined,
    shell: id === 'appearance' ? a.shell : undefined,
    updateRepository: id === 'about' || page.kind === 'applet' ? a.updateRepository : undefined,
  });
  const applets = allApplets();
  if (id === 'applets')
    return {
      applets: managedApplets(applets, settings.value.appletOrder).map(summary),
      updates: host.updates,
      appletManagement: {
        assignments: settingsAppletAssignments(),
        packagesAvailable: updater.packagesAvailable,
        busy: updater.state.busy,
        discoveryIssueCount: manager.discoveryIssueCount,
        mutableIds: managedApplets(applets)
          .filter((a) => updater.canManageApplet(a.id))
          .map((a) => a.id),
      },
    };
  if (page.kind === 'applet') {
    const a = applets.find((a) => a.id === page.owner)!;
    return {
      applets: [
        {
          ...summary(a),
          collection: a.collection,
          pageCollections: a.pageCollections,
          settings: a.settings,
          settingActions: a.settingActions,
          settingSections: a.settingSections,
          settingOptions: a.settingOptions,
          startupDelaySeconds: a.startupDelaySeconds,
        },
      ],
      accounts: a.capabilities?.includes('web-profiles')
        ? pageCollections.profiles(a.id).accounts()
        : [],
    };
  }

  if (id === 'appearance')
    return {
      applets: applets.filter((a) => a.shell).map(summary),
      shellRegions: shellRegistry?.snapshot(),
    };
  if (id === 'general')
    return {
      launch: host.launch,
      legacyLocalData: legacyLocalData?.snapshot(),
      settingsHealth: {
        restartRequired: settingsRestartRequired(),
        reasons: settingsRestartRequired() ? [settingsRestartReason] : [],
        errors: settings.health.all().map((i) => i.message),
        recovered: settings.recovered,
        canRestore: settings.recovered && !!settings.backupCandidate(),
        busy: settingsOperationBusy(),
        launchRecovery: launch.recoveryPending,
      },
    };
  if (id === 'notifications')
    return {
      notificationTypes: notificationCatalog(orderApplets(applets, state.value.appletOrder)),
      notificationSpeech: {
        defaults: {
          defaultVoice: settings.value.tts?.defaultVoice ?? '',
          defaultSpeed: settings.value.tts?.defaultSpeed ?? 1,
        },
        configured: !!settings.value.tts?.baseUrl && !!settings.value.tts?.model,
        voiceListRevision: notificationVoicesRevision(),
        jobs: [...notificationPreviewJobs].flatMap((id) => {
          try {
            return [tts.get('notification-preview', id)];
          } catch {
            notificationPreviewJobs.delete(id);
            return [];
          }
        }),
      },
    };
  if (id === 'ribbon') return { applets: applets.map(summary), commands: ribbonUiCommands() };
  if (['shortcuts', 'gestures', 'tray'].includes(id))
    return {
      ...(['shortcuts', 'gestures'].includes(id)
        ? { commandAssignments: settingsCommandAssignments() }
        : {}),
      provider:
        settingsNavigation.provider?.page === id
          ? {
              ...settingsNavigation.provider,
              title:
                applets.find((a) => a.id === settingsNavigation.provider?.id)?.displayName ??
                settingsNavigation.provider.id,
            }
          : undefined,
      applets: applets.map(summary),
      commands: settingsUiCommands(),
      statuses: id === 'shortcuts' ? host.globalHotKeys : undefined,
    };
  if (id === 'about')
    return {
      version: host.version,
      runtime: host.runtime,
      updates: host.updates,
      applets: applets.filter((a) => a.sourceKind !== 'builtin').map(summary),
    };
  if (id === 'web-accounts')
    return {
      accounts: host.webAccounts,
      accountReferences: {
        saved: pageCollections.entries().map(({ id, item: { name, accountId } }) => ({
          id,
          name,
          accountId: accountId ?? '',
        })),
      },
    };
  if (id === 'tts')
    return {
      tts: {
        ...ttsSecrets.status(settings.value.tts?.baseUrl ?? ''),
        jobs: [...previewJobs].flatMap((id) => {
          try {
            return [tts.get('host', id)];
          } catch {
            previewJobs.delete(id);
            return [];
          }
        }),
      },
    };
  if (id === 'ai')
    return {
      ai: {
        connections: (settings.value.ai?.connections ?? []).map((c) => aiSecrets.status(c)),
        jobs: [...aiPreviewJobs].flatMap((id) => {
          try {
            return [ai.get('host', id)];
          } catch {
            aiPreviewJobs.delete(id);
            return [];
          }
        }),
      },
    };
  if (id === 'permissions') return { permissions: host.appletApi };
  return {};
}
let settingsRecording = false;
let settingsPalette: string | undefined;
function releaseSettingsView() {
  void updater?.discardPackagePlans();
  aiSettings.cancelModels();
  if (settingsRecording) {
    settingsRecording = false;
    shortcutRecording = false;
    shortcutCaptured = undefined;
    void gestures
      ?.endRecording()
      .then(() => syncHotKeys())
      .catch(() => {});
  }
  if (settingsPalette && paletteSession?.request.requestId === settingsPalette)
    paletteSession.cancel('owner-disposed');
  settingsPalette = undefined;
}
function settingsPageActions(
  page: SettingsPageDefinition,
): Record<string, (args: unknown[]) => Promise<unknown>> {
  const actions: Record<string, (args: unknown[]) => Promise<unknown>> = {};
  if (page.id === 'applets') {
    actions.openAppletDiscoveryLogs = async () => {
      await flushSettingsInputs();
      await navigation.navigate('logs', undefined, '');
    };
    const target = (value: unknown) => {
      const found = managedApplets(allApplets()).find((a) => a.id === value);
      if (!found) throw Error('管理対象のAppletが見つかりません。');
      return found;
    };
    actions.manageApplet = async ([id, operation]) => {
      target(id);
      assertSettingsWritable();
      if (updater.state.busy) throw Error('パッケージ操作の完了を待ってください。');
      if (!['enable', 'disable', 'restart'].includes(operation as string))
        throw Error('操作が不正です。');
      return appletManagement.run(id as string, operation as 'enable' | 'disable' | 'restart');
    };
    actions.startAppletNow = async ([id]) => {
      if (target(id).state !== 'waiting' || updater.state.busy)
        throw Error('開始待ちのAppletが見つかりません。');
      return manager.restart(id as string, true);
    };
    actions.reorderApplets = async ([ordered, original]) => {
      assertSettingsWritable();
      const value = settings.value;
      const appletOrder = reorderManagedApplets(allApplets(), value.appletOrder, ordered, original);
      return settings.save({ ...value, appletOrder }, settings.revision);
    };
    actions.openAppletDestination = async ([id, destination]) => {
      const a = target(id);
      if (!['settings', 'shortcuts', 'gestures', 'logs'].includes(destination as string))
        throw Error('移動先が不正です。');
      await flushSettingsInputs();
      target(id);
      if (destination === 'logs') {
        await navigation.navigate('logs', undefined, a.id);
      } else {
        const s = settingsEditing.snapshot();
        await settingsEditing.act({
          sessionId: s.sessionId,
          editRevision: s.editRevision,
          operationId: randomUUID(),
          action: {
            type: 'select-page',
            pageId:
              destination === 'settings' ? appletSettingsPageId(a.id) : (destination as string),
          },
        });
        settingsNavigation.provider =
          destination === 'settings'
            ? undefined
            : { id: a.id, page: destination as 'shortcuts' | 'gestures', request: Date.now() };
        changed();
      }
    };
    actions.prepareAppletInstall = async ([url]): Promise<AppletPackagePreviewResult> => {
      try {
        const plan = await updater.prepareAppletInstall(url);
        if (!plan) return { cancelled: true };
        return {
          ...plan,
          updateSource: settings.value.extensions[plan.id]?.updateSource ?? plan.updateSource,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };
    actions.cancelAppletPackagePreview = async () => updater.cancelPackagePreview();
    actions.discardAppletPackage = async ([id]) => updater.discardPackagePlan(id);
    actions.chooseAppletInstallDirectory = async () => {
      try {
        const result = await dialog.showOpenDialog(window!, {
          title: 'Appletの配布フォルダーを選ぶ',
          properties: ['openDirectory'],
        });
        return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };
    actions.prepareAppletUninstall = async ([id]) => {
      const a = target(id);
      const plan = await updater.prepareAppletUninstall(a.id);
      return {
        ...plan,
        siteCount: allApplets().filter((p) => p.collection?.owner === a.id).length,
        shell: shellRegions.some(({ id }) => settings.value.host.shellProviders?.[id] === a.id),
      };
    };
    actions.applyAppletPackage = async ([id]) => {
      try {
        await flushSettingsInputs();
        return await updater.applyAppletPackage(id);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };
    actions.appletPackageStatus = async ([id]) => updater.packageStatus(id);
  }
  if (page.id === 'shortcuts' || page.id === 'gestures')
    actions.clearProvider = async () => {
      settingsNavigation.provider = undefined;
      changed();
    };
  if (page.id === 'mcp-client' || page.id === 'custom-commands') {
    actions.mcpServers = async () => mcpClient.servers(mcpHostActor, { limit: 50 });
    actions.mcpTools = async ([serverId, cursor]) =>
      mcpClient.tools(mcpHostActor, { serverId, cursor, refresh: !cursor, limit: 50 });
    actions.mcpTool = async ([serverId, name]) => mcpClient.tool(mcpHostActor, { serverId, name });
  }
  if (page.id === 'mcp-client') {
    actions.updateMcpConnection = async ([args]) => {
      assertSettingsWritable();
      return mcpSettings.update(args);
    };
    actions.mcpCall = async ([params]) =>
      mcpClient.start(mcpHostActor, params as Record<string, unknown>);
    actions.mcpGetJob = async ([jobId]) => mcpClient.get(mcpHostActor, jobId);
    actions.mcpCancelJob = async ([jobId]) => mcpClient.cancel(mcpHostActor, jobId);
  }
  if (page.id === 'custom-commands')
    actions.updateCustomCommands = async ([args]) => {
      assertSettingsWritable();
      return customCommands.update(args);
    };
  if (page.kind === 'applet' && !page.collection)
    actions['set-local-settings'] = async ([
      enabled,
      revision,
      disposition = 'keep',
      expectedScope,
    ]) => {
      assertSettingsWritable();
      if (
        typeof enabled !== 'boolean' ||
        typeof revision !== 'number' ||
        !['keep', 'share', 'clear'].includes(String(disposition))
      )
        throw Error('設定操作が不正です。');
      if (expectedScope !== undefined && expectedScope !== settingsPageStorage(page).signature)
        throw Error('設定の保存先が変わりました。もう一度確認してください。');
      settings.setLocalSettings(
        page.owner!,
        enabled,
        revision,
        (value) => {
          pageCollections.validate(value, settings.value);
          validateAppletSettings(value, manager.snapshot());
        },
        disposition as 'keep' | 'share' | 'clear',
      );
      return { storage: enabled ? 'device' : 'shared', revision: settings.revision };
    };
  if (page.id === 'ribbon')
    actions.editRibbon = async ([operation, before]) => {
      const commands = new RibbonCommands({
        settings,
        settingsCommands,
        ribbonApplets: allApplets,
        save: (value, revision) => commitSettings(prepareSettings(value), revision),
      });
      if (!isDeepStrictEqual(commands.get().layout, before))
        throw Error('リボン設定が変更されています。再取得してください。');
      return commands.execute({
        operations: [operation],
        expectedRevision: settingsCommands.revision(),
      });
    };
  if (page.kind === 'applet')
    actions.replaceAppletList = async ([key, value, before]) => {
      const owner = manager.items.get(page.owner!);
      if (!owner) throw Error('Appletがありません。');
      return settingsCommands.replaceOwnList(owner.manifest, key, value, before);
    };
  if (page.kind === 'applet')
    actions.openAppletListItem = async ([key, id]) => {
      const item = pageCollections
        .entries()
        .find(
          (item) =>
            item.binding.owner === page.owner && item.binding.key === key && item.item.id === id,
        );
      if (!item) throw Error('ページがありません。');
      return pageCollections.open(item.id);
    };
  const string = (v: unknown) => {
    if (typeof v !== 'string') throw Error('入力が不正です。');
    return v;
  };
  if (page.json)
    actions['open-settings'] = async ([scope, revision]) => {
      if (typeof revision !== 'number') throw Error('設定の保存先を再取得してください。');
      settings.assertRevision(revision);
      if (!settingsPageStorage(page).files.some((file) => file.scope === scope))
        throw Error('このページの保存先ではありません。');
      const file = settings.targetFile(scope as 'shared' | 'device');
      if (!fs.existsSync(file))
        throw Error('設定ファイルがありません。復旧状態を確認してください。');
      const error = await shell.openPath(file);
      if (error) throw Error(error);
    };
  if (page.id === 'appearance')
    actions.retryShellRegion = async ([region]) => {
      if (!isShellRegion(region)) throw Error('領域が不正です。');
      await retryShell(region);
    };
  if (page.id === 'ai') {
    actions.aiSaveConnection = async ([draft, original, key, keyRevision]) =>
      aiSettings.save(draft, original, key, keyRevision);
    actions.aiDeleteConnection = async ([original, keyRevision]) =>
      aiSettings.remove(original, keyRevision);
    actions.aiOrderConnections = async ([original, ordered]) =>
      aiSettings.reorder(original, ordered);
    actions.aiDraftModels = async ([draft, key, requestId]) =>
      aiSettings.models(draft, key, requestId);
    actions.aiCancelModels = async ([requestId]) => aiSettings.cancelModels(requestId);
    actions.aiPreview = async ([input]) => {
      const job = ai.generate('host', input);
      aiPreviewJobs.add(job.jobId);
      while (aiPreviewJobs.size > 64) aiPreviewJobs.delete(aiPreviewJobs.values().next().value!);
      changed();
      return job;
    };
    actions.aiCancel = async ([id]) => {
      const job = ai.cancel('host', id);
      changed();
      return job;
    };
  }
  if (page.id === 'tts') {
    actions.ttsSetKey = async ([value]) => {
      ttsSecrets.set(settings.value.tts?.baseUrl ?? '', value);
      notificationVoiceListRevision++;
      notificationSpeech?.reconcile(true);
      tts.reconcile(true);
      changed();
      information.report(
        'tts',
        '読み上げ設定',
        value ? 'APIキーをこのPCに保存しました。' : 'APIキーを削除しました。',
      );
    };
    actions.ttsVoices = async () => tts.voices('host');
    actions.ttsModels = async () => tts.models('host');
    actions.ttsPreview = async ([text, requestId]) => {
      const job = tts.speak('host', { text, requestId });
      previewJobs.add(job.jobId as string);
      while (previewJobs.size > 512) previewJobs.delete(previewJobs.values().next().value!);
      information.report('tts', '読み上げ', '読み上げを受け付けました。', job.jobId as string);
      return job;
    };
    actions.ttsStop = async () => {
      notificationSpeech?.stopAll();
      await tts.stopAll();
      information.report('tts', '読み上げ', '読み上げを停止しました。');
      // The stop receipt must not start another spoken notification.
      notificationSpeech?.stopAll();
    };
  }
  if (page.id === 'notifications') {
    actions.notificationVoices = async () => tts.voices('host');
    actions.notificationPreview = async ([requestId]) => {
      if (
        [...notificationPreviewJobs].some((id) => {
          try {
            return ['queued', 'generating', 'waitingPlayback', 'playing'].includes(
              tts.get('notification-preview', id).state,
            );
          } catch {
            return false;
          }
        })
      )
        throw Error('試聴はすでに実行中です。');
      const job = tts.speak('notification-preview', {
        text: '新しい通知が届きました。通知の読み上げを試聴しています。',
        ...resolveNotificationSpeech(settings.value),
        requestId,
      });
      notificationPreviewJobs.add(job.jobId as string);
      while (notificationPreviewJobs.size > 512)
        notificationPreviewJobs.delete(notificationPreviewJobs.values().next().value!);
      return job;
    };
    actions.notificationPreviewStop = async () => {
      for (const id of notificationPreviewJobs) {
        try {
          await tts.stop('notification-preview', id);
        } catch {}
      }
    };
  }
  if (page.id === 'general') {
    actions.restoreScopedSettings = async ([scope]) => {
      if (scope !== 'shared' && scope !== 'device') throw Error('復元対象が不正です。');
      await restoreSettingsBackup(scope);
      return null;
    };
    actions.restart = async () => {
      quitHost(true);
    };
    actions.recoverLaunchSettings = async () => {
      await launch.recoverSavedTask();
      settings.writesBlocked = launch.recoveryPending;
      changed();
    };
    actions.restoreSettingsBackup = async () => {
      await restoreSettingsBackup();
      return null;
    };
    actions.openSettingsDirectory = settingsRecoveryUi.openDirectory;
    actions.refreshLegacyLocalData = async () => legacyLocalData?.refresh();
    actions.refreshLaunchState = async () => {
      const result = await launch.refresh();
      if (
        !result.error &&
        result.registered === settings.value.host.startAtLogon &&
        (!result.registered || result.taskElevated === settings.value.host.runAsAdministrator)
      )
        settings.health.clear('launch');
      changed();
      return result;
    };
    actions.restartAsAdministrator = async () => {
      if (settingsOperationBusy()) throw Error('設定の処理が完了してから再起動してください。');
      await launch.restartElevated([
        ...launch.args,
        '--restore-view',
        '--appdock-elevation-attempt',
      ]);
      quitHost();
    };
  }
  if (
    [
      'shortcuts',
      'gestures',
      'ai',
      'ribbon',
      'custom-commands',
      'mcp-client',
      'image-library',
      'applets',
    ].includes(page.id) ||
    page.json ||
    page.kind === 'applet'
  ) {
    actions.setShortcutRecording = async ([value]) => {
      if (typeof value !== 'boolean') throw Error('入力状態が不正です。');
      settingsRecording = value;
      shortcutRecording = value && !!window?.isFocused();
      if (!value) {
        shortcutCaptured = undefined;
        await gestures?.endRecording();
      }
      await syncHotKeys();
      await gestures?.refresh();
    };
    actions.setShortcutCapture = async ([value]) =>
      setShortcutCapture(value as Parameters<typeof setShortcutCapture>[0]);
    if (['shortcuts', 'gestures'].includes(page.id))
      actions.retryGlobalHotKeys = async () => syncHotKeys(true);
  }
  if (['shortcuts', 'gestures', 'tray', 'ribbon'].includes(page.id)) {
    actions.openCommandPalette = async ([request]) => {
      const value = request as CommandPaletteRequest;
      if (!value || value.mode !== 'select') throw Error('選択操作だけを利用できます。');
      settingsPalette = value.requestId;
      return openCommandPalette(value);
    };
    actions.cancelCommandPalette = async ([id]) => {
      if (paletteSession && paletteSession.request.requestId === id)
        paletteSession.cancel('owner-disposed');
    };
  }
  if (page.id === 'about' || page.id === 'applets') {
    const target = (value: unknown, groups = false) => {
      if (value === undefined) return undefined;
      const id = string(value);
      if (
        !allApplets().some((a) => a.id === id) &&
        !(groups && ['all', 'host', 'applets'].includes(id))
      )
        throw Error('更新対象が不正です。');
      return id;
    };
    actions.checkUpdates = async ([id]) => {
      const selected = target(id);
      await updater.check([selected ?? 'host']);
      return updater.state.results.find((r) => r.id === (selected ?? 'host'));
    };
    actions.checkAllUpdates = async () => executeCommand('appdock.updates.check');
    if (page.id === 'about')
      for (const command of updateCommands)
        actions[`settingAction:${command.id}`] = async () => executeCommand(command.id);
    if (page.id === 'applets')
      actions.checkAppletUpdates = async () =>
        updater.check(managedApplets(allApplets()).map((a) => a.id));
    actions.cancelUpdates = async () => updater.cancel();
    actions.installUpdates = async ([id]) => {
      const scope = target(id, true)!;
      return scope === 'all' || scope === 'host'
        ? executeCommand(
            scope === 'all' ? 'appdock.updates.installAll' : 'appdock.updates.installHost',
          )
        : updater.install(scope);
    };
    actions.openReleases = async ([id]) => {
      const selected = target(id);
      const url = updater.state.results.find((r) => r.id === (selected ?? 'host'))?.releaseUrl;
      if (!url || !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/releases$/.test(url))
        throw Error('更新元を確認してください。');
      await shell.openExternal(url);
    };
  }
  if (page.id === 'web-accounts') {
    actions.createWebAccount = async ([name]) => pageCollections.addAccount(name);
    actions.renameWebAccount = async ([id, name]) =>
      pageCollections.renameAccount(string(id), name);
    actions.deleteWebAccount = async ([id]) => {
      const target = string(id);
      if (pageCollections.entries().some((a) => a.item.accountId === target))
        throw Error('WebAppletがこのアカウントを使用しています。');
      return pageCollections.deleteAccount(target);
    };
    actions.clearWebAccount = async ([id]) => pageCollections.clearAccount(string(id));
  }
  if (['permissions', 'codex'].includes(page.id)) {
    actions.automation = async ([action]) => {
      const value = action as AutomationAction;
      const permitted =
        page.id === 'permissions'
          ? [
              'status',
              'configure',
              'setExecution',
              'setAppletManagement',
              'setShortcutEditing',
              'setGestureEditing',
              'setRibbonEditing',
              'setTts',
              'setAi',
              'setMcpClient',
              'setInputSending',
              'setProcessLaunching',
              'setMcpServerManagement',
              'setTrayEditing',
              'setCustomCommandManagement',
            ]
          : [
              'status',
              'configure',
              'register',
              'unregister',
              'test',
              'rotateToken',
              'selectConfig',
              'selectName',
              'setConnectionScope',
              'setNetworkHostnames',
              'copyToken',
              'copyEndpoint',
              'retryStart',
            ];
      if (!value || !permitted.includes(value.kind))
        throw Error('このページでは利用できない操作です。');
      const reply = await automation!.action(value);
      customCommands.reconcile();
      mcpClient.reconcile();
      ai.reconcile();
      tts.reconcile();
      return reply;
    };
    if (page.id === 'permissions')
      actions.setAppletApiPermissions = async ([value]) => {
        appletApiAccess.set(value);
        customCommands.reconcile();
        mcpClient.reconcile();
        ai.reconcile();
        tts.reconcile();
        for (const id of manager.items.keys()) nativeInput?.cancelApplet(id);
        changed();
        information.report('permissions', '操作許可', 'このPCに保存しました。');
      };
  }
  if (page.kind === 'applet') {
    const a = allApplets().find((a) => a.id === page.owner);
    for (const item of a?.settingActions ?? [])
      if (
        a?.enabled &&
        a.state === 'running' &&
        a.commands.some((c) => c.id === item.command && c.available)
      )
        actions[`settingAction:${item.command}`] = async () => {
          const current = allApplets().find((a) => a.id === page.owner);
          if (
            !current?.settingActions?.some((s) => s.command === item.command) ||
            !current.commands.some((c) => c.id === item.command && c.available)
          )
            throw Error('操作は現在利用できません。');
          return executeCommand(item.command);
        };
    if (
      a?.settings?.some(
        (s) => s.type === 'object-list' && s.fields?.some((f) => f.format === 'directory'),
      )
    )
      actions.chooseDirectory = async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: '画像ソースフォルダーを選ぶ',
          properties: ['openDirectory'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      };
  }
  return Object.fromEntries(
    Object.entries(actions).map(([key, run]) => [
      key,
      async (args: unknown[]) => {
        if (!startupReady || quitting) throw Error('AppDockは準備中です。');
        const result = await run(args);
        const accountMessages: Record<string, string> = {
          createWebAccount: 'アカウント枠を追加しました。',
          renameWebAccount: 'アカウント名を変更しました。',
          deleteWebAccount:
            result === 'deferred'
              ? 'アカウント枠を削除しました。残る保存ファイルは次回起動時に自動で片づけます。'
              : 'アカウント枠と保存データを削除しました。',
          clearWebAccount: 'ログイン情報とサイトデータをクリアしました。',
        };
        if (page.id === 'web-accounts' && accountMessages[key] && result !== false)
          information.report('web-accounts', 'Webアカウント', accountMessages[key]);
        return result;
      },
    ]),
  );
}
async function retryShell(region?: ShellRegion) {
  if (!shellRegistry) return;
  const regions = region ? [region] : shellRegions.map((r) => r.id);
  shellRegistry.retry(region);
  for (const id of new Set([
    defaultShellId,
    ...regions.map((r) => (safeShell ? defaultShellId : shellRegistry!.configured(r))),
  ])) {
    const e = manager.items.get(id);
    if (
      e?.state === 'error' &&
      (e.manifest.sourceKind === 'builtin' || appletEnabled(settings.value, id))
    )
      await manager.restart(id);
  }
  if (!region || region === 'ribbon') shellHost?.retry();
  if (!region || region === 'titlebar' || region === 'statusbar') shellBarHost?.retry(region);
  if (!region || region === 'overlay.command-palette' || region === 'overlay.ribbon-group')
    overlayHost?.retry(region);
  if (!region || region === 'notification.banner') notificationBanner?.retry();
  if (!region || region === 'notification.desktop') notificationDesktop?.retry();
  changed();
}
function registerIpc() {
  const updateTarget = (id?: string) => {
    if (id === undefined)
      return { version: app.getVersion(), repository: 'yukichi-7sai/AppDock.at365' };
    if (typeof id !== 'string' || !manager.items.has(id))
      throw new Error('Appletが見つかりません。');
    const manifest = manager.items.get(id)!.manifest;
    return { version: manifest.version, repository: manifest.updateRepository };
  };
  const handle = (channel: string, callback: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, async (event, ...args) => {
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame?.url !== hostDocumentUrl
      )
        throw new Error('許可されていない画面からの要求です。');
      try {
        return await callback(...args);
      } catch (error) {
        // Record the operation and error, never its settings/authentication arguments.
        log.write(
          'error',
          'host',
          `${channel}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    });
  handle('dock:snapshot', snapshot);
  handle('dock:imageLibrary:snapshot', () => imageLibraryHost.snapshot());
  handle('dock:imageLibraryDialog:pending', () => imageLibraryDialogs?.current() ?? null);
  handle('dock:imageLibraryDialog:complete', (id, operation) =>
    imageLibraryDialogs?.complete(id, operation),
  );
  handle('dock:imageLibrary:register', () => imageLibraryHost.register());
  handle('dock:imageLibrary:edit', (operation) => imageLibraryHost.edit(operation));
  handle('dock:imageLibrary:galleryView', () => ({
    cardWidth: galleryViewState.get('picker'),
    error: galleryViewState.error,
  }));
  handle('dock:imageLibrary:saveGalleryWidth', (value) => {
    try {
      galleryViewState.save('picker', value);
    } catch (error) {
      errors.report({
        eventId: randomUUID(),
        source: 'image-library',
        title: '画像サイズを保存できませんでした',
        code: 'IMAGE_LIBRARY_SAVE',
        message: '画像選択の表示サイズを保存できませんでした。保存先を確認してください。',
      });
      throw error;
    }
  });
  handle('dock:imageLibrary:galleryImage', async (ref, generation, edge) => {
    const entry = registeredImages.entry(ref);
    if (!entry?.available || !entry.generation || generation !== entry.generation)
      throw Error('画像が更新されました。再取得してください。');
    const source = await galleryImages.get(entry.ref, generation, edge);
    if (registeredImages.entry(ref)?.generation !== generation)
      throw Error('画像が更新されました。再取得してください。');
    return source;
  });
  handle('dock:imageLibrary:preview', async (ref, original = false) => {
    if (!imageReference(ref)) throw Error('画像の参照を確認してください。');
    if (original === true) {
      const saved = await registeredImages.read(ref);
      const extension = path.extname(saved.ref.file).slice(1).toLowerCase();
      return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${saved.bytes.toString('base64')}`;
    }
    await registeredImages.refresh();
    return registeredImages.icon(ref) ?? null;
  });
  handle('dock:imageLibrary:pick', (current) => imageLibraryHost.pick(current));
  handle('dock:imagePick:pending', () => imageLibraryHost.pendingRequest());
  handle('dock:imagePick:complete', (id, result) => imageLibraryHost.complete(id, result));
  handle('dock:settingsEditing', () => settingsEditing.snapshot());
  handle('dock:flushSettings', () => flushSettingsInputs());
  handle('dock:editSettings', async (request) => {
    if (['reload', 'select-page', 'mode'].includes(request?.action?.type)) {
      request = { ...request, editRevision: settingsEditing.snapshot().editRevision };
    }
    return settingsEditing.act(request);
  });
  handle('dock:settingsPage:open', (request) => settingsPageHost!.open(request));
  handle('dock:settingsPage:get', (id) => settingsPageHost!.get(id));
  handle('dock:settingsPage:act', (id, action) => settingsPageHost!.act(id, action));
  handle('dock:settingsPage:close', (id) => {
    if (typeof id !== 'string') throw Error('Invalid settings connection');
    settingsPageHost?.close(id);
  });
  handle('dock:focusShell', (edge) => shellHost?.focus(edge));
  handle('dock:barViewport', (region, bounds) => shellBarHost?.viewport(region, bounds));
  handle('dock:focusBar', (region, edge) => shellBarHost?.focus(region, edge));
  handle('dock:navigate', (route: string, restore?: true) =>
    restore === true ? navigation.restore(route) : navigation.navigate(route),
  );
  handle('dock:shellViewport', (bounds) => shellHost?.viewport(bounds));
  handle('dock:pages:open', (request) => hostPages!.open(request));
  handle('dock:pages:get', (id) => hostPages!.get(id));
  handle('dock:pages:act', (action) => hostPages!.act(action));
  handle('dock:pages:close', (id) => hostPages?.close(id));
  handle('dock:retryShell', () => retryShell());
  handle('dock:appletApiPermissions', (permissions: unknown) => {
    if (!startupReady || quitting) throw Error('AppDockは準備中です。');
    appletApiAccess.set(permissions);
    customCommands.reconcile();
    ai.reconcile();
    tts.reconcile();
    for (const id of manager.items.keys()) nativeInput?.cancelApplet(id);
    log.write('info', 'host', '[Applet API] shared permissions updated');
    changed();
  });
  handle('dock:automation', async (action: AutomationAction) => {
    if (!automation || quitting) throw Error('連携機能の準備中です。');
    const reply = await automation.action(action);
    ai.reconcile();
    tts.reconcile();
    return reply;
  });
  handle('dock:settingsInputsFlushed', (id) => {
    if (typeof id !== 'string') throw Error('Invalid input flush');
    settingsInputFlushes.get(id)?.();
  });
  handle('dock:focusNotifications', () => {
    if (!overlayHost?.active) notificationBanner?.focus();
  });
  handle('dock:openCommandPalette', (request: CommandPaletteRequest) =>
    openCommandPalette(request),
  );
  handle('dock:cancelCommandPalette', (requestId: string) => {
    if (paletteSession?.request.requestId === requestId) paletteSession.cancel('owner-disposed');
  });
  handle('dock:openAppletPage', async (extensionId: string, pageId: string) => {
    if (pageCollections.find(extensionId) && pageId === 'main')
      return pageCollections.open(extensionId);
    const extension = manager.items.get(extensionId);
    const page = [...(extension?.manifest.pages ?? []), ...(extension?.dynamicPages ?? [])].find(
      (page) => page.id === pageId,
    );
    if (!page) throw Error('Appletページがありません。');
    await executeCommand(page.openCommand);
  });
  handle('dock:pageViewport', updatePageViewport);

  handle('dock:webNavigate', (id: string, action: string) => pageCollections.navigate(id, action));
  handle('dock:clearWebAccount', (id: string) => pageCollections.clearAccount(id));
  handle('dock:createWebAccount', (name: unknown) => pageCollections.addAccount(name));
  handle('dock:renameWebAccount', (id: string, name: unknown) =>
    pageCollections.renameAccount(id, name),
  );
  handle('dock:deleteWebAccount', (id: string) => pageCollections.deleteAccount(id));
  ipcMain.handle('applet-page:snapshot', (event) => localPageSource(event).snapshot());
  ipcMain.handle('applet-page:execute', (event, id: unknown) => localPageSource(event).execute(id));
  ipcMain.handle('applet-page:call', (event, operation: unknown, input: unknown) => {
    const source = localPageSource(event);
    if (!source.call) throw Error('このページは操作APIに対応していません。');
    return source.call(operation, input);
  });
  handle('dock:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: '画像ソースフォルダーを選ぶ',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('dock:checkUpdates', async (id?: string) => {
    updateTarget(id);
    await updater.check([id ?? 'host']);
    return updater.state.results.find((result) => result.id === (id ?? 'host'))!;
  });
  handle('dock:cancelUpdates', () => updater.cancel());
  handle('dock:checkAllUpdates', () => executeCommand('appdock.updates.check'));
  handle('dock:installUpdates', (target: string) => {
    if (
      typeof target !== 'string' ||
      (target !== 'all' && target !== 'host' && target !== 'applets' && !manager.items.has(target))
    )
      throw Error('更新対象が正しくありません。');
    return target === 'all' || target === 'host'
      ? executeCommand(
          target === 'all' ? 'appdock.updates.installAll' : 'appdock.updates.installHost',
        )
      : updater.install(target);
  });
  handle('dock:openReleases', (id?: string) => {
    updateTarget(id);
    const result = updater.state.results.find((result) => result.id === (id ?? 'host'));
    if (
      !result?.releaseUrl ||
      !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/releases$/.test(result.releaseUrl)
    )
      throw new Error('GitHubの更新元を確認してから開いてください。');
    return shell.openExternal(result.releaseUrl);
  });
  handle('dock:startExtensionNow', (id: string) => {
    if (manager.items.get(id)?.state !== 'waiting')
      throw new Error('開始待ちのAppletが見つかりません。');
    return manager.restart(id, true);
  });
  handle('dock:dispatchShortcut', async (key: unknown) => {
    if (!window?.isFocused()) return;
    const normalized = normalizeShortcut(key);
    if (globalShortcutOwnership.has(normalized)) return;
    return dispatchShortcut(normalized);
  });
  handle('dock:retryGlobalHotKeys', () => syncHotKeys(true));
  handle('dock:hostModal', (active: boolean) => {
    if (typeof active !== 'boolean') throw Error('Invalid modal state');
    hostModalLayer?.setActive(active);
  });
  handle('dock:hostModalReady', (revision: number, rendered = true) => {
    if (!Number.isSafeInteger(revision)) throw Error('Invalid modal revision');
    if (typeof rendered !== 'boolean') throw Error('Invalid modal background state');
    return hostModalLayer?.ready(revision, rendered) ?? false;
  });
  handle('dock:setShortcutRecording', async (recording: boolean) => {
    if (typeof recording !== 'boolean') throw new Error('キー入力状態が正しくありません。');
    shortcutRecording = recording && !!window?.isFocused();
    if (!recording) {
      shortcutCaptured = undefined;
      await gestures?.endRecording();
    }
    await syncHotKeys();
    await gestures?.refresh();
  });
  handle('dock:setShortcutCapture', setShortcutCapture);
  handle('dock:refreshLaunchState', async () => {
    const state = await launch.refresh();
    changed();
    return state;
  });
  handle('dock:restartAsAdministrator', async () => {
    if (settingsOperationBusy()) throw Error('設定の処理が完了してから再起動してください。');
    await launch.restartElevated([...launch.args, '--restore-view', '--appdock-elevation-attempt']);
    quitHost();
  });
  handle('dock:restoreSettingsBackup', async (revision: number) => {
    if (revision !== settings.revision)
      throw new SettingsConflictError('設定が変わりました。もう一度確認してください。');
    return restoreSettingsBackup();
  });
  handle('dock:saveSettings', async (value: Settings, revision: number) => {
    assertSettingsWritable();
    const next = prepareSettings(value);
    return launch.save(
      next.host,
      settings.value.host,
      () => settings.assertRevision(revision),
      () => commitSettings(next, revision),
    );
  });
  handle('dock:setPinnedCommands', (ids: string[]) =>
    settings.save({ ...settings.value, pinnedCommands: ids }, settings.revision),
  );
  handle('dock:toggleExtension', async (id: string, enabled: boolean) => {
    if (typeof enabled !== 'boolean') throw Error('有効状態が不正です。');
    await appletManagement.run(id, enabled ? 'enable' : 'disable');
  });
  handle('dock:restartExtension', async (id: string) => {
    await appletManagement.run(id, 'restart');
    information.report('applets', 'Applet', 'Appletを再起動しました。');
  });
  handle('dock:executeCommand', (id: string) => executeCommand(id));
  handle('dock:executePanelAction', (id: string, actionId: string) =>
    manager.executePanelAction(id, actionId),
  );
  handle('dock:openPath', async (kind: string) => {
    const target = (
      {
        settings: settings.file,
        extensions: path.join(baseDirectory, 'extensions'),
        logs: log.directory,
      } as Record<string, string>
    )[kind];
    if (!target) throw new Error('保存先が見つかりません。');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });
  handle('dock:windowAction', (action: string) => {
    applyWindowAction(action);
  });
}
function applyWindowAction(action: string) {
  switch (action) {
    case 'minimize':
      window?.minimize();
      break;
    case 'maximize':
      window?.isMaximized() ? window.unmaximize() : window?.maximize();
      break;
    case 'close':
      window?.close();
      break;
    case 'quit':
      quitHost();
      break;
    default:
      throw new Error('未対応のウィンドウ操作です。');
  }
}
async function initialize() {
  if (settingsLoadError) {
    const recovered = await recoverSettingsAtStartup(settings, settingsRecoveryUi);
    quitHost(recovered);
    return;
  }
  log = new HostLog(path.join(dataDirectory, 'logs'), changed);
  ribbonState = new RibbonState(
    path.join(dataDirectory, 'ribbon-state.json'),
    changed,
    () => {
      errors.report({
        eventId: randomUUID(),
        source: 'ribbon',
        title: 'リボンの開閉状態を保存・読込できません',
        code: 'RIBBON_STATE_IO',
        message: 'PC専用の保存先の空き容量とアクセス権を確認してください。',
      });
    },
    () => (settings.value.ribbon.groups ?? []).map((group) => group.id),
  );
  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, 'updater', 'AppDock.Updater.exe')
    : path.join(app.getAppPath(), '.artifacts', 'updater', 'AppDock.Updater.exe');
  if (fs.existsSync(path.join(dataDirectory, 'update-transaction.json'))) {
    try {
      execFileSync(helperPath, ['--recover', baseDirectory, dataDirectory], { windowsHide: true });
    } catch (error) {
      dialog.showErrorBox(
        'AppDock — 更新の復元が必要です',
        `中断された更新を復元できませんでした。\n${String(error)}\n${dataDirectory} の更新記録と一時フォルダーを保持しています。`,
      );
      app.quit();
      return;
    }
  }
  const external = path.join(baseDirectory, 'extensions');
  fs.mkdirSync(external, { recursive: true });
  manager = new ExtensionManager({
    reservedCustomTypeIds: () => customCommands.hostTypeIds(),
    hostVersion: app.getVersion(),
    roots: [external],
    builtinRoots: [
      app.isPackaged
        ? path.join(process.resourcesPath, 'shells')
        : path.join(app.getAppPath(), 'out', 'shells'),
    ],
    settings,
    nodeExecutable: process.execPath,
    nodeWorker: path.join(__dirname, 'node-worker.js'),
    dotnetHost: app.isPackaged
      ? path.join(process.resourcesPath, 'dotnet-host')
      : path.join(app.getAppPath(), '.artifacts', 'dotnet-host'),
    api: createHostApi(
      settings,
      dataDirectory,
      log.write,
      changed,
      () => manager.emit('changed'),
      executeCommand,
      path.join(paths.assets, 'applets'),
      (e, request) =>
        callAppletApi(operationApi, e, request, log.write, (id) =>
          manager.executions.get(e.manifest.id, id),
        ),
      settingsCommands,
      () => typedNotifications,
      (id) => shellRegistry?.ownState(id),
      () => pageCollections,
      ribbonBadges,
      paths.shared,
      customCommands,
      {
        openDetails: async (id) => {
          showWindow();
          await navigation.navigate('extensions', undefined, id, 'description');
          return { accepted: true };
        },
        failed: (id) =>
          errors.report({
            eventId: randomUUID(),
            source: id,
            code: 'APPLET_PAGE_ACTION',
            title: 'ページの操作に失敗しました',
            message: 'ページの表示とAppletのログを確認してから、必要な操作をやり直してください。',
          }),
      },
      imageLibraryHost,
    ),
    log: log.write,
  });
  shellRegistry = new ShellProviderRegistry({
    assignments: () => settings.value.host.shellProviders ?? {},
    providers: () => manager.shellProviders(),
    safeMode: safeShell,
    changed,
    blocked: (region) =>
      region !== 'overlay.command-palette' &&
      region !== 'overlay.ribbon-group' &&
      region !== 'notification.desktop' &&
      !!overlayHost?.active,
  });
  manager.shellRequirement = (id, requirement) => shellRegistry!.requirement(id, requirement);
  manager.shellExecution = (id, requirement) => shellRegistry!.lease(id, requirement);
  updater = new PortableUpdates({
    targets: (): UpdateTarget[] => [
      {
        id: 'host',
        name: 'AppDock',
        kind: 'host',
        version: app.getVersion(),
        source: settings.value.updates.hostSource,
        destination: process.env.PORTABLE_EXECUTABLE_FILE || '',
      },
      ...manager
        .snapshot()
        .filter((e) => e.sourceKind !== 'builtin')
        .map((extension) => ({
          id: extension.id,
          name: extension.displayName,
          kind: 'applet' as const,
          version: extension.version,
          destination: extension.folder,
          source:
            settings.value.extensions[extension.id]?.updateSource ??
            (extension.updateRepository ? `github:${extension.updateRepository}` : ''),
        })),
    ],
    settings: () => settings.value.updates,
    hostVersion: app.getVersion(),
    helper: helperPath,
    validateApplet: (folder) => manager.validateInstall(folder),
    executable: app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe') : '',
    restartArgs: [
      '--restore-view',
      ...(testDirectory
        ? process.argv
            .slice(1)
            .filter(
              (argument) =>
                argument.startsWith('--test-profile=') ||
                argument.startsWith('--test-local-state=') ||
                argument.startsWith('--remote-debugging-port=') ||
                argument.startsWith('--inspect='),
            )
        : []),
    ],
    baseDirectory,
    stateDirectory: dataDirectory,
    fetcher: net.fetch,
    changed,
    notified: (notice, message) => {
      if (notice.kind === 'error') {
        errors.report({
          eventId: notice.id,
          source: 'updates',
          title: '更新処理に失敗しました',
          code: 'UPDATE_OPERATION_FAILED',
          message,
        });
      } else if (notice.kind === 'available') {
        typedNotifications!.publish({ ownerKind: 'host', ownerId: 'updates' }, 'available', {
          level: 'info',
          title: '更新のお知らせ',
          body: message,
          historyText: { title: '更新があります', body: message },
          windowsSilent: true,
          windowsClickAction: 'details',
          actions: [
            {
              key: 'details',
              label: '更新画面を開く',
              run: () => executeCommand('appdock.updates.open'),
            },
          ],
        });
      } else {
        information.report('updates', '更新のお知らせ', message, notice.id, [
          {
            key: 'details',
            label: '更新画面を開く',
            run: () => executeCommand('appdock.updates.open'),
          },
        ]);
      }
    },
    confirm: async (names) => {
      const response = await dialog.showMessageBox(window!, {
        type: 'question',
        title: '更新して再起動',
        message: 'AppDockとすべてのAppletを終了し、更新して再起動します。',
        detail: names.join('\n'),
        buttons: ['更新して再起動', 'キャンセル'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return response.response === 0;
    },
    processIds: () => [
      process.pid,
      ...(process.env.PORTABLE_EXECUTABLE_FILE ? [process.ppid] : []),
      ...[...manager.items.values()].flatMap((item) => (item.child?.pid ? [item.child.pid] : [])),
    ],
    shutdown: () => quitHost(),
    log: (message) => log.write('warn', 'updates', message),
  });
  const hotKeyHost = app.isPackaged
    ? path.join(process.resourcesPath, 'dotnet-host', 'AppDock.ExtensionHost.exe')
    : path.join(app.getAppPath(), '.artifacts', 'dotnet-host', 'AppDock.ExtensionHost.exe');
  hotKeys = new GlobalHotKeyManager(
    new InputCaptureHotKeyBackend(() => gestures),
    async (id) => {
      if (shortcutRecording || quitting || overlayHost?.active) return;
      await executeCommand(id);
    },
    changed,
    (message) => log.write('error', 'hotkeys', message),
    (key, press) => dispatchShortcut(key, true, press),
  );
  pageCollections = new PageCollectionManager({
    settings: () => settings.value,
    parents: () => manager.snapshot(),
    localRoot: dataDirectory,
    sharedRoot: sharedDirectory,
    changed,
    failed: (error) => log.write('error', 'web-profiles', error.message),
    openLocal: async (page) => {
      const parent = manager.items.get(page.binding.owner);
      if (!parent || parent.state !== 'running') throw Error('ページの提供元が停止しています。');
      return openLocalPage(
        {
          appletId: page.id,
          key: pageKey(page.id, 'main'),
          title: page.item.name,
          url: pathToFileURL(contained(parent.manifest.folder, page.definition.ui!)).href,
          preload: path.join(__dirname, 'applet-page-preload.js'),
          stateFile: path.join(
            dataDirectory,
            'pages',
            page.binding.owner,
            page.binding.key,
            page.item.id,
            'window-state.json',
          ),
          defaultDisplay: page.item.display,
          partition: 'applet-page-' + page.id,
          onLayout: () => {},
          onCreated: (contents) =>
            contents.on('before-input-event', (event, input) => {
              if (safePageShortcut(input) && pageHostShortcut(input, page.id))
                event.preventDefault();
            }),
        },
        {
          snapshot: () => ({
            dark: nativeTheme.shouldUseDarkColors,
            page: { id: page.item.id, context: pageCollections.find(page.id)?.item ?? {} },
          }),
          execute: async (id) => {
            if (
              typeof id !== 'string' ||
              parent.state !== 'running' ||
              !parent.commands.some((command) => command.id === id)
            )
              throw Error('自身のコマンドだけを実行できます。');
            return executeCommand(id);
          },
          changed: (callback) => {
            settings.on('changed', callback);
            nativeTheme.on('updated', callback);
            return () => {
              settings.off('changed', callback);
              nativeTheme.off('updated', callback);
            };
          },
        },
      );
    },
  });
  nativeInput = new NativeInput(
    path.join(path.dirname(hotKeyHost), 'input', 'AppDock.InputHost.exe'),
  );
  gestures = new GestureManager(
    path.join(path.dirname(hotKeyHost), 'input', 'AppDock.InputHost.exe'),
    (foregroundWindow) => {
      const focused =
        foregroundWindow === undefined
          ? BrowserWindow.getFocusedWindow()
          : BrowserWindow.getAllWindows().find(
              (candidate) =>
                candidate.getNativeWindowHandle().readBigUInt64LE().toString() === foregroundWindow,
            );
      return {
        settings: settings.value,
        context: {
          ...shortcutContext(foregroundWindow),
          window: focused?.getNativeWindowHandle().readBigUInt64LE().toString() ?? '',
        },
        commands: availableShortcutCommands(),
        recording: shortcutRecording || quitting || !!overlayHost?.active,
      };
    },
    shortcutDispatcher,
    executeCommand,
    (session) => {
      manager.executions.cancel(session);
      for (const item of manager.items.values())
        if (item.peer && !item.peer.closed)
          item.peer.send({ jsonrpc: '2.0', method: 'command.cancel', params: { session } });
    },
    (message) => log.write('error', 'gestures', message),
    {
      pressed: (press) => {
        void hotKeys?.pressed(press).catch((error) => log.write('error', 'hotkeys', String(error)));
      },
      applied: (statuses) => hotKeys?.applied(statuses),
      failed: (error) => {
        hotKeys?.failed(error);
        if (!quitting && hotKeys?.statuses.length)
          settings.health.set('apply-hotkeys', 'apply-failed', ++hotKeyApplyGeneration);
      },
      ownership: setShortcutOwnership,
      recorded: (event) => {
        if (!shortcutRecording || !window?.isFocused()) return;
        shortcutCaptured = event;
        window.webContents.send('dock:shortcutCaptured', event);
        changed();
      },
    },
  );
  manager.on('changed', () => {
    imageLibraryHost.reconcile(
      new Set(
        [...manager.items.values()]
          .filter((e) => ['starting', 'running'].includes(e.state))
          .map((e) => `${e.manifest.id}:${e.runtimeSession ?? ''}`),
      ),
    );
    customCommands.reconcile();
    mcpClient.reconcile();
    pageCollections.reconcile();
    ribbonBadges.reconcile();
    ai.reconcile();
    automation?.reconcileEvents();
    notificationSpeech?.reconcile();
    tts.reconcile();
    typedNotifications?.reconcile();
    for (const e of manager.items.values())
      if (!['starting', 'running'].includes(e.state)) nativeInput?.cancelApplet(e.manifest.id);
    trayMenu();
    void syncHotKeys();
    changed();
  });
  settings.on('changed', () => {
    try {
      customCommands.reconcile();
      mcpClient.reconcile();
      applyAudioPlaybackSettings();
      ribbonBadges.reconcile();
      ai.reconcile();
      automation?.reconcileEvents();
      notificationSpeech?.reconcile();
      tts.reconcile();
      typedNotifications?.reconcile();
      settings.health.clear('apply-services', settings.revision);
    } catch {
      settings.health.set('apply-services', 'apply-failed', settings.revision);
    }
    applySettings();
    void syncHotKeys(true);
    void reconcileSettingsApplets();
    settingsHealthNotifications?.refresh();
  });
  settings.on('statusChanged', () => {
    settingsHealthNotifications?.refresh();
    changed();
  });
  settings.watch(() => {
    /* The health source reports stable failures through ErrorReporter. */
  });
  applySettings();
  await registeredImages.refresh();
  registeredImages.watch();
  nativeTheme.on('updated', () => {
    refreshWindowTheme();
    changed();
  });
  const renderer = path.resolve(__dirname, '../../renderer');
  protocol.handle('appdock', (request) => {
    const url = new URL(request.url);
    if (url.host === 'host' && url.pathname.startsWith('/panel-images/')) {
      const image = [...manager.items.values()]
        .flatMap((extension) => extension.panel?.images ?? [])
        .find((item) => item.image === url.href);
      if (!image?.imageFile || !fs.existsSync(image.imageFile))
        return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(image.imageFile).href).then(
        (response) =>
          new Response(response.body, {
            headers: {
              'Content-Type': /\.png$/i.test(image.imageFile!)
                ? 'image/png'
                : /\.webp$/i.test(image.imageFile!)
                  ? 'image/webp'
                  : 'image/jpeg',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          }),
      );
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(renderer, relative || 'index.html');
    if (
      url.host !== 'host' ||
      path.relative(renderer, file).startsWith('..') ||
      !fs.existsSync(file)
    )
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);
  windowState = new WindowStateStore(path.join(dataDirectory, 'window-state.json'), (error) =>
    log.write('error', 'window', `ウィンドウ状態の読み込み・保存に失敗しました: ${String(error)}`),
  );
  const primary = screen.getPrimaryDisplay();
  const displays = [
    primary,
    ...screen.getAllDisplays().filter((display) => display.id !== primary.id),
  ];
  const savedWindow = windowState.load(displays.map((display) => display.workArea));
  restoreMaximized = savedWindow?.maximized ?? false;
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'assets', 'icon.ico');
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    ...savedWindow?.bounds,
    minWidth: Math.min(windowMinimum.width, savedWindow?.bounds.width ?? windowMinimum.width),
    minHeight: Math.min(windowMinimum.height, savedWindow?.bounds.height ?? windowMinimum.height),
    title: 'AppDock.at365',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101116' : '#fafbfc',
    show: false,
    frame: false,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: appearanceArguments(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  primaryWindowCreated = true;
  registerAppearance(window.webContents, hostDocumentUrl);
  if (process.platform === 'win32') {
    // Windows Shell needs a real file path, outside app.asar, for the taskbar icon.
    const executable = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe');
    window.setAppDetails({
      appId: 'at365.appdock',
      // A portable app extracts resources temporarily; pinned icons must use its stable EXE.
      appIconPath: process.env.PORTABLE_EXECUTABLE_FILE || windowIcon,
      appIconIndex: 0,
      relaunchCommand: app.isPackaged ? `"${executable}"` : `"${executable}" "${app.getAppPath()}"`,
      relaunchDisplayName: 'AppDock.at365',
    });
  }
  hostModalLayer = new HostModalLayer(window, () => shellRegistry?.touch());
  windowState.track(window);
  notificationService = new NotificationService(
    new NotificationHistoryStore(
      path.join(dataDirectory, 'notifications', 'history.json'),
      (message) => log.write('error', 'notifications', message),
    ),
  );
  const notificationState = new NativeNotificationState(
    path.join(path.dirname(hotKeyHost), 'input', 'AppDock.InputHost.exe'),
  );
  notificationAvailability = new NotificationAvailability({
    query: () => notificationState.accepts(),
    close: () => notificationState.close(),
    failed: () =>
      log.write(
        'error',
        'notifications',
        '通知の表示・読み上げ可否を確認できません。通知センターから確認できます。',
      ),
  });
  notificationSession = new NotificationSession({
    state: () => powerMonitor.getSystemIdleState(1),
    on: (event, callback) => {
      const monitor: NodeJS.EventEmitter = powerMonitor;
      monitor.on(event, callback);
      return () => {
        monitor.removeListener(event, callback);
      };
    },
    changed: (paused) => {
      notificationAvailability?.setBlocked('lock', paused);
      notificationSounds.setPaused(paused);
      notificationService?.setPaused(paused);
    },
  });
  window.on('enter-full-screen', () => notificationAvailability?.setBlocked('fullscreen', true));
  window.on('leave-full-screen', () => notificationAvailability?.setBlocked('fullscreen', false));
  notificationSpeech = new NotificationSpeechService({
    settings: () => settings.value,
    applets: () => manager.snapshot(),
    ready: () => startupReady && !quitting,
    generation: (id) => {
      const e = manager.items.get(id);
      return e && ['starting', 'running'].includes(e.state) ? e.runtimeSession : undefined;
    },
    service: notificationService,
    tts,
    availability: notificationAvailability,
    failed: (id, code) =>
      log.write('error', 'notifications', '[TTS] notificationId=' + id + ' code=' + code),
  });
  typedNotifications = new TypedNotifications(notificationService, {
    settings: () => settings.value,
    applets: () => manager.snapshot(),
    generation: (id) => {
      const e = manager.items.get(id);
      return e && ['starting', 'running'].includes(e.state) ? e.runtimeSession : undefined;
    },
    changed,
    published: (event) => automation?.publishEvent(event),
    presented: (event) => notificationSpeech?.publish(event),
    publicationFailed: () =>
      log.write('error', 'notifications', '通知の読み上げ受付に失敗しました。'),
    policyChanged: (id) => {
      const peer = manager.items.get(id)?.peer;
      if (peer && !peer.closed)
        peer.send({ jsonrpc: '2.0', method: 'notifications.changed', params: {} });
    },
  });
  notificationWindows = new NotificationWindowsAdapter(notificationService, {
    ready: () => startupReady && !quitting,
    openCenter: () => executeCommand('appdock.notifications.open'),
    failed: () =>
      log.write(
        'error',
        'notifications',
        'Windows通知の表示または操作を完了できません。通知センターから確認できます。',
      ),
  });
  notificationBanner = new NotificationSurfaceHost({
    window,
    preload: path.join(__dirname, 'notification-surface-preload.js'),
    controller: new NotificationSurfaceController(
      notificationService,
      () => nativeTheme.shouldUseDarkColors,
    ),
    providers: () => manager.shellProviders(),
    registry: shellRegistry!,
    ready: () => startupReady && !quitting,
    settings: (id) => settings.value.extensions[id]?.settings ?? {},
    execute: executeShellCommand,
    openCenter: () => executeCommand('appdock.notifications.open'),
    layer: () => overlayHost?.layout(),
    failed: (message, unavailable) => {
      log.write('error', 'notifications', message);
      if (unavailable)
        void dialog.showMessageBox(window!, { type: 'error', message, buttons: ['OK'] });
    },
  });
  notificationDesktop = new NotificationDesktopHost({
    service: notificationService,
    parent: window,
    availability: notificationAvailability,
    preload: path.join(__dirname, 'notification-surface-preload.js'),
    dark: () => nativeTheme.shouldUseDarkColors,
    tray: () => tray ?? undefined,
    providers: () => manager.shellProviders(),
    registry: shellRegistry!,
    ready: () => startupReady && !quitting,
    settings: (id) => settings.value.extensions[id]?.settings ?? {},
    execute: executeShellCommand,
    openCenter: () => executeCommand('appdock.notifications.open'),
    failed: (message) => log.write('error', 'notifications', message),
  });
  shellBarHost = new ShellBarHost({
    window,
    preload: path.join(__dirname, 'shell-bar-preload.js'),
    registry: shellRegistry!,
    modalLayer: hostModalLayer,
    ready: () => startupReady && !quitting,
    blocked: () => !!overlayHost?.active,
    content: new WindowBars({
      state: () => {
        const update = updater.state;
        return {
          dark: nativeTheme.shouldUseDarkColors,
          version: app.getVersion(),
          paletteKey: settings.value.shortcuts['appdock.commands.search']?.[0] ?? '',
          maximized: window?.isMaximized() ?? false,
          runningApplets: allApplets().filter(
            (e) => e.sourceKind !== 'builtin' && e.state === 'running',
          ).length,
          update: {
            busy: update.busy,
            blocked: settingsEditing.snapshot().pending || settingsOperationBusy(),
            phase: update.phase,
            cancellable: update.cancellable === true,
            ...(update.progress
              ? {
                  progress: {
                    name: update.progress.name,
                    index: update.progress.index,
                    count: update.progress.count,
                    receivedBytes: update.progress.receivedBytes,
                    totalBytes: update.progress.totalBytes,
                  },
                }
              : {}),
          },
        };
      },
      run: async (operation) => {
        if (operation === 'palette')
          return openCommandPalette({ requestId: randomUUID(), mode: 'execute' });
        if (operation === 'notifications') return notificationBanner?.focus();
        if (operation === 'update') {
          await flushSettingsInputs();
          await updater.install('host');
          return { accepted: true };
        }
        if (operation === 'cancel') return updater.cancel();
        applyWindowAction(operation);
      },
    }),
    settings: (id) => settings.value.extensions[id]?.settings ?? {},
    execute: executeShellCommand,
    shortcut: async (key) => {
      if (!window?.isFocused() || shortcutRecording) return;
      const normalized = normalizeShortcut(key);
      if (!globalShortcutOwnership.has(normalized)) return dispatchShortcut(normalized);
    },
    layer: () => {
      notificationBanner?.layout();
      overlayHost?.layout();
    },
    failed: (region, message, unavailable) => {
      log.write('error', 'shell-bar', `${region}: ${message}`);
      if (unavailable)
        void dialog
          .showMessageBox(window!, {
            type: 'error',
            title: 'Default Shell',
            message,
            buttons: ['再試行', 'ログを開く', '終了'],
            defaultId: 0,
          })
          .then((result) => {
            if (result.response === 0) void retryShell(region);
            else if (result.response === 1) navigation.navigate('logs');
            else quitHost();
          });
    },
  });
  window.on('maximize', changed);
  window.on('unmaximize', changed);
  shellHost = new ShellHost({
    window,
    layer: () => {
      overlayHost?.layout();
    },
    modalLayer: hostModalLayer,
    preload: path.join(__dirname, 'shell-preload.js'),
    ui: presentation,
    openGroup: (id, anchor) =>
      overlayHost?.open(
        new RibbonGroupSession(presentation, id, anchor, () => {
          errors.report({
            eventId: randomUUID(),
            source: 'ribbon',
            title: 'リボンの操作を完了できません',
            code: 'RIBBON_ACTION_FAILED',
            message: 'ボタンの登録元とログを確認し、もう一度操作してください。',
          });
        }),
      ),
    invalidateAnchor: () => overlayHost?.cancelRibbon(),
    execute: executeShellCommand,
    settings: (id) => settings.value.extensions[id]?.settings ?? {},
    providers: () => manager.shellProviders(),
    selected: () => shellRegistry!.configured('ribbon'),
    registry: shellRegistry!,
    safeMode: safeShell,
    ready: () => startupReady && !quitting,
    failureFile: path.join(dataDirectory, 'shell-failures.json'),
    changed,
    log: (message) => log.write('error', 'shell', message),
    failed: (message, retry) => {
      log.write('error', 'shell', message);
      void dialog
        .showMessageBox(window!, {
          type: 'error',
          title: 'Default Shell',
          message: 'リボンを起動できません。',
          detail: message,
          buttons: ['再試行', 'ログを開く', '終了'],
          defaultId: 0,
        })
        .then(async (result) => {
          if (result.response === 0) {
            const p = manager.items.get(defaultShellId);
            if (p?.state === 'error') await manager.restart(defaultShellId);
            retry();
          } else if (result.response === 1) navigation.navigate('logs');
          else quitHost();
        });
    },
    shortcut: (input) => {
      if (
        input.type !== 'keyDown' ||
        input.isAutoRepeat ||
        input.isComposing ||
        shortcutRecording ||
        overlayHost?.active
      )
        return false;
      const key = shortcutFromEvent({
        key: input.key,
        code: input.code,
        ctrlKey: input.control,
        altKey: input.alt,
        shiftKey: input.shift,
        metaKey: input.meta,
      });
      if (!key) return false;
      if (globalShortcutOwnership.has(key)) return false;
      const commands = resolveKeybindings(
        getKeybindings(settings.value),
        key,
        shortcutContext(),
        availableShortcutCommands(),
      );
      if (!commands.length) return false;
      void shortcutDispatcher.dispatch(key, commands);
      return true;
    },
  });
  overlayHost = new OverlayHost({
    asset: (id) => presentation.getAsset(id),
    window,
    preload: path.join(__dirname, 'overlay-preload.js'),
    providers: () => manager.shellProviders(),
    registry: shellRegistry!,
    route: () => navigation.state.route,
    execute: executeShellCommand,
    settings: (id) => settings.value.extensions[id]?.settings ?? {},
    changed: () => {
      void syncHotKeys();
      changed();
    },
    failed: (message) => {
      log.write('error', 'overlay', message);
      if (!overlayHost?.active)
        void dialog.showMessageBox(window!, { type: 'error', message, buttons: ['OK'] });
    },
  });
  const homeExecution = new HomeCommandExecution({
    execute: executeCommand,
    changed,
    completed: (result) => {
      if (!quitting && window && !window.isDestroyed() && navigation.state.route !== 'home')
        window.webContents.send('dock:homeCommandResult', result);
    },
  });
  window.once('closed', () => homeExecution.dispose());
  settingsPageHost = new SettingsPageHost({
    allowed: (request) =>
      startupReady &&
      !quitting &&
      request.kind === 'settings' &&
      request.route === navigation.state.route &&
      ((request.context === 'full' && request.route === 'settings' && !request.pageId) ||
        (request.context === 'applet' &&
          request.route === 'extensions' &&
          typeof request.pageId === 'string' &&
          settingsEditing.catalog().some((p) => p.kind === 'applet' && p.id === request.pageId))),
    flush: flushSettingsInputs,
    changed: (connection) => {
      if (window && !window.isDestroyed())
        window.webContents.send('dock:settingsPage:changed', connection);
    },
    create: async (request) => {
      if (request.pageId && request.pageId !== settingsEditing.snapshot().pageId) {
        const state = settingsEditing.snapshot();
        await settingsEditing.act({
          sessionId: state.sessionId,
          editRevision: state.editRevision,
          operationId: randomUUID(),
          action: { type: 'select-page', pageId: request.pageId },
        });
      }
      return new SettingsPageSession(request, {
        navigation: settingsNavigation,
        editor: settingsEditing,
        host: snapshot,
        changed,
        auxiliary: (page) => ({
          ...settingsPageAuxiliary(page),
          shortcutCapture: settingsRecording ? shortcutCaptured : undefined,
          storage: settingsPageStorage(page),
          settingsFiles: page.id === 'general' ? settings.diagnostics() : undefined,
        }),
        actions: settingsPageActions,
        release: releaseSettingsView,
        resize: (width) => window?.webContents.send('dock:settingsSidebarWidth', width),
      });
    },
  });
  window.webContents.on('did-start-loading', () => settingsPageHost?.dispose());
  window.webContents.on('render-process-gone', () => settingsPageHost?.dispose());
  galleryViewState = new GalleryViewStateStore(
    path.join(dataDirectory, 'image-gallery-state.json'),
  );
  const galleryState = new ImageLibraryPageState(galleryViewState);
  galleryImages = new GalleryImages(registeredImages);
  const galleryFailed = (message: string) =>
    errors.report({
      eventId: randomUUID(),
      source: 'image-library',
      title: '画像ライブラリーの操作を完了できませんでした',
      code: 'IMAGE_LIBRARY_SAVE',
      message,
    });
  const galleryDialogs = new ImageLibraryDialogs({
    send: (request) => {
      if (window && !window.isDestroyed())
        window.webContents.send('dock:imageLibraryDialog', request);
    },
    edit: (operation, request) => {
      if (operation.kind === 'delete-image') {
        if (!request.entry || request.deleteBlocked)
          throw Error('削除する画像を確認してください。');
        return imageLibraryHost.remove(request.entry);
      }
      return imageLibraryHost.edit(operation);
    },
    failed: () =>
      galleryFailed(
        '画像ライブラリーの操作を完了できませんでした。画面の表示と保存先を確認してください。',
      ),
  });
  imageLibraryDialogs = galleryDialogs;
  window.webContents.on('did-start-loading', () => galleryDialogs.cancel());
  window.webContents.on('render-process-gone', () => galleryDialogs.cancel());
  window.once('closed', () => {
    galleryState.closed = true;
    galleryDialogs.cancel();
  });
  hostPages = new HostPages({
    route: () => navigation.state.route,
    blocked: () => !!hostModalLayer?.isActive || !!overlayHost?.active,
    changed: (model) => {
      if (window && !window.isDestroyed()) window.webContents.send('dock:pages:changed', model);
    },
    ready: () => startupReady && !quitting,
    create: (request) =>
      request.kind === 'image-library'
        ? new ImageLibraryPageSession(request, {
            host: imageLibraryHost,
            images: galleryImages,
            state: galleryState,
            groups: () => settings.value.imageLibrary?.groups ?? [],
            dialogs: galleryDialogs,
            dark: () => nativeTheme.shouldUseDarkColors,
            changed,
            failed: galleryFailed,
          })
        : request.kind === 'notifications'
          ? new NotificationCenterController(request, {
              service: notificationService!,
              applets: allApplets,
              dark: () => nativeTheme.shouldUseDarkColors,
              changed,
              confirmDeletion: async (count) =>
                (
                  await dialog.showMessageBox(window!, {
                    type: 'warning',
                    message: '通知履歴を' + count + '件削除しますか？',
                    detail: '終了した通知の履歴だけを削除します。',
                    buttons: ['キャンセル', '削除'],
                    defaultId: 0,
                    cancelId: 0,
                  })
                ).response === 1,
            })
          : request.kind === 'home'
            ? new HomePageSession(request, {
                applets: allApplets,
                commands: uiCommands,
                pins: () => settings.value.pinnedCommands,
                appletOrder: () => settingsEditing.value.appletOrder,
                dark: () => nativeTheme.shouldUseDarkColors,
                execution: homeExecution,
                navigate: executeCommand,
                openApplet: (id) => navigation.navigate('extensions', undefined, id),
              })
            : new LogPageSession(request, {
                entries: () => log.entries,
                sources: () => allApplets().map((e) => ({ id: e.id, title: e.displayName })),
                dark: () => nativeTheme.shouldUseDarkColors,
                openDirectory: async () => {
                  const error = await shell.openPath(log.directory);
                  if (error) throw Error(error);
                },
                sourceChanged: (source) =>
                  window?.webContents.send('dock:logSourceChanged', source),
                changed,
              }),
  });
  window.webContents.on('did-start-loading', () => hostPages?.close());
  window.webContents.on('render-process-gone', () => hostPages?.close());
  configurePageHost({
    overlay: () => {
      notificationBanner?.layout();
      overlayHost?.layout();
    },
    window: () => window,
    display: (key, fallback) => {
      const web = pageCollections.entries().find((entry) => pageKey(entry.id, 'main') === key);
      if (web) return settings.value.extensions[web.id]?.pages?.main?.display ?? web.item.display;
      for (const extension of manager.items.values()) {
        const page = [...(extension.manifest.pages ?? []), ...(extension.dynamicPages ?? [])].find(
          (page) => pageKey(extension.manifest.id, page.id) === key,
        );
        if (page) return pageDisplay(settings.value, extension.manifest.id, page);
      }
      return fallback;
    },
    selected: (key) => {
      // Closing Applet surfaces during shutdown must not overwrite the restart destination.
      if (!quitting && (key || navigation.state.route.startsWith('page:'))) {
        navigation.navigate(key || 'home');
        window?.webContents.send('dock:appletPage', key);
      }
    },
    failed: (message) => log.write('error', 'pages', message),
    shortcut: (input, appletId) => {
      if (
        input.type !== 'keyDown' ||
        input.isAutoRepeat ||
        input.isComposing ||
        shortcutRecording ||
        overlayHost?.active ||
        quitting
      )
        return false;
      const context = shortcutContext();
      if (!context.appFocused || (appletId && context.appletId !== appletId)) return false;
      const key = shortcutFromEvent({
        key: input.key,
        code: input.code,
        ctrlKey: input.control,
        altKey: input.alt,
        shiftKey: input.shift,
        metaKey: input.meta,
        isComposing: input.isComposing,
      });
      if (!key) return false;
      if (globalShortcutOwnership.has(key)) return false;
      const commands = resolveKeybindings(
        getKeybindings(settings.value),
        key,
        context,
        availableShortcutCommands(),
      );
      if (!commands.length) return false;
      void shortcutDispatcher.dispatch(key, commands);
      return true;
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('close', (event) => {
    if (!quitting && settings.value.host.closeToTray && tray) {
      event.preventDefault();
      window?.hide();
    } else {
      quitting = true;
      app.quit();
    }
  });
  window.webContents.on('render-process-gone', (_, details) =>
    log.write('error', 'renderer', details.reason),
  );
  const resumeHotKeys = () => {
    shortcutRecording = false;
    void syncHotKeys();
  };
  window.on('blur', resumeHotKeys);
  window.on('show', changed);
  window.on('hide', changed);
  window.on('minimize', changed);
  window.on('restore', changed);
  window.webContents.on('render-process-gone', resumeHotKeys);
  window.webContents.on('did-start-loading', resumeHotKeys);
  window.webContents.on('did-start-loading', () => updatePageViewport(null, null));
  registerIpc();
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png'));
  tray = new Tray(
    icon.resize({ width: 20, height: 20 }),
    process.platform === 'win32' ? trayIdentity(app.getPath('exe'), baseDirectory) : undefined,
  );
  tray.setToolTip('AppDock.at365');
  trayClicks = new TrayClickDispatcher(
    () => settings.value.host,
    runTrayCommand,
    () =>
      readDoubleClickTime(hotKeyHost).catch((error) => {
        log.write(
          'warn',
          'tray',
          `${String(error)} 既定のダブルクリック判定時間${DEFAULT_DOUBLE_CLICK_TIME_MS}msで待機します。`,
        );
        return DEFAULT_DOUBLE_CLICK_TIME_MS;
      }),
  );
  tray.on('click', () => trayClicks?.click());
  tray.on('double-click', () => trayClicks?.doubleClick());
  trayMenu();
  await window.loadURL(hostDocumentUrl);
  // Reapply after native initialization, which can adjust frameless bounds for DPI.
  if (savedWindow) restoreWindowBounds(window, savedWindow.bounds);
  manager.discover();
  const migrated = initializeGestureDefaults(
    initializeExtensionDefaults(
      withoutMissingSamples(settings.value, manager.items.keys()),
      [...manager.items.values()].map((item) => item.manifest),
    ),
    [...manager.items.values()].map((item) => item.manifest),
  );
  migrated.trayMenu = getTrayMenu(migrated, allApplets());
  if (
    !settings.recovered &&
    !launch.recoveryPending &&
    JSON.stringify(migrated) !== JSON.stringify(settings.value)
  )
    settings.save(migrated, settings.revision);
  await manager.reconcile();
  await syncHotKeys();
  await gestures.start();
  startupReady = true;
  customCommands.reconcile();
  mcpClient.reconcile();
  mcpChanged();
  settingsHealthNotifications = new SettingsHealthNotifications({
    notifications: typedNotifications!,
    errors,
    issues: () => settings.health.all(),
    restartRequired: settingsRestartRequired,
    failed: () =>
      log.write(
        'error',
        'notifications',
        '設定の通知を表示できませんでした。一般設定で状態を確認してください。',
      ),
    actions: (error) => [
      {
        key: 'restart',
        label: '再起動',
        primary: true,
        disabled: settingsOperationBusy() || quitting,
        run: async () => {
          quitHost(true);
        },
      },
      ...(error && settings.recovered && settings.backupCandidate()
        ? [
            {
              key: 'restore',
              label: 'バックアップで復元',
              disabled: settingsOperationBusy() || quitting,
              run: async () => {
                await restoreSettingsBackup();
              },
            },
          ]
        : []),
      { key: 'open', label: '保存先を開く', run: settingsRecoveryUi.openDirectory },
    ],
  });
  settingsHealthNotifications.refresh();
  legacyLocalData = new LegacyLocalDataMonitor({
    inspect: () => inspectLegacyLocalData(baseDirectory, sharedDirectory, dataDirectory),
    warnings,
    changed,
    actions: [
      {
        key: 'details',
        label: '詳細を見る',
        primary: true,
        run: async () => {
          showWindow();
          await navigation.navigate('logs');
        },
      },
    ],
  });
  legacyLocalData.start();
  notificationSpeech?.reconcile();
  automation = new AutomationService({
    localDirectory: dataDirectory,
    baseDirectory,
    version: app.getVersion(),
    eventTypes: () =>
      notificationCatalog(allApplets()).filter((type) =>
        settings.value.notificationPreferences?.overrides.some(
          (row) =>
            row.mcpEvents === true &&
            row.ownerKind === type.ownerKind &&
            row.ownerId === type.ownerId &&
            row.typeId === type.typeId,
        ),
      ),
    encrypt: (value) => {
      if (!safeStorage.isEncryptionAvailable())
        throw Error('Windowsの認証情報保護を利用できません。');
      return safeStorage.encryptString(value).toString('base64');
    },
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
    changed: () => {
      ai.reconcile();
      customCommands.reconcile();
      mcpClient.reconcile();
      changed();
    },
    authorizationChanged: () => {
      customCommands.reconcile();
      mcpClient.reconcile();
      const owner = aiOwner();
      aiMcpGeneration++;
      mcpClient.reconcile();
      ai.forgetOwner(owner);
    },
    audit: (level, message) => log.write(level, 'automation', message),
    writeClipboard: (value) => clipboard.writeText(value),
    informed: (message) => information.report('automation', 'Codex連携', message),
    failed: (code, message) =>
      errors.report({
        eventId: randomUUID(),
        source: 'automation',
        title: 'MCP連携の処理に失敗しました',
        code,
        message,
      }),
    createApi: () => operationApi,
  });
  await automation.initialize();
  changed();
  log.write('info', 'host', 'AppDockを起動しました。');
  const updateResultFile = path.join(dataDirectory, 'update-result.json');
  if (fs.existsSync(updateResultFile)) {
    try {
      const resultBytes = fs.readFileSync(updateResultFile, 'utf8');
      const result = JSON.parse(resultBytes);
      updater.recordPackageResult(result);
      updater.state.phase = result.message;
      if (result.ok === true) {
        publishUpdateResult(resultBytes, {
          typed: typedNotifications!,
          receiptFile: path.join(dataDirectory, 'notifications', 'update-receipt.json'),
          openDetails: () => executeCommand('appdock.updates.open'),
          warn: (message) => log.write('warn', 'updates', message),
        });
      } else {
        updater.state.completion = { ok: false, message: String(result.message) };
        errors.report({
          eventId: randomUUID(),
          source: 'updates',
          title: '更新適用に失敗しました',
          code: 'UPDATE_APPLY_FAILED',
          message: '更新の適用を完了できませんでした。更新画面とログで結果を確認してください。',
        });
      }
      log.write(result.ok ? 'info' : 'error', 'updates', String(result.message));
      const temporary =
        typeof result.temporaryDirectory === 'string'
          ? path.resolve(result.temporaryDirectory)
          : '';
      if (
        temporary &&
        path.dirname(temporary).toLowerCase() === path.resolve(os.tmpdir()).toLowerCase() &&
        /^AppDock-update-[A-Za-z0-9]{6}$/.test(path.basename(temporary))
      ) {
        setTimeout(() => {
          if (fs.existsSync(path.join(dataDirectory, 'update-transaction.json'))) return;
          if (fs.existsSync(temporary) && !fs.lstatSync(temporary).isSymbolicLink())
            void fs.promises
              .rm(temporary, { recursive: true, force: true })
              .catch((error) =>
                log.write(
                  'warn',
                  'updates',
                  `更新用一時ファイルを削除できませんでした: ${String(error)}`,
                ),
              );
        }, 5000);
      }
    } catch (error) {
      log.write('warn', 'updates', String(error));
    }
  }
  startupUpdateTimer = updater.scheduleStartup(smoke, (results) => {
    if (!results.length || quitting) return;
    log.write('info', 'updates', `${results.length}件の更新があります。`);
    try {
      typedNotifications!.publish({ ownerKind: 'host', ownerId: 'updates' }, 'available', {
        level: 'info',
        title: 'AppDock — 更新があります',
        body: results
          .map((result) => `${result.name}: ${result.latestVersion}`)
          .join('\n')
          .slice(0, 2000),
        historyText: { title: '更新があります', body: '利用可能な更新があります。' },
        windowsSilent: true,
        windowsClickAction: 'details',
        actions: [
          {
            key: 'details',
            label: '更新画面を開く',
            run: () => executeCommand('appdock.updates.open'),
          },
        ],
      });
    } catch (error) {
      log.write('error', 'updates', String(error));
    }
  });
  if (smoke) await runSmoke();
  else if (restoreView || !settings.value.host.startMinimized) showWindow();
  activateNotification(process.argv, showWindow);
  if (pendingNotificationArgs) activateNotification(pendingNotificationArgs, showWindow);
  pendingNotificationArgs = undefined;
  // Optional startup command only for an explicit isolated test profile.
  const testCommand =
    testDirectory &&
    process.argv.find((a) => a.startsWith('--test-command='))?.slice('--test-command='.length);
  if (!smoke && testCommand) await manager.execute(testCommand);
}
async function runSmoke() {
  try {
    const title = await window!.webContents.executeJavaScript('document.title');
    if (title !== 'AppDock.at365') throw new Error('Renderer did not load');
    if (manager.snapshot().some((e) => e.sourceKind !== 'builtin'))
      throw new Error('Unexpected applet in a clean smoke profile');
    await new Promise((r) => setTimeout(r, 400));
    tray!.emit('click');
    if (!window!.isVisible()) throw new Error('Default tray click did not open AppDock');
    settings.save(
      {
        ...settings.value,
        host: { ...settings.value.host, trayClickCommand: 'appdock.settings.open' },
      },
      settings.revision,
    );
    tray!.emit('click');
    await new Promise((r) => setTimeout(r, 250));
    if (
      !(await window!.webContents.executeJavaScript(
        "!!document.querySelector('.settings-surface')",
      ))
    )
      throw new Error('Selected tray click did not open settings');
    settings.save(
      {
        ...settings.value,
        host: { ...settings.value.host, trayClickCommand: 'appdock.commands.search' },
      },
      settings.revision,
    );
    tray!.emit('click');
    await new Promise((r) => setTimeout(r, 150));
    if (!overlayHost?.active) throw new Error('Selected tray click did not open command palette');
    window!.hide();
    settings.save(
      { ...settings.value, host: { ...settings.value.host, trayClickCommand: 'missing.command' } },
      settings.revision,
    );
    tray!.emit('click');
    await new Promise((r) => setTimeout(r, 150));
    if (
      !window!.isVisible() ||
      !log.entries.some(
        (entry) => entry.source === 'tray' && entry.message.includes('missing.command'),
      )
    )
      throw new Error('Unavailable tray command did not report error and restore settings access');
    settings.save(
      { ...settings.value, host: { ...settings.value.host, trayClickCommand: 'appdock.open' } },
      settings.revision,
    );
    const libraryImage = await registeredImages.add(
      nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png')).toPNG(),
      'smoke-image.png',
    );
    const libraryUrl = registeredImages.icon(libraryImage);
    const result = await window!.webContents.executeJavaScript(`(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings({...s.settings.value, host: {...s.settings.value.host, theme: 'light'}}, s.settings.revision);
      await window.dock.setPinnedCommands(['appdock.commands.search', 'appdock.settings.open']);
      const saved = await window.dock.snapshot();
      const image = new Image();
      const imageLoaded = await new Promise(resolve => { image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = ${JSON.stringify(libraryUrl)}; });
      return {bridge: !!window.dock, nodeExposed: typeof window.require !== 'undefined', rows: document.querySelectorAll('button').length,
        pins: saved.settings.value.pinnedCommands, paletteKeys: saved.settings.value.shortcuts['appdock.commands.search'], imageLoaded};
    })()`);
    const shellRows = await Promise.all(
      window!.contentView.children
        .filter((view) => view instanceof WebContentsView)
        .map((view) =>
          view.webContents.executeJavaScript(`document.querySelectorAll('button').length`),
        ),
    );
    result.rows += shellRows.reduce((total, count) => total + count, 0);
    if (result.nodeExposed || !result.bridge || result.rows < 5)
      throw new Error('Preload / React check failed');
    if (!result.imageLoaded || result.paletteKeys[0] !== 'Ctrl+P' || result.pins.length !== 2)
      throw new Error('Portable preferences / registered image check failed');
    await new Promise((r) => setTimeout(r, 250));
    fs.mkdirSync(path.join(baseDirectory, 'screenshots'), { recursive: true });
    fs.writeFileSync(
      path.join(baseDirectory, 'screenshots', 'light.png'),
      (await window!.webContents.capturePage()).toPNG(),
    );
    settings.save(
      { ...settings.value, host: { ...settings.value.host, theme: 'dark' } },
      settings.revision,
    );
    await new Promise((r) => setTimeout(r, 250));
    fs.writeFileSync(
      path.join(baseDirectory, 'screenshots', 'dark.png'),
      (await window!.webContents.capturePage()).toPNG(),
    );
    fs.writeFileSync(
      path.join(baseDirectory, 'smoke-result.json'),
      JSON.stringify(
        {
          ok: true,
          result,
          extensions: manager
            .snapshot()
            .map((e) => ({ id: e.id, state: e.state, panel: !!e.panel })),
          settingsPath: settings.file,
          registeredImage: path.join(registeredImages.directory, libraryImage.file),
          trayCommands: {
            defaultOpen: true,
            selectedHostCommands: true,
            unavailableFallback: true,
          },
        },
        null,
        2,
      ),
    );
  } catch (e) {
    fs.writeFileSync(
      path.join(baseDirectory, 'smoke-result.json'),
      JSON.stringify({ ok: false, error: e instanceof Error ? e.stack : String(e) }),
    );
    process.exitCode = 1;
  }
  quitting = true;
  app.quit();
}
app.on('second-instance', (_event, argv) => {
  if (!startupReady) {
    pendingNotificationArgs = argv;
    return;
  }
  if (!activateNotification(argv, showWindow)) showWindow();
});
app.on('before-quit', (event) => {
  clearTimeout(startupUpdateTimer);
  quitting = true;
  trayClicks?.close();
  windowState?.flush();
  if (shutdownFinished || !manager) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  customCommands.cancelAll();
  settingsHealthNotifications?.dispose();
  legacyLocalData?.dispose();
  notificationBanner?.dispose();
  notificationDesktop?.dispose();
  notificationWindows?.dispose();
  notificationSpeech?.dispose();
  notificationAvailability?.dispose();
  notificationSession?.dispose();
  notificationSounds.dispose();
  typedNotifications?.dispose();
  notificationService?.dispose();
  shellHost?.dispose();
  shellBarHost?.dispose();
  overlayHost?.dispose();
  hostPages?.dispose();
  settingsPageHost?.dispose();
  void (async () => {
    for (const stop of [
      () => tts.close(),
      () => audioPlayback.close(),
      () => ai.close(),
      () => mcpClient.shutdown(),
      () => automation?.close(),
      () => gestures?.close(),
      () => nativeInput?.close(),
      () => processLauncher.close(),
      () => hotKeys?.close(),
      () => pageCollections.close(),
      () => manager.shutdown(),
    ]) {
      try {
        await stop();
      } catch {
        log.write('error', 'host', '終了処理の一部に失敗しました。');
      }
    }
  })().finally(() => {
    settings.close();
    registeredImages.stop();
    stopRegisteredImageDecoder();
    imageLibraryHost.cancel();
    tray?.destroy();
    shutdownFinished = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  if (!primaryWindowCreated && !quitting) return;
  if (!tray || quitting) app.quit();
});
if (!locked) app.quit();
else
  void app
    .whenReady()
    .then(async () => {
      await launch.refresh();
      if (!settingsLoadError) await launch.checkRecovery();
      settings.writesBlocked = launch.recoveryPending;
      if (
        !settingsLoadError &&
        !launch.recoveryPending &&
        launch.state.supported &&
        !launch.state.elevated &&
        settings.value.host.runAsAdministrator &&
        !smoke &&
        !process.argv.includes('--appdock-elevation-attempt')
      ) {
        try {
          await launch.restartElevated([
            ...process.argv.slice(1).filter((arg) => !arg.startsWith('--inspect')),
            '--appdock-elevation-attempt',
          ]);
          quitHost();
          return;
        } catch {
          launch.state = {
            ...launch.state,
            error:
              '管理者起動がキャンセルされたか、許可されませんでした。現在は通常権限で動作しています。',
          };
        }
      }
      await initialize();
    })
    .catch((e) => {
      dialog.showErrorBox('AppDock', String(e));
      quitting = true;
      app.quit();
    });

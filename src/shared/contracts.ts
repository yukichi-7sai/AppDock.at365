export interface HostSettings {
  language: import('./host-language').HostLanguage;
  /** Input compatibility only; parseSettings removes this key. */
  shellProvider?: string;
  shellProviders?: Record<string, string>;
  theme: 'dark' | 'light' | 'system';
  zoomFactor: number;
  accentColor: import('./appearance').AccentColor;
  customAccentDark: string;
  customAccentLight: string;
  showHints: boolean;
  soundEnabled: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  startAtLogon: boolean;
  runAsAdministrator: boolean;
  hardwareAcceleration: boolean;
  trayClickCommand: string;
  trayDoubleClickCommand: string | null;
}
export interface ExtensionSettings {
  enabled: boolean;
  updateSource?: string;
  startupDelaySeconds?: number;
  pages?: Record<string, { display: import('./applet-pages').PageDisplay }>;
  settings: Record<string, unknown>;
}
export interface Settings {
  mcpServers?: import('./mcp-client').McpServerRoster;
  customCommands?: import('./custom-commands').CustomCommandBlock;
  migrations?: { webApplet?: { version: 1; owner: string; ids: string[] } };
  tts?: import('./tts').TtsSettings;
  ai?: import('./ai').AiSettings;
  notificationPreferences?: import('./notification-types').NotificationPreferences;
  appletOrder: string[];
  touchpadGestures?: import('./touchpad-gestures').TouchpadGestureSettings;
  gestures?: import('./gestures').GestureSettings;
  gestureDefaultsInitialized?: string[];
  keybindings?: import('./keybindings').Keybinding[];
  keybindingOptions?: import('./keybindings').KeybindingOptions;
  keybindingDefaultsInitialized?: string[];
  schemaVersion: 1;
  host: HostSettings;
  updates: UpdateSettings;
  extensions: Record<string, ExtensionSettings>;
  shortcuts: Record<string, string[]>;
  globalShortcutCommands: string[];
  trayCommands: string[];
  trayMenu?: import('./tray-menu').TrayMenuItem[];
  pinnedCommands: string[];
  ribbon: import('./ribbon').RibbonLayout;
  /** Opaque legacy data retained on save; never used for host presentation. */
  profile?: unknown;
  imageLibrary?: import('./registered-images').ImageLibrary;
}
export interface SettingsSnapshot<T = Settings> {
  value: T;
  revision: number;
  path: string;
  syncError?: string;
  recovered?: boolean;
}
export interface Command {
  id: string;
  title: string;
  description?: string;
}
export interface DeclaredCommand extends Command {
  shellRequirement?: import('./shell').ShellRequirement;
  automation?: boolean;
  activateOnExecute?: boolean;
  aliases?: string[];
}
export interface AppletCommand extends DeclaredCommand {
  disabledReason?: string;
  available: boolean;
  hidden?: boolean;
}
export interface TrayItem {
  title: string;
  command: string;
}
export interface SettingDefinition {
  automation?: boolean;
  secret?: boolean;
  localOnly?: boolean;
  generateCommands?: ('on' | 'off' | 'toggle')[];
  key: string;
  title: string;
  type:
    | 'boolean'
    | 'number'
    | 'string'
    | 'registered-image'
    | 'json'
    | 'select'
    | 'shortcut-list'
    | 'string-list'
    | 'object-list';
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  step?: number;
  options?: SettingOption[];
  dynamic?: boolean;
  fields?: SettingDefinition[];
  itemTitle?: string;
  aliases?: string[];
  format?: 'directory' | 'url';
  numericOptions?: boolean;
  /** Opt-in read-only summary table with grouped editing. */
  list?: {
    columns: string[];
    titleKey: string;
    descriptionKey?: string;
    enabledKey?: string;
    idKey?: string;
    iconKey?: string;
    imageKey?: string;
    confirmDelete?: boolean;
    showIndex?: boolean;
    /** A declared provider action supplies suggestions for an unsaved list record. */
    draftAction?: {
      id: string;
      title: string;
      inputKey: string;
      fields: string[];
      historyKey: string;
    };
  };
  /** Nested storage path for an object-list field; never a JavaScript expression. */
  propertyPath?: string[];
  optionSource?: 'web-profiles';
}
export interface SettingOption {
  label: string;
  value: string;
}
export interface SettingAction {
  title: string;
  command: string;
  description?: string;
  successMessage?: string;
}
/** Presentation only: references existing settings and actions without changing saved values. */
export interface SettingSection {
  id: string;
  title: string;
  description?: string;
  settings?: string[];
  actions?: string[];
  collapsible?: boolean;
}
export interface Panel {
  title: string;
  description?: string;
  facts?: { label: string; value: string }[];
  actions?: PanelAction[];
  tabs?: PanelAction[];
  images?: {
    title: string;
    tooltip?: string;
    imageFile?: string;
    description?: string;
    image?: string;
    actions?: PanelAction[];
  }[];
}
export interface PanelAction {
  title: string;
  command: string;
  actionId?: string;
  selected?: boolean;
}
export interface ExtensionManifest {
  ribbonItems?: import('./ribbon').AppletRibbonItem[];
  customCommandTypes?: import('./custom-commands').CustomCommandType[];
  pageActions?: { id: string; parameters?: Record<string, 'string' | 'number' | 'boolean'> }[];
  pageCollections?: import('./page-collections').PageCollectionDefinition[];
  notificationTypes?: import('./notification-types').NotificationTypeDefinition[];
  shell?: {
    apiVersion: 1;
    ribbonSchemaVersion?: 1 | 2 | 3;
    ui?: string;
    views?: Record<string, string>;
  };
  defaultGestureBindings?: import('./gestures').GestureBinding[];
  apiVersion: 1;
  id: string;
  name: string;
  displayName?: string;
  version: string;
  minimumHostVersion?: string;
  updateRepository?: string;
  startupDelaySeconds?: number;
  description?: string;
  runtime: 'node' | 'dotnet' | 'native' | 'web';
  entry: string;
  type?: string;
  capabilities?: string[];
  settings?: SettingDefinition[];
  settingActions?: SettingAction[];
  settingSections?: SettingSection[];
  commands?: DeclaredCommand[];
  defaultKeybindings?: import('./keybindings').KeybindingDefault[];
  webAccounts?: import('./web-accounts').WebAccountDefinition;
  pages?: import('./applet-pages').AppletPageDefinition[];
}
export interface ExtensionSnapshot extends ExtensionManifest {
  collection?: import('./page-collections').CollectionBinding;
  sourceKind?: 'builtin' | 'external';
  displayName: string;
  folder: string;
  state: 'stopped' | 'waiting' | 'starting' | 'running' | 'stopping' | 'error';
  scheduledStartAt?: number;
  error: string | null;
  enabled: boolean;
  commands: AppletCommand[];
  tray: TrayItem[];
  panel: Panel | null;
  settingOptions: Record<string, SettingOption[]>;
}
export interface LogEntry {
  time: string;
  level: string;
  source: string;
  message: string;
}
export interface HostSnapshot {
  ribbonDisplayMode?: import('./ribbon').RibbonDisplayMode;
  navigation: import('./shell').NavigationState;
  shell: import('./shell').ShellStatus;
  shellRegions?: import('./shell').ShellRegionsSnapshot;
  overlay: { active: boolean; kind: string | null };
  appletApi?: {
    permissions: import('./appdock-api').AppletApiPermissions;
    error?: string;
  };
  launch: LaunchState;
  webAccounts: import('./web-content').WebProfile[];
  webPages: Record<string, import('./web-content').WebPageState>;
  startupReady: boolean;
  windowVisible: boolean;
  updates: UpdateState;
  globalHotKeys: GlobalHotKeyStatus[];
  settings: SettingsSnapshot;
  extensions: ExtensionSnapshot[];
  logs: LogEntry[];
  version: string;
  dataDirectory: string;
  sharedDirectory: string;
  legacyLocalData: boolean;
  runtime: { electron: string; chrome: string; node: string; platform: string; arch: string };
  dark: boolean;
}
export interface GlobalHotKeyStatus {
  commandId: string;
  shortcut: string;
  registered: boolean;
  error?: string;
  backend?: 'hook';
  inputKeys?: string[];
  effectiveBlockOriginalInput?: boolean;
}
export interface DockApi {
  imageLibrary: import('./registered-images').ImageLibraryApi;
  imageLibraryDialog: import('./image-library-page').ImageLibraryDialogApi;
  settingsPage: import('./settings-page').SettingsPageApi;
  settingsEditing(): Promise<import('./settings-editing').SettingsInputState>;
  flushSettings(): Promise<void>;
  onSettingsSidebarWidth(callback: (width: number) => void): () => void;
  editSettings(
    request: import('./settings-editing').SettingsEditRequest,
  ): Promise<import('./settings-editing').SettingsInputState>;
  onSettingsEditingChanged(callback: () => void): () => void;
  pages: import('./host-pages').HostPageApi;
  onLogSourceChanged(callback: (source: string) => void): () => void;
  focusShell(edge: 'first' | 'last'): Promise<void>;
  onShellFocusHost(callback: (edge: 'before' | 'after') => void): () => void;
  navigate(route: string | null, restore?: true): Promise<void>;
  shellViewport(
    bounds: { x: number; y: number; width: number; height: number } | null,
  ): Promise<void>;
  retryShell(): Promise<void>;
  setAppletApiPermissions(permissions: import('./appdock-api').AppletApiPermissions): Promise<void>;
  automation(
    action: import('./automation').AutomationAction,
  ): Promise<import('./automation').AutomationReply>;
  restoreSettingsBackup(revision: number): Promise<SettingsSnapshot | null>;
  refreshLaunchState(): Promise<LaunchState>;
  restartAsAdministrator(): Promise<void>;
  focusNotifications(): Promise<void>;
  onFlushSettingsInputs(callback: (id: string) => void): () => void;
  settingsInputsFlushed(id: string): Promise<void>;
  dispatchShortcut(key: string): Promise<{ executed: number; failed: number } | undefined>;

  webNavigate(id: string, action: 'back' | 'forward' | 'reload' | 'home'): Promise<void>;
  clearWebAccount(id: string): Promise<boolean>;
  createWebAccount(name: string): Promise<import('./web-content').WebProfile>;
  renameWebAccount(id: string, name: string): Promise<void>;
  deleteWebAccount(id: string): Promise<false | 'deleted' | 'deferred'>;
  cancelUpdates(): Promise<boolean>;
  checkAllUpdates(): Promise<UpdateState>;
  installUpdates(target: 'all' | 'host' | 'applets' | string): Promise<UpdateState>;
  onAppletPage(callback: (key: string | null) => void): () => void;
  openAppletPage(extensionId: string, pageId: string): Promise<void>;
  pageViewport(
    key: string | null,
    bounds: { x: number; y: number; width: number; height: number } | null,
  ): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  checkUpdates(id?: string): Promise<UpdateResult>;
  openReleases(id?: string): Promise<void>;
  startExtensionNow(id: string): Promise<void>;
  retryGlobalHotKeys(): Promise<void>;
  setShortcutRecording(recording: boolean): Promise<void>;
  setShortcutCapture(request: { token: string; active: boolean; allowWin: boolean }): Promise<void>;
  onShortcutCaptured(
    callback: (event: { token: string; key: string; sequence: number }) => void,
  ): () => void;
  ownsGlobalShortcut(key: string): boolean;
  onHostCommand(callback: (id: string) => void): () => void;
  onPaletteExecuted(callback: () => void): () => void;
  snapshot(): Promise<HostSnapshot>;
  saveSettings(value: Settings, revision: number): Promise<SettingsSnapshot>;
  setPinnedCommands(ids: string[]): Promise<SettingsSnapshot>;
  openCommandPalette(
    request: import('./overlays').CommandPaletteRequest,
  ): Promise<import('./overlays').CommandPaletteResult>;
  cancelCommandPalette(requestId: string): Promise<void>;
  toggleExtension(id: string, enabled: boolean): Promise<void>;
  restartExtension(id: string): Promise<void>;
  executeCommand(id: string): Promise<unknown>;
  executePanelAction(id: string, actionId: string): Promise<unknown>;
  openPath(kind: 'settings' | 'extensions' | 'logs'): Promise<void>;
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'quit'): Promise<void>;
  barViewport(
    region: import('./shell-bars').ShellBarRegion,
    bounds: import('./shell-bars').ShellBarViewport | null,
  ): Promise<void>;
  focusBar(region: import('./shell-bars').ShellBarRegion, edge: 'first' | 'last'): Promise<void>;
  onBarFocusHost(
    callback: (region: import('./shell-bars').ShellBarRegion, edge: 'before' | 'after') => void,
  ): () => void;
  onChanged(callback: () => void): () => void;
}
export interface LaunchState {
  supported: boolean;
  elevated: boolean;
  registered: boolean;
  taskElevated: boolean;
  taskName: string;
  error?: string;
}
export interface UpdateResult {
  status: 'current' | 'available' | 'unpublished' | 'unsupported' | 'incompatible' | 'error';
  currentVersion: string;
  latestVersion?: string;
  checkedAt: string;
  id?: string;
  name?: string;
  message?: string;
  installable?: boolean;
  releaseUrl?: string;
}
export interface UpdateSettings {
  hostSource: string;
  checkHostOnAboutOpen: boolean;
  checkHostOnStartup: boolean;
  checkAppletsOnStartup: boolean;
  startupDelaySeconds: number;
  notifyOnStartup: boolean;
  allowSameVersion: boolean;
}
export interface UpdateState {
  notice?: { id: string; kind: 'info' | 'available' | 'error'; message: string };
  completion?: { ok: boolean; message: string; operationId?: string };
  cancellable?: boolean;
  progress?: {
    id: string;
    name: string;
    index: number;
    count: number;
    receivedBytes: number;
    totalBytes?: number;
  };
  busy: boolean;
  phase: string;
  results: UpdateResult[];
}

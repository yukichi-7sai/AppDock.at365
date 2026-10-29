import { hostText } from '../../shared/i18n';
import { validateAppletCommonValues } from '../../shared/applet-common-settings';
import { shellView, type ShellRequirement } from '../../shared/shell';
import type { ShellProvider } from './shell-provider-registry';
import { parseNotificationTypes } from '../../shared/notification-types';
import { CommandContexts, enterCommand } from './command-contexts';
import type { InputInvocation } from './command-contexts';
import { parseCustomTypes } from '../../shared/custom-commands';
import { compileCustomType, type CustomCommandProvider } from './custom-commands';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { JsonLinePeer } from './rpc';
import { isObject, type SettingsStore } from './settings';
import { parseSettingDefinitions } from '../../shared/setting-definitions';
import {
  generatedSettingCommands,
  validateSettingCommandIds,
} from '../../shared/settings-commands';
import { parseSettingActions } from '../../shared/setting-actions';
import { parseSettingSections } from '../../shared/setting-sections';
import {
  parseExtensionCommands,
  parseDeclaredCommands,
  maxExtensionCommands,
} from '../../shared/extension-commands';
import { parseKeybindingDefaults } from '../../shared/keybindings';
import { parseGestures, defaultGestures } from '../../shared/gestures';
import { parseVersion, compareVersions, validRepository } from '../../shared/versions';
import { appletDisplayName } from '../../shared/applet-display-name';
import { closeWebAccounts, validateWebAccounts } from './web-accounts';
import { closeAppletPages } from './applet-pages';
import { parseAppletPages } from '../../shared/applet-pages';
import { parseRibbonItems } from '../../shared/ribbon-items';
import { ribbonGroupIcons } from '../../shared/ribbon';
import { appletEnabled } from '../../shared/applet-state';
import { parsePageCollections } from '../../shared/page-collections';
import type {
  ExtensionManifest,
  ExtensionSnapshot,
  Command,
  TrayItem,
  Panel,
  SettingOption,
  AppletCommand,
} from '../../shared/contracts';
function contained(root: string, entry: string) {
  const resolved = fs.realpathSync(path.resolve(root, entry));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(hostText('services.extensions.entryPath'));
  return resolved;
}
function readManifest(
  folder: string,
  sourceKind: 'builtin' | 'external' = 'external',
): LoadedManifest {
  const m: any = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json'), 'utf8'));
  if (
    !isObject(m) ||
    m.apiVersion !== 1 ||
    !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(m.id) ||
    m.id === 'appdock' ||
    String(m.id).startsWith('web.') ||
    typeof m.name !== 'string' ||
    !m.name ||
    m.name.length > 100 ||
    typeof m.version !== 'string' ||
    !['node', 'dotnet', 'native'].includes(m.runtime) ||
    typeof m.entry !== 'string'
  )
    throw new Error(hostText('services.extensions.manifestFormat'));
  if (m.runtime === 'dotnet' && (typeof m.type !== 'string' || !m.type))
    throw new Error(hostText('services.extensions.dotnetType'));
  if (
    m.displayName !== undefined &&
    (typeof m.displayName !== 'string' || !m.displayName.trim() || m.displayName.length > 100)
  )
    throw new Error(hostText('services.extensions.displayName'));
  if (m.description !== undefined && typeof m.description !== 'string')
    throw new Error(hostText('services.extensions.manifestFormat'));
  if (
    (m.icon !== undefined && !ribbonGroupIcons.includes(m.icon)) ||
    (m.tagline !== undefined &&
      (typeof m.tagline !== 'string' || /[\r\n\u2028\u2029]/.test(m.tagline)))
  )
    throw new Error(hostText('services.extensions.manifestFormat'));
  if (m.minimumHostVersion !== undefined) parseVersion(m.minimumHostVersion);
  if (m.updateRepository !== undefined && !validRepository(m.updateRepository))
    throw new Error(hostText('services.extensions.updateRepository'));
  validateAppletCommonValues(m, true);
  if (
    m.capabilities !== undefined &&
    (!Array.isArray(m.capabilities) || m.capabilities.some((c: any) => typeof c !== 'string'))
  )
    throw new Error(hostText('services.extensions.capabilities'));
  const customCommandTypes = parseCustomTypes(m.id, m.customCommandTypes);
  if (
    customCommandTypes.length &&
    (!m.capabilities?.includes('custom-commands') ||
      !m.minimumHostVersion ||
      compareVersions(m.minimumHostVersion, '0.60.0') < 0)
  )
    throw Error(hostText('services.extensions.customCommandCapability'));
  for (const type of customCommandTypes) compileCustomType(type);
  if (m.webAccounts) {
    if (!m.capabilities?.includes('web-accounts'))
      throw Error(hostText('services.extensions.webAccountCapability'));
    validateWebAccounts(folder, m.webAccounts);
    if (
      m.webAccounts.externalLinkSetting !== undefined &&
      (!m.capabilities?.includes('settings') ||
        !(parseSettingDefinitions(m.settings) ?? []).some(
          (setting) =>
            setting.key === m.webAccounts.externalLinkSetting && setting.type === 'boolean',
        ))
    )
      throw Error(hostText('services.extensions.externalLinkSetting'));
    if (
      m.webAccounts.returnToStartOnHideSetting !== undefined &&
      (!m.capabilities?.includes('settings') ||
        !(parseSettingDefinitions(m.settings) ?? []).some(
          (setting) =>
            setting.key === m.webAccounts.returnToStartOnHideSetting && setting.type === 'boolean',
        ))
    )
      throw Error(hostText('services.extensions.returnToStartSetting'));
  }
  delete m.sourceKind;
  if (m.id === 'appdock.default-shell' && sourceKind !== 'builtin')
    throw Error('Reserved Shell ID');
  if (m.shell !== undefined) {
    if (
      !isObject(m.shell) ||
      m.shell.apiVersion !== 1 ||
      (m.shell.ribbonSchemaVersion !== undefined &&
        ![1, 2, 3].includes(m.shell.ribbonSchemaVersion)) ||
      (m.shell.ui === undefined &&
        (!isObject(m.shell.views) || Object.keys(m.shell.views).length === 0)) ||
      !m.capabilities?.includes('shell')
    )
      throw Error('Invalid Shell manifest');
    if (m.shell.ui !== undefined) {
      if (typeof m.shell.ui !== 'string' || !/\.html$/i.test(m.shell.ui))
        throw Error('Invalid Shell UI');
      contained(folder, m.shell.ui);
    }
    if (m.shell.views !== undefined) {
      if (!isObject(m.shell.views) || Object.keys(m.shell.views).length > 32)
        throw Error('Invalid Shell views');
      for (const [kind, ui] of Object.entries(m.shell.views)) {
        if (!/^[a-z][a-z0-9.-]{0,63}$/.test(kind) || typeof ui !== 'string' || !/\.html$/i.test(ui))
          throw Error('Invalid Shell view');
        contained(folder, ui);
      }
    }
  }
  m.notificationTypes = parseNotificationTypes(m.notificationTypes);
  if (
    m.notificationTypes.length &&
    (!m.capabilities?.includes('notifications') ||
      !m.minimumHostVersion ||
      compareVersions(m.minimumHostVersion, '0.30.0') < 0)
  )
    throw Error(hostText('services.extensions.notificationCapability'));
  if (
    sourceKind !== 'builtin' &&
    m.notificationTypes.some((t: any) => !t.defaultTargets.length) &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.31.0') < 0)
  )
    throw Error(hostText('services.extensions.notificationCenterVersion'));
  if (
    sourceKind !== 'builtin' &&
    m.shell?.views?.['notification.desktop'] &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.31.1') < 0)
  )
    throw Error(hostText('services.extensions.desktopNotificationVersion'));
  m.pages = parseAppletPages(m as unknown as ExtensionManifest);
  for (const page of m.pages) if (page.source === 'local') contained(folder, page.ui!);
  m.pageCollections = parsePageCollections(m as unknown as ExtensionManifest);
  if (
    (m.capabilities?.includes('dynamic-pages') ||
      m.capabilities?.includes('web-profiles') ||
      m.pageActions) &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.44.0') < 0)
  )
    throw Error(hostText('services.extensions.dynamicPageVersion'));
  if (
    m.pageActions !== undefined &&
    (!Array.isArray(m.pageActions) ||
      m.pageActions.length > 32 ||
      m.pageActions.some(
        (action: any) =>
          !action ||
          typeof action.id !== 'string' ||
          !/^[a-z][a-z0-9.-]{0,79}$/.test(action.id) ||
          (action.parameters !== undefined &&
            (!isObject(action.parameters) ||
              Object.entries(action.parameters).some(
                ([key, type]) =>
                  !/^[a-z][a-zA-Z0-9]{0,79}$/.test(key) ||
                  !['string', 'number', 'boolean'].includes(String(type)),
              ))),
      ) ||
      new Set(m.pageActions.map((action: any) => action.id)).size !== m.pageActions.length)
  )
    throw Error(hostText('services.extensions.pageActions'));
  for (const collection of m.pageCollections)
    if (collection.source === 'local') contained(folder, collection.ui!);
  const commands = parseDeclaredCommands(m.id, m.commands);
  for (const command of commands ?? []) {
    const requirement = command.shellRequirement;
    if (
      requirement &&
      (!m.capabilities?.includes('shell') ||
        !shellView(m.shell, requirement.region) ||
        command.activateOnExecute ||
        !m.minimumHostVersion ||
        compareVersions(m.minimumHostVersion, '0.34.0') < 0)
    )
      throw Error(hostText('services.extensions.shellRequirement'));
  }
  const settingDefinitions = parseSettingDefinitions(m.settings);
  for (const definition of settingDefinitions ?? []) {
    const action = definition.list?.draftAction;
    if (!action) continue;
    if (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.86.5') < 0)
      throw Error(hostText('services.extensions.settingDraftActionVersion'));
    const declaration = m.pageActions?.find((item: any) => item.id === action.id);
    if (
      !declaration ||
      Object.keys(declaration.parameters ?? {}).length !== 1 ||
      declaration.parameters?.[action.inputKey] !== 'string'
    )
      throw Error(hostText('services.extensions.pageActions'));
  }
  m.ribbonItems = parseRibbonItems({
    ...m,
    settings: settingDefinitions,
  } as unknown as ExtensionManifest);
  if (
    (m.ribbonItems?.length ||
      m.capabilities?.includes('registered-images') ||
      settingDefinitions?.some(
        (s) =>
          s.type === 'registered-image' || s.fields?.some((f) => f.type === 'registered-image'),
      )) &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.69.0') < 0)
  )
    throw Error(hostText('services.extensions.sharedImageVersion'));
  if (
    settingDefinitions?.some((s) => s.list) &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.45.0') < 0)
  )
    throw Error(hostText('services.extensions.listDialogVersion'));
  if (
    settingDefinitions?.some((s) =>
      s.fields?.some((field) => field.optionSource === 'web-profiles'),
    ) &&
    !m.capabilities?.includes('web-profiles')
  )
    throw Error(hostText('services.extensions.profileCapability'));
  validateSettingCommandIds(m.id, settingDefinitions ?? [], commands ?? []);
  if (
    settingDefinitions?.some((s) => s.automation || s.generateCommands) &&
    !m.capabilities?.includes('settings')
  )
    throw Error(hostText('services.extensions.settingsCapability'));
  const bindingCommands = [
    ...(commands ?? []),
    ...generatedSettingCommands(m.id, settingDefinitions ?? [], false),
  ];
  const defaultKeybindings = parseKeybindingDefaults(
    m.defaultKeybindings,
    bindingCommands.map((command) => command.id),
  );
  const defaultGestureBindings = parseGestures({
    ...defaultGestures(),
    bindings: m.defaultGestureBindings ?? [],
  }).bindings;
  if (
    defaultGestureBindings.length > 100 ||
    defaultGestureBindings.some((r) => !bindingCommands.some((c) => c.id === r.command))
  )
    throw Error(hostText('services.extensions.gestureOwnership'));
  const settingActions = parseSettingActions(m.settingActions, bindingCommands);
  const settingSections = parseSettingSections(
    m.settingSections,
    settingDefinitions ?? [],
    settingActions ?? [],
  );
  if (
    settingSections &&
    (!m.minimumHostVersion || compareVersions(m.minimumHostVersion, '0.36.8') < 0)
  )
    throw Error(hostText('services.extensions.settingsSectionVersion'));
  return {
    ...m,
    customCommandTypes,
    settings: settingDefinitions,
    commands,
    defaultKeybindings,
    defaultGestureBindings,
    settingActions,
    settingSections,
    folder,
    sourceKind,
    entryPath: contained(folder, m.entry),
  } as LoadedManifest;
}
type LoadedManifest = ExtensionManifest & {
  folder: string;
  entryPath: string;
  sourceKind: 'builtin' | 'external';
};
export interface ExtensionInstance {
  dynamicPages?: import('../../shared/dynamic-pages').DynamicPageDefinition[];
  pageRevision?: number;
  runtimeSession?: string;
  shellStateRequested?: boolean;
  attention?: boolean;
  manifest: LoadedManifest;
  state: ExtensionSnapshot['state'];
  commands: Command[];
  tray: TrayItem[];
  panel: Panel | null;
  settingOptions: Record<string, SettingOption[]>;
  error: string | null;
  startupMeasurement?: {
    startedAt: number;
    phaseStartedAt: number;
    phase: import('../../shared/contracts').AppletStartupPhase;
    phases: import('../../shared/contracts').AppletStartupPhaseTiming[];
  };
  startupTiming?: ExtensionSnapshot['startupTiming'];
  scheduledStartAt?: number;
  scheduledDelay?: number;
  startTimer?: ReturnType<typeof setTimeout>;
  child?: ChildProcessWithoutNullStreams | null;
  peer?: JsonLinePeer | null;
}
interface ManagerOptions {
  startAllowed?(id: string): boolean;
  reservedCustomTypeIds?(): string[];
  builtinRoots?: string[];
  hostVersion?: string;
  roots: string[];
  settings: SettingsStore;
  nodeExecutable: string;
  nodeWorker: string;
  dotnetHost: string;
  api: (e: ExtensionInstance, method: string, params: any) => Promise<unknown>;
  log: (level: string, source: string, message: string) => void;
}
class ExtensionManager extends EventEmitter {
  shellRequirement: (id: string, requirement?: ShellRequirement) => string | undefined = () =>
    undefined;
  shellExecution?: (id: string, requirement?: ShellRequirement) => (() => boolean) | undefined;
  shellProviders(): ShellProvider[] {
    return [...this.items.values()].map((e) => ({
      id: e.manifest.id,
      version: e.manifest.version,
      shell: e.manifest.shell,
      minimumHostVersion: e.manifest.minimumHostVersion,
      folder: e.manifest.folder,
      sourceKind: e.manifest.sourceKind,
      enabled:
        e.manifest.sourceKind === 'builtin' || appletEnabled(this.settings.value, e.manifest.id),
      state: e.state,
      generation: e.runtimeSession,
    }));
  }
  builtinRoots: string[];
  readonly executions = new CommandContexts();
  roots: string[];
  settings: SettingsStore;
  nodeExecutable: string;
  nodeWorker: string;
  dotnetHost: string;
  api: ManagerOptions['api'];
  log: ManagerOptions['log'];
  items: Map<string, ExtensionInstance>;
  queue: Promise<void>;
  shuttingDown: boolean;
  hostVersion: string;
  reservedCustomTypeIds: () => string[];
  discoveryIssueCount = 0;
  startAllowed: (id: string) => boolean;
  constructor({
    roots,
    builtinRoots = [],
    settings,
    nodeExecutable,
    nodeWorker,
    dotnetHost,
    api,
    log,
    hostVersion = '0.0.0',
    reservedCustomTypeIds = () => [],
    startAllowed = () => true,
  }: ManagerOptions) {
    super();
    this.builtinRoots = builtinRoots;
    this.roots = [...builtinRoots, ...roots];
    this.settings = settings;
    this.nodeExecutable = nodeExecutable;
    this.nodeWorker = nodeWorker;
    this.dotnetHost = dotnetHost;
    this.api = api;
    this.log = log;
    this.items = new Map();
    this.queue = Promise.resolve();
    this.shuttingDown = false;
    this.hostVersion = hostVersion;
    this.reservedCustomTypeIds = reservedCustomTypeIds;
    this.startAllowed = startAllowed;
  }
  validateInstall(folder: string) {
    const manifest = readManifest(folder);
    if (this.items.has(manifest.id)) throw Error(hostText('services.extensions.duplicateApplet'));
    const existingTypes = new Set([
      ...this.reservedCustomTypeIds(),
      ...[...this.items.values()].flatMap((e) =>
        (e.manifest.customCommandTypes ?? []).map((t) => t.id),
      ),
    ]);
    if (manifest.customCommandTypes?.some((t) => existingTypes.has(t.id)))
      throw Error(hostText('services.extensions.customTypeLimit'));
  }
  discover() {
    this.discoveryIssueCount = 0;
    const rejected = new Set<string>();
    for (const root of this.roots) {
      if (!fs.existsSync(root)) continue;
      for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
        if (dir.name === '.transactions') continue;
        if (!dir.isDirectory()) continue;
        const folder = path.join(root, dir.name);
        if (!fs.existsSync(path.join(folder, 'extension.json'))) continue;
        try {
          const manifest = readManifest(
            folder,
            this.builtinRoots.includes(root) ? 'builtin' : 'external',
          );
          if (rejected.has(manifest.id)) {
            this.discoveryIssueCount++;
            continue;
          }
          if (this.items.has(manifest.id)) {
            this.discoveryIssueCount++;
            if (this.items.get(manifest.id)!.manifest.sourceKind !== 'builtin') {
              this.items.delete(manifest.id);
              rejected.add(manifest.id);
            }
            this.log('warn', manifest.id, hostText('services.extensions.duplicateExtension'));
            continue;
          }
          const existingTypes = new Set([
            ...this.reservedCustomTypeIds(),
            ...[...this.items.values()].flatMap((e) =>
              (e.manifest.customCommandTypes ?? []).map((t) => t.id),
            ),
          ]);
          if (manifest.customCommandTypes?.some((t) => existingTypes.has(t.id)))
            throw Error(hostText('services.extensions.globalTypeLimit'));
          this.items.set(manifest.id, {
            manifest,
            state: 'stopped',
            commands: [],
            tray: [],
            panel: null,
            settingOptions: {},
            error: null,
          });
        } catch (e: any) {
          this.discoveryIssueCount++;
          this.log('error', dir.name, e.message);
        }
      }
    }
    this.emit('changed');
  }
  snapshot(): ExtensionSnapshot[] {
    return [...this.items.values()].map((e) => ({
      ...e.manifest,
      pages: [...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])],
      displayName: appletDisplayName(e.manifest),
      state: e.state,
      scheduledStartAt: e.scheduledStartAt,
      startupTiming: e.startupTiming && {
        ...e.startupTiming,
        phases: e.startupTiming.phases?.map((phase) => ({ ...phase })),
      },
      error: e.error,
      enabled:
        e.manifest.sourceKind === 'builtin' || appletEnabled(this.settings.value, e.manifest.id),
      commands: this.commandCatalog(e),
      tray: e.tray,
      panel: e.panel,
      settingOptions: e.settingOptions,
    }));
  }
  canActivateForCommand(e: ExtensionInstance, id: string) {
    if (
      this.shuttingDown ||
      !this.startAllowed(e.manifest.id) ||
      !['stopped', 'waiting'].includes(e.state) ||
      !e.manifest.commands?.some((command) => command.id === id && command.activateOnExecute)
    )
      return false;
    try {
      this.checkCompatibility(e);
      return true;
    } catch {
      return false;
    }
  }
  commandCatalog(e: ExtensionInstance): AppletCommand[] {
    const catalog = new Map<string, AppletCommand>();
    for (const page of e.dynamicPages ?? [])
      catalog.set(page.openCommand, {
        id: page.openCommand,
        title: hostText('services.extensions.openPage', { name: String(page.title) }),
        automation: false,
        available: e.state === 'running',
      });
    for (const command of e.manifest.commands ?? [])
      catalog.set(command.id, {
        ...command,
        available: this.canActivateForCommand(e, command.id),
      });
    for (const command of e.commands)
      catalog.set(command.id, {
        ...(catalog.get(command.id)?.description !== undefined
          ? { description: catalog.get(command.id)!.description }
          : {}),
        ...command,
        // Runtime registration (including replace) cannot grant external access.
        automation:
          e.manifest.commands?.some((c) => c.id === command.id && c.automation === true) ?? false,
        shellRequirement: e.manifest.commands?.find((c) => c.id === command.id)?.shellRequirement,
        available: e.state === 'running',
      });
    for (const command of catalog.values()) {
      const reason = this.shellRequirement(e.manifest.id, command.shellRequirement);
      if (reason) {
        command.available = false;
        command.disabledReason = reason;
      }
    }
    for (const command of e.manifest.commands ?? [])
      for (const alias of command.aliases ?? []) {
        const target = catalog.get(command.id)!;
        catalog.set(alias, {
          id: alias,
          title: target.title,
          ...(target.description !== undefined ? { description: target.description } : {}),
          available: target.available,
          disabledReason: target.disabledReason,
          shellRequirement: target.shellRequirement,
          hidden: true,
        });
      }
    return [
      ...catalog.values(),
      ...generatedSettingCommands(
        e.manifest.id,
        e.manifest.settings ?? [],
        e.state === 'running' && appletEnabled(this.settings.value, e.manifest.id),
      ),
    ];
  }
  reconcile() {
    this.queue = this.queue
      .catch((e) => this.log('error', 'host', e.message))
      .then(async () => {
        if (this.shuttingDown) return;
        for (const e of this.items.values()) {
          if (this.shuttingDown) return;
          const enabled =
            e.manifest.sourceKind === 'builtin' ||
            appletEnabled(this.settings.value, e.manifest.id);
          if (enabled && e.state === 'stopped') await this.schedule(e);
          if (enabled && e.state === 'waiting' && e.scheduledDelay !== this.delay(e))
            await this.schedule(e);
          if (!enabled && ['running', 'error', 'starting', 'waiting'].includes(e.state))
            await this.stop(e);
          if (enabled && e.state === 'running') {
            try {
              await e.peer!.request(
                'settings.changed',
                this.settings.value.extensions[e.manifest.id]?.settings ?? {},
              );
            } catch (err: any) {
              this.log('warn', e.manifest.id, err.message);
            }
          }
        }
        this.emit('changed');
      });
    return this.queue;
  }
  delay(e: ExtensionInstance) {
    if (e.manifest.sourceKind === 'builtin') return 0;
    return (
      this.settings.value.extensions[e.manifest.id]?.startupDelaySeconds ??
      e.manifest.startupDelaySeconds ??
      0
    );
  }
  cancelStart(e: ExtensionInstance) {
    clearTimeout(e.startTimer);
    e.startTimer = undefined;
    e.scheduledStartAt = undefined;
    e.scheduledDelay = undefined;
  }
  checkCompatibility(e: ExtensionInstance) {
    const minimum = e.manifest.minimumHostVersion;
    if (minimum && compareVersions(this.hostVersion, minimum) < 0)
      throw new Error(
        hostText('services.extensions.hostVersion', {
          minimum: String(minimum),
          current: String(this.hostVersion),
        }),
      );
  }
  async schedule(e: ExtensionInstance) {
    if (this.shuttingDown || !this.startAllowed(e.manifest.id)) return;
    this.cancelStart(e);
    e.startupTiming = undefined;
    try {
      this.checkCompatibility(e);
    } catch (err) {
      this.crashed(e, err instanceof Error ? err.message : String(err));
      return;
    }
    const delay = this.delay(e);
    if (!delay) {
      await this.start(e);
      return;
    }
    e.state = 'waiting';
    e.error = null;
    e.scheduledDelay = delay;
    const due = (e.scheduledStartAt = Date.now() + delay * 1000);
    e.startTimer = setTimeout(() => {
      this.queue = this.queue
        .catch((err) => this.log('error', 'host', err.message))
        .then(async () => {
          if (this.shuttingDown || e.state !== 'waiting' || e.scheduledStartAt !== due) return;
          if (!appletEnabled(this.settings.value, e.manifest.id)) {
            await this.stop(e);
            return;
          }
          if (e.scheduledDelay !== this.delay(e)) {
            await this.schedule(e);
            return;
          }
          this.cancelStart(e);
          await this.start(e);
        });
    }, delay * 1000);
    this.log(
      'info',
      e.manifest.id,
      hostText('services.extensions.delayedStart', {
        seconds: String(delay),
        name: String(appletDisplayName(e.manifest)),
      }),
    );
    this.emit('changed');
  }
  async start(e: ExtensionInstance) {
    if (this.shuttingDown || !this.startAllowed(e.manifest.id)) return;
    e.startupTiming = undefined;
    const startedAt = performance.now();
    e.startupMeasurement = { startedAt, phaseStartedAt: startedAt, phase: 'prepare', phases: [] };
    e.runtimeSession = randomUUID();
    e.dynamicPages = [];
    e.pageRevision = (e.pageRevision ?? 0) + 1;
    e.shellStateRequested = false;
    e.state = 'starting';
    e.error = null;
    this.emit('changed');
    try {
      const m = e.manifest;
      this.checkCompatibility(e);
      // Revalidate paths on each activation, including after an external extension update.
      m.entryPath = contained(m.folder, m.entry);
      this.advanceStartup(e, 'process');
      let child: ChildProcessWithoutNullStreams;
      if (m.runtime === 'node')
        child = spawn(this.nodeExecutable, [this.nodeWorker, m.entryPath], {
          cwd: m.folder,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      else if (m.runtime === 'native') {
        child = spawn(m.entryPath, [], {
          cwd: m.folder,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        const exe = path.join(this.dotnetHost, 'AppDock.ExtensionHost.exe');
        if (!fs.existsSync(exe)) throw new Error(hostText('services.extensions.dotnetHostMissing'));
        child = spawn(exe, [m.entryPath, m.type!], {
          cwd: m.folder,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
      e.child = child;
      const generation = e.runtimeSession;
      const current = () => e.child === child && e.runtimeSession === generation;
      const peer = (e.peer = new JsonLinePeer(child.stdout, child.stdin, (method, p) => {
        if (!current()) throw Error(hostText('services.extensions.generationChanged'));
        return this.api(e, method, p);
      }));
      peer.on('closed', () => {
        if (current() && e.state === 'running') {
          child.kill();
          this.crashed(e, hostText('services.extensions.disconnected'));
        }
      });
      child.on('error', (err) => {
        if (current()) this.crashed(e, err.message);
      });
      child.on('exit', (code, signal) => {
        peer.close();
        if (current() && e.state !== 'stopping')
          this.crashed(
            e,
            hostText('services.extensions.exited', { reason: String(code ?? signal) }),
          );
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (data) => {
        if (current()) this.log('warn', m.id, data.slice(0, 4000).trim());
      });
      peer.on('protocolError', (err) => {
        if (!current()) return;
        this.log('error', m.id, err.message);
        if (peer.closed) {
          child.kill();
          this.crashed(e, err.message);
        }
      });
      this.advanceStartup(e, 'activate');
      const result = await peer.request('activate', {
        id: m.id,
        settings: this.settings.value.extensions[m.id]?.settings ?? {},
      });
      if (e.error) throw new Error(e.error);
      this.advanceStartup(e, 'validate');
      if (
        !isObject(result) ||
        !Array.isArray(result.commands) ||
        result.commands.length > maxExtensionCommands ||
        result.commands.some(
          (c: any) =>
            !isObject(c) ||
            typeof c.id !== 'string' ||
            !c.id.startsWith(m.id + '.') ||
            typeof c.title !== 'string',
        )
      )
        throw new Error(hostText('services.extensions.commandRegistration'));
      e.commands = parseExtensionCommands(m.id, result.commands);
      validateSettingCommandIds(m.id, m.settings ?? [], e.commands);
      e.tray = Array.isArray(result.tray)
        ? result.tray.filter(
            (t: any) =>
              isObject(t) &&
              typeof t.title === 'string' &&
              [...e.commands, ...generatedSettingCommands(m.id, m.settings ?? [], true)].some(
                (c) => c.id === t.command,
              ),
          )
        : [];
      this.finishStartup(e, 'success');
      e.state = 'running';
      this.log(
        'info',
        m.id,
        hostText('services.extensions.started', { name: String(appletDisplayName(m)) }),
      );
    } catch (err: any) {
      e.child?.kill();
      this.crashed(e, err.message);
    }
    this.emit('changed');
  }
  advanceStartup(e: ExtensionInstance, phase: import('../../shared/contracts').AppletStartupPhase) {
    const measurement = e.startupMeasurement;
    if (!measurement) return;
    const now = performance.now();
    measurement.phases.push({
      phase: measurement.phase,
      durationMs: Math.max(0, now - measurement.phaseStartedAt),
    });
    measurement.phase = phase;
    measurement.phaseStartedAt = now;
  }
  finishStartup(e: ExtensionInstance, outcome: 'success' | 'error') {
    const measurement = e.startupMeasurement;
    if (!measurement) return;
    const now = performance.now();
    e.startupTiming = {
      durationMs: Math.max(0, now - measurement.startedAt),
      outcome,
      phases: [
        ...measurement.phases,
        { phase: measurement.phase, durationMs: Math.max(0, now - measurement.phaseStartedAt) },
      ],
    };
    e.startupMeasurement = undefined;
  }
  crashed(e: ExtensionInstance, message: string) {
    this.executions.stop(e.manifest.id);
    if (e.state === 'stopping') return;
    this.finishStartup(e, 'error');
    void closeWebAccounts(e.manifest.id);
    closeAppletPages(e.manifest.id);
    e.dynamicPages = [];
    e.pageRevision = (e.pageRevision ?? 0) + 1;
    e.state = 'error';
    e.attention = false;
    e.error = message;
    e.commands = [];
    e.tray = [];
    e.panel = null;
    this.log('error', e.manifest.id, message);
    this.emit('changed');
  }
  async stop(e: ExtensionInstance) {
    this.executions.stop(e.manifest.id);
    this.cancelStart(e);
    e.startupMeasurement = undefined;
    e.state = 'stopping';
    await closeWebAccounts(e.manifest.id);
    closeAppletPages(e.manifest.id);
    e.dynamicPages = [];
    e.pageRevision = (e.pageRevision ?? 0) + 1;
    e.attention = false;
    this.emit('changed');
    const child = e.child;
    try {
      if (e.peer && !e.peer.closed)
        await Promise.race([e.peer.request('deactivate'), new Promise((r) => setTimeout(r, 2000))]);
    } catch (err: any) {
      this.log('warn', e.manifest.id, err.message);
    }
    e.peer?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    }
    e.child = null;
    e.peer = null;
    e.state = 'stopped';
    e.commands = [];
    e.tray = [];
    e.panel = null;
    e.error = null;
    this.emit('changed');
  }
  execute(id: string, invocation?: InputInvocation) {
    for (const item of this.items.values()) {
      const page = item.dynamicPages?.find((candidate) => candidate.openCommand === id);
      if (page) {
        if (item.state !== 'running')
          throw Error(hostText('services.extensions.pageProviderStopped'));
        return this.api(item, 'host.pages.open', { id: page.id });
      }
    }
    for (const item of this.items.values()) {
      const target = item.manifest.commands?.find((command) => command.aliases?.includes(id));
      if (target) {
        id = target.id;
        break;
      }
    }
    const running = [...this.items.values()].find(
      (x) => x.state === 'running' && x.commands.some((c) => c.id === id),
    );
    if (running) {
      invocation = enterCommand(id, invocation, running.manifest.id);
      const reason = this.shellRequirement(
        running.manifest.id,
        running.manifest.commands?.find((c) => c.id === id)?.shellRequirement,
      );
      if (reason) throw Error(reason);
      if (!running.peer || running.peer.closed)
        throw new Error(hostText('services.extensions.disconnected'));
      const valid = this.shellExecution?.(
        running.manifest.id,
        running.manifest.commands?.find((c) => c.id === id)?.shellRequirement,
      );
      return this.executions.run(
        running.manifest.id,
        invocation,
        (executionId) =>
          running.peer!.request('command.execute', {
            id,
            executionId,
            ...(invocation?.session
              ? {
                  invocation: {
                    session: invocation.session,
                    window: invocation.window,
                    process: invocation.process,
                    source: invocation.source,
                  },
                }
              : {}),
          }),
        valid,
      );
    }
    const e = [...this.items.values()].find((item) => this.canActivateForCommand(item, id));
    if (!e) throw new Error(hostText('services.extensions.commandUnavailable'));
    invocation = enterCommand(id, invocation, e.manifest.id);
    const execution = this.queue
      .catch((err) => this.log('error', 'host', err.message))
      .then(async () => {
        if (this.shuttingDown) throw new Error(hostText('services.extensions.quitting'));
        if (e.state !== 'running') {
          if (!this.canActivateForCommand(e, id))
            throw new Error(hostText('services.extensions.commandUnavailable'));
          await this.stop(e);
          this.settings.updateExtension(e.manifest.id, { enabled: true });
          await this.start(e);
        }
        if (
          e.state !== 'running' ||
          !e.commands.some((command) => command.id === id) ||
          !e.peer ||
          e.peer.closed
        )
          throw new Error(e.error ?? hostText('services.extensions.commandNotRegistered'));
        return this.executions.run(e.manifest.id, invocation, (executionId) =>
          e.peer!.request('command.execute', {
            id,
            executionId,
            ...(invocation?.session
              ? {
                  invocation: {
                    session: invocation.session,
                    window: invocation.window,
                    process: invocation.process,
                    source: invocation.source,
                  },
                }
              : {}),
          }),
        );
      });
    this.queue = execution.then(
      () => {},
      () => {},
    );
    return execution;
  }
  customCommandProviders(): CustomCommandProvider[] {
    return [...this.items.values()]
      .filter((e) => e.manifest.customCommandTypes?.length)
      .map((e) => ({
        owner: { kind: 'applet' as const, id: e.manifest.id },
        title: appletDisplayName(e.manifest),
        types: e.manifest.customCommandTypes!,
        generation: e.runtimeSession ?? '',
        available: e.state === 'running' && appletEnabled(this.settings.value, e.manifest.id),
        invoke: async (definition, invocation) => {
          const peer = e.peer,
            generation = e.runtimeSession;
          if (!peer || peer.closed || e.state !== 'running')
            throw Error(hostText('services.extensions.providerStopped'));
          return this.executions.run(e.manifest.id, invocation, async (executionId) => {
            const cancel = () => {
              try {
                peer.send({
                  jsonrpc: '2.0',
                  method: 'customCommand.cancel',
                  params: { executionId },
                });
              } catch {
                /* Closing provider. */
              }
            };
            invocation.signal?.addEventListener('abort', cancel, { once: true });
            try {
              if (invocation.signal?.aborted)
                throw Error(hostText('services.extensions.cancelled'));
              const result = await peer.request(
                'customCommand.execute',
                {
                  definitionId: definition.id,
                  typeId: definition.typeId,
                  configVersion: definition.configVersion,
                  config: definition.config,
                  executionId,
                  invocation: {
                    session: invocation.session ?? executionId,
                    window: invocation.window ?? '',
                    process: invocation.process ?? '',
                    source: invocation.source ?? invocation.origin?.kind ?? 'local',
                  },
                },
                30000,
              );
              if (generation !== e.runtimeSession || e.state !== 'running')
                throw Error(hostText('services.extensions.providerChanged'));
              return result;
            } finally {
              invocation.signal?.removeEventListener('abort', cancel);
            }
          });
        },
      }));
  }
  executePanelAction(extensionId: string, actionId: string) {
    const extension = this.items.get(extensionId);
    const actions = [
      ...(extension?.panel?.actions ?? []),
      ...(extension?.panel?.tabs ?? []),
      ...(extension?.panel?.images ?? []).flatMap((image) => image.actions ?? []),
    ];
    if (
      this.shuttingDown ||
      extension?.state !== 'running' ||
      !extension.peer ||
      extension.peer.closed ||
      typeof actionId !== 'string' ||
      !actions.some((action) => action.actionId === actionId)
    )
      throw new Error(hostText('services.extensions.operationUnavailable'));
    return extension.peer.request('panel.action', { id: actionId });
  }
  restart(id: string, immediate = false) {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const e = this.items.get(id);
        if (!e) throw new Error(hostText('services.extensions.missing'));
        await this.stop(e);
        if (
          (e.manifest.sourceKind === 'builtin' || appletEnabled(this.settings.value, id)) &&
          !this.shuttingDown
        ) {
          if (immediate) await this.start(e);
          else await this.schedule(e);
        }
      });
    return this.queue;
  }
  async shutdown() {
    this.shuttingDown = true;
    await this.queue.catch(() => {});
    await Promise.all([...this.items.values()].map((e) => this.stop(e)));
  }
}
export { ExtensionManager, readManifest, contained };

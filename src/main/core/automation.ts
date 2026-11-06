import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { hostText } from '../../shared/i18n';
import type {
  AutomationAction,
  AutomationReceiver,
  AutomationReply,
  AutomationState,
  McpPermission,
  McpPermissions,
  McpServerSettings,
  ReceiverSettings,
} from '../../shared/automation';
import { retiredMcpPermissionKeys, retiredPermissionActions } from '../../shared/automation';
import type { DeviceSettingsStore } from './device-settings-store';
import type { AutomationApi } from './automation-api';
import { AutomationMcp } from './automation-mcp';
import { McpEvents } from './mcp-events';
import type { NotificationTypeEntry } from '../../shared/notification-types';
import type { NotificationPublication } from './typed-notifications';
import {
  defaultMcpServerSettings,
  networkEndpointAddresses,
  networkHostnames,
} from './automation-network';
import {
  defaultAutomationConfig,
  parseAutomationConfig,
  type AutomationConfig,
} from './automation-config';
import {
  changeRegistration,
  codexConfigPath,
  codexServerName,
  registrationBlock,
  registrationStatus,
  previewRegistrationChange,
} from './codex-registration';
import { atomicWrite } from './settings';

type Credential = { token: string; principal: string };
type Listener = {
  events: McpEvents;
  lease: string;
  server?: AutomationMcp;
  starting: boolean;
  error?: string;
  lastClientAt?: string;
  lastLocalClientAt?: string;
  lastNetworkClientAt?: string;
};
const receivers = ['mcp', 'codex'] as const;
const otherReceiver = (receiver: AutomationReceiver) => (receiver === 'mcp' ? 'codex' : 'mcp');
const endpoint = (port: number) => 'http://127.0.0.1:' + port + '/mcp';
const credential = (token: string): Credential => ({
  token,
  principal: createHash('sha256').update(token).digest('hex'),
});

class AutomationStorageError extends Error {
  constructor() {
    super(hostText('services.automation.saveFailed'));
  }
}

export class AutomationService {
  readonly id: string;
  private readonly file: string;
  private config = defaultAutomationConfig();
  private appliedPermissions: McpPermissions;
  private legacy?: McpServerSettings;
  private deviceConfig?: McpServerSettings;
  private readonly credentials: Partial<Record<AutomationReceiver, Credential>> = {};
  private readonly listeners: Record<AutomationReceiver, Listener>;
  private readonly requests = new Set<Server>();
  private api?: AutomationApi;
  private work?: Promise<unknown>;
  private initialized = false;
  private refreshRequested = false;
  private closed = false;
  private loadError?: string;
  private deviceError?: string;
  private migrationError?: string;
  private registrationConfirmation?: {
    id: string;
    kind: 'register' | 'unregister';
    file: string;
    block: string;
    ownedHash: string | undefined;
    revision: string;
  };

  constructor(
    private options: {
      localDirectory: string;
      baseDirectory: string;
      settings: Pick<DeviceSettingsStore, 'operationPermissions' | 'saveOperationPermissions'>;
      version: string;
      encrypt(value: string): string;
      decrypt(value: string): string;
      mcpServer: {
        read(): McpServerSettings | undefined;
        save(next: McpServerSettings, previous: McpServerSettings | undefined): void;
      };
      createApi(
        writable: () => boolean,
        id: string,
        executable: () => boolean,
        manageable: () => boolean,
        shortcutsEditable: () => boolean,
        gesturesEditable: () => boolean,
        ribbonEditable: () => boolean,
        trayEditable: () => boolean,
      ): AutomationApi;
      changed(): void;
      authorizationChanged?(lease?: string): void;
      audit?(level: string, message: string): void;
      writeClipboard?(value: string): void;
      failed?(code: string, message: string): void;
      informed?(message: string): void;
      eventTypes?(): NotificationTypeEntry[];
    },
  ) {
    this.id =
      'appdock_' +
      createHash('sha256')
        .update(path.resolve(options.baseDirectory).toLowerCase())
        .digest('hex')
        .slice(0, 16);
    this.file = path.join(options.localDirectory, 'automation.json');
    try {
      if (fs.existsSync(this.file)) {
        if (fs.statSync(this.file).size > 262144) throw Error();
        const { config, legacy } = parseAutomationConfig(
          JSON.parse(fs.readFileSync(this.file, 'utf8')),
        );
        for (const receiver of receivers) {
          const sealed = receiver === 'mcp' ? config.token : config.codex.token;
          if (!sealed) continue;
          const token = options.decrypt(sealed);
          if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
          this.credentials[receiver] = credential(token);
        }
        this.config = config;
        this.legacy = legacy;
      }
    } catch {
      this.loadError = hostText('services.automation.readFailed');
    }
    const createListener = (receiver: AutomationReceiver): Listener => ({
      starting: false,
      lease: randomUUID(),
      events: new McpEvents({
        directory: options.localDirectory,
        fileName: receiver === 'codex' ? 'codex-events.json' : undefined,
        encrypt: options.encrypt,
        decrypt: options.decrypt,
        enabled: () => !!this.listeners[receiver].server && this.receiverEnabled(receiver),
        principal: () => this.credentials[receiver]?.principal ?? '',
        types: () => options.eventTypes?.() ?? [],
        audit: (code) => options.audit?.('warn', '[MCP Events] code=' + code),
        failed: (code) => options.failed?.(code, hostText('services.automation.eventsFailed')),
      }),
    });
    this.listeners = { mcp: createListener('mcp'), codex: createListener('codex') };
    this.readDevice();
    this.appliedPermissions = this.options.settings.operationPermissions().mcp ?? {};
  }

  private get mcpSettings() {
    return this.deviceConfig ?? this.legacy ?? defaultMcpServerSettings;
  }

  private settings(receiver: AutomationReceiver): ReceiverSettings {
    return receiver === 'mcp' ? this.mcpSettings : this.config.codex;
  }

  private readDevice() {
    try {
      this.deviceConfig = this.options.mcpServer.read();
      this.deviceError = undefined;
    } catch {
      this.deviceError = hostText('services.automation.readServerSettingsFailed');
    }
  }

  private saveLocal(next: AutomationConfig) {
    try {
      atomicWrite(this.file, JSON.stringify(next, null, 2) + '\n');
      this.config = next;
    } catch {
      throw new AutomationStorageError();
    }
  }

  private saveDevice(next: McpServerSettings) {
    try {
      this.options.mcpServer.save(next, this.deviceConfig);
      this.deviceConfig = next;
    } catch {
      throw new AutomationStorageError();
    }
  }

  private setCredential(receiver: AutomationReceiver) {
    const next = credential(randomBytes(32).toString('hex'));
    let sealed: string;
    try {
      sealed = this.options.encrypt(next.token);
    } catch {
      throw new AutomationStorageError();
    }
    this.saveLocal(
      receiver === 'mcp'
        ? { ...this.config, token: sealed }
        : { ...this.config, codex: { ...this.config.codex, token: sealed } },
    );
    this.credentials[receiver] = next;
  }

  private migrate() {
    if (!this.legacy || this.loadError || this.deviceError) return;
    try {
      // Keep the version 1 file as a retry source until the device write is committed.
      if (!this.deviceConfig) this.saveDevice(this.legacy);
      this.setCredential('codex');
      this.legacy = undefined;
      this.migrationError = undefined;
    } catch {
      if (this.migrationError) return;
      this.migrationError = hostText('services.automation.migrationFailed');
      this.reportFailure('MCP_SAVE_FAILED', this.migrationError);
    }
  }

  private reportFailure(code: string, message: string) {
    try {
      this.options.failed?.(code, message);
    } catch {
      /* Reporting must not change the result. */
    }
  }

  private clearConnections(listener: Listener) {
    listener.lastClientAt = listener.lastLocalClientAt = listener.lastNetworkClientAt = undefined;
  }

  private async stop(receiver: AutomationReceiver) {
    const listener = this.listeners[receiver];
    const server = listener.server;
    listener.server = undefined;
    listener.events.pause();
    this.clearConnections(listener);
    await server?.close();
  }

  private error(receiver: AutomationReceiver) {
    return (
      this.loadError ||
      this.migrationError ||
      (receiver === 'mcp' || this.legacy ? this.deviceError : undefined) ||
      this.listeners[receiver].error
    );
  }

  private receiverEnabled(receiver: AutomationReceiver) {
    return (
      !this.closed &&
      !this.loadError &&
      !this.legacy &&
      (receiver !== 'mcp' || !this.deviceError) &&
      this.settings(receiver).enabled
    );
  }

  authorized(lease?: string) {
    return receivers.some(
      (receiver) =>
        this.receiverEnabled(receiver) &&
        (lease === undefined || this.listeners[receiver].lease === lease),
    );
  }
  activeLeases() {
    return receivers
      .filter((receiver) => this.receiverEnabled(receiver))
      .map((receiver) => this.listeners[receiver].lease);
  }

  allowed(key: McpPermission | (typeof retiredMcpPermissionKeys)[number]) {
    const effectiveKey = (retiredMcpPermissionKeys as readonly string[]).includes(key)
      ? 'allowWrite'
      : (key as McpPermission);
    const { mcp } = this.options.settings.operationPermissions();
    return (
      this.authorized() &&
      mcp?.[effectiveKey] === true &&
      ((key !== 'allowSendInput' && key !== 'allowRunProcesses') || mcp.allowExecute === true)
    );
  }

  private block() {
    return registrationBlock(
      this.id,
      endpoint(this.config.codex.port),
      this.credentials.codex?.token ?? '',
      this.config.codex.serverName,
    );
  }

  private receiverState(receiver: AutomationReceiver) {
    const { enabled, port } = this.settings(receiver);
    const listener = this.listeners[receiver];
    const error = this.error(receiver);
    return {
      enabled,
      port,
      error,
      starting:
        enabled &&
        !listener.server &&
        !this.closed &&
        !error &&
        (!this.initialized || listener.starting),
      running: !!listener.server,
      endpoint: port ? endpoint(port) : '',
      hasToken: !this.loadError && !!this.credentials[receiver],
      lastClientAt: listener.lastClientAt,
    };
  }

  state(): AutomationState {
    const { codex } = this.config;
    const {
      allowWrite = false,
      allowExecute = false,
      allowUseTts = false,
      allowUseAi = false,
      allowUseMcp = false,
      allowSendInput = false,
      allowRunProcesses = false,
    } = this.options.settings.operationPermissions().mcp ?? {};
    const listener = this.listeners.mcp;
    const { connectionScope, networkHostnames } = this.mcpSettings;
    return {
      ...this.receiverState('mcp'),
      connectionScope,
      activeConnectionScope: listener.server ? connectionScope : null,
      networkHostnames: [...networkHostnames],
      networkEndpoints:
        listener.server && connectionScope === 'network'
          ? networkEndpointAddresses().map(
              (address) => 'http://' + address + ':' + this.mcpSettings.port + '/mcp',
            )
          : [],
      canCopyToken: !this.loadError && !!this.credentials.mcp,
      lastLocalClientAt: listener.lastLocalClientAt,
      lastNetworkClientAt: listener.lastNetworkClientAt,
      allowWrite,
      allowExecute,
      allowManageApplets: allowWrite,
      allowEditShortcuts: allowWrite,
      allowEditGestures: allowWrite,
      allowEditTouchpadGestures: allowWrite,
      allowEditRibbon: allowWrite,
      allowUseTts,
      allowUseAi,
      allowUseMcp,
      allowSendInput,
      allowRunProcesses,
      allowManageMcpServers: allowWrite,
      allowEditTray: allowWrite,
      allowManageCustomCommands: allowWrite,
      codex: {
        ...this.receiverState('codex'),
        serverId: codex.serverName,
        configFile: codex.configFile,
        ...(!this.loadError && this.credentials.codex
          ? registrationStatus(
              codex.configFile,
              this.id,
              this.block(),
              codex.owned[codex.configFile],
            )
          : { registration: 'absent' as const }),
      },
    };
  }

  private saveReceiver(receiver: AutomationReceiver, { enabled, port }: ReceiverSettings) {
    if (receiver === 'mcp') this.saveDevice({ ...this.mcpSettings, enabled, port });
    else this.saveLocal({ ...this.config, codex: { ...this.config.codex, enabled, port } });
  }

  private async start(receiver: AutomationReceiver) {
    const listener = this.listeners[receiver];
    if (!this.receiverEnabled(receiver) || listener.server || listener.starting) return;
    listener.starting = true;
    listener.error = undefined;
    this.options.changed();
    let server: AutomationMcp | undefined;
    try {
      const settings = this.settings(receiver);
      const other = otherReceiver(receiver);
      if (this.listeners[other].server?.port === settings.port) throw Error();
      if (!this.credentials[receiver]) this.setCredential(receiver);
      const writable = () => this.allowed('allowWrite');
      this.api ??= this.options.createApi(
        writable,
        this.id,
        () => this.allowed('allowExecute'),
        writable,
        writable,
        writable,
        writable,
        writable,
      );
      server = new AutomationMcp(
        this.api,
        () => this.credentials[receiver]?.token ?? '',
        (local) => {
          if (listener.server !== server || this.closed) return;
          listener.lastClientAt = new Date().toISOString();
          if (local) listener.lastLocalClientAt = listener.lastClientAt;
          else listener.lastNetworkClientAt = listener.lastClientAt;
          this.options.changed();
        },
        this.options.version,
        this.options.audit,
        listener.events,
        () => ({
          kind: 'mcp',
          principal: this.credentials[receiver]?.principal,
          lease: listener.lease,
        }),
        this.requests,
      );
      await server.start(
        settings.port,
        receiver === 'mcp' ? this.mcpSettings.connectionScope : 'local',
        () => (receiver === 'mcp' ? this.mcpSettings.networkHostnames : []),
        true,
      );
      await server.verifyLoopback();
      if (this.closed) {
        await server.close();
        return;
      }
      if (
        receiver === 'mcp' &&
        !isDeepStrictEqual(this.options.mcpServer.read(), this.deviceConfig)
      ) {
        this.refreshRequested = true;
        throw new AutomationStorageError();
      }
      if (settings.port !== server.port) {
        if (this.settings(other).port === server.port) throw Error();
        this.saveReceiver(receiver, { enabled: settings.enabled, port: server.port });
      }
      listener.server = server;
      server.activate();
      listener.events.start();
    } catch (error) {
      await server?.close();
      listener.error =
        error instanceof AutomationStorageError
          ? error.message
          : hostText('services.automation.startFailed');
      this.reportFailure(
        error instanceof AutomationStorageError ? 'MCP_SAVE_FAILED' : 'MCP_START_FAILED',
        listener.error,
      );
    } finally {
      listener.starting = false;
      this.options.changed();
    }
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(operation);
    this.work = task;
    const done = () => {
      this.work = undefined;
      if (this.refreshRequested) this.refreshMcpServer();
    };
    void task.then(done, done);
    return task;
  }

  async initialize() {
    if (this.closed || this.work || this.initialized) return;
    await this.run(async () => {
      this.migrate();
      for (const receiver of receivers) {
        if (!this.error(receiver) && !this.settings(receiver).enabled)
          this.listeners[receiver].events.reconcile(true);
        await this.start(receiver);
      }
      this.initialized = true;
    });
  }

  refreshMcpServer() {
    if (this.closed) return;
    this.refreshRequested = true;
    if (this.work || !this.initialized) return;
    this.refreshRequested = false;
    void this.run(async () => {
      const before = this.mcpSettings;
      const errorBefore = this.deviceError;
      const legacy = this.legacy;
      this.readDevice();
      this.migrate();
      if (this.deviceError || this.legacy) {
        await this.stop('mcp');
      } else if (errorBefore || legacy || !isDeepStrictEqual(before, this.mcpSettings)) {
        await this.applyReceiverSettings('mcp', before, before.connectionScope);
      }
      if (legacy && !this.legacy) await this.start('codex');
      if (
        errorBefore !== this.deviceError ||
        legacy !== this.legacy ||
        !isDeepStrictEqual(before, this.mcpSettings)
      )
        this.options.changed();
    }).catch(() =>
      this.reportFailure('MCP_SAVE_FAILED', hostText('services.automation.saveFailed')),
    );
  }

  private revoke(receiver: AutomationReceiver) {
    const listener = this.listeners[receiver];
    const lease = listener.lease;
    listener.lease = randomUUID();
    this.clearConnections(listener);
    listener.events.reconcile(true);
    this.options.authorizationChanged?.(lease);
  }

  private async applyReceiverSettings(
    receiver: AutomationReceiver,
    previous: ReceiverSettings,
    previousScope = this.mcpSettings.connectionScope,
  ) {
    const next = this.settings(receiver);
    if (!next.enabled && previous.enabled) this.revoke(receiver);
    if (
      !next.enabled ||
      next.port !== previous.port ||
      (receiver === 'mcp' && previousScope !== this.mcpSettings.connectionScope)
    )
      await this.stop(receiver);
    this.listeners[receiver].error = undefined;
    await this.start(receiver);
  }

  publishEvent(event: NotificationPublication) {
    for (const receiver of receivers) this.listeners[receiver].events.publish(event);
  }

  reconcileEvents() {
    for (const receiver of receivers) this.listeners[receiver].events.reconcile();
  }

  async action(action: AutomationAction): Promise<AutomationReply> {
    if (!action || typeof action !== 'object' || typeof action.kind !== 'string')
      throw Error(hostText('services.automation.invalidOperation'));
    if (action.kind === 'status') return { state: this.state() };
    if ((retiredPermissionActions as readonly string[]).includes(action.kind))
      throw Error(hostText('services.automation.retiredPermission'));
    if (this.work || this.closed) throw Error(hostText('services.automation.busy'));
    const receiver = ('receiver' in action ? action.receiver : undefined) ?? 'mcp';
    if (receiver !== 'mcp' && receiver !== 'codex')
      throw Error(hostText('services.automation.invalidOperation'));
    return this.run(async () => {
      if (this.loadError) throw Error(this.loadError);
      if (this.legacy) {
        this.readDevice();
        this.migrate();
        if (this.legacy) throw Error(this.migrationError || this.deviceError);
        for (const side of receivers) await this.start(side);
      }
      if (
        action.kind === 'selectConfig' ||
        action.kind === 'selectName' ||
        (receiver === 'codex' && (action.kind === 'configure' || action.kind === 'rotateToken'))
      )
        this.registrationConfirmation = undefined;
      let message: string | undefined;
      try {
        if (action.kind === 'register' || action.kind === 'unregister') {
          const registration = this.changeRegistration(action);
          if (typeof registration !== 'string')
            return { state: this.state(), registrationConfirmation: registration };
          message = registration;
        } else {
          message = await this.applyAction(action, receiver);
        }
      } catch (error) {
        if (action.kind === 'test') {
          const message = hostText('services.automation.testUnconfirmed');
          this.reportFailure('MCP_CONNECTION_TEST_FAILED', message);
          throw Error(message);
        }
        if (error instanceof AutomationStorageError)
          this.reportFailure('MCP_SAVE_FAILED', error.message);
        // Never echo credentials or raw TOML in an IPC error.
        if (error instanceof Error && !/Bearer |authorization|token =/i.test(error.message))
          throw error;
        throw Error(hostText('services.automation.operationFailed'));
      }
      this.options.changed();
      if (message && message !== this.listeners[receiver].error) {
        try {
          this.options.informed?.(message);
        } catch {
          /* Reporting preserves the result. */
        }
      }
      return { state: this.state(), message };
    });
  }

  private async applyAction(
    action: AutomationAction,
    receiver: AutomationReceiver,
  ): Promise<string | undefined> {
    const settings = this.settings(receiver);
    switch (action.kind) {
      case 'setConnectionScope': {
        if (action.scope !== 'local' && action.scope !== 'network')
          throw Error(hostText('services.automation.invalidScope'));
        const previous = this.mcpSettings;
        if (action.scope === previous.connectionScope) return;
        this.saveDevice({ ...previous, connectionScope: action.scope });
        await this.applyReceiverSettings('mcp', previous, previous.connectionScope);
        return this.listeners.mcp.error || hostText('services.automation.scopeSaved');
      }
      case 'setNetworkHostnames': {
        const names = networkHostnames(action.hostnames);
        if (isDeepStrictEqual(names, this.mcpSettings.networkHostnames)) return;
        this.saveDevice({ ...this.mcpSettings, networkHostnames: names });
        return hostText('services.automation.hostnamesSaved');
      }
      case 'copyToken':
        if (!this.credentials.mcp || !this.options.writeClipboard)
          throw Error(hostText('services.automation.tokenCopyNotReady'));
        try {
          this.options.writeClipboard(this.credentials.mcp.token);
        } catch {
          throw Error(hostText('services.automation.tokenCopyFailed'));
        }
        return hostText('services.automation.tokenCopied');
      case 'copyEndpoint': {
        const state = this.state();
        if (
          !state.running ||
          ![state.endpoint, ...state.networkEndpoints].includes(action.endpoint) ||
          !this.options.writeClipboard
        )
          throw Error(hostText('services.automation.endpointCopyNotReady'));
        try {
          this.options.writeClipboard(action.endpoint);
        } catch {
          throw Error(hostText('services.automation.endpointCopyFailed'));
        }
        return hostText('services.automation.endpointCopied');
      }
      case 'retryStart':
        if (!settings.enabled) throw Error(hostText('services.automation.enableFirst'));
        if (receiver === 'mcp' && this.deviceError) throw Error(this.deviceError);
        await this.start(receiver);
        return this.listeners[receiver].error || hostText('services.automation.running');
      case 'configure': {
        const { enabled, port } = action;
        if (
          typeof enabled !== 'boolean' ||
          !Number.isInteger(port) ||
          port < 0 ||
          port > 65535 ||
          (port > 0 && port < 1024)
        )
          throw Error(hostText('services.automation.invalidPort'));
        if (enabled === settings.enabled && port === settings.port) return;
        if (port && port === this.settings(otherReceiver(receiver)).port)
          throw Error(hostText('services.automation.duplicatePort'));
        this.saveReceiver(receiver, { enabled, port });
        await this.applyReceiverSettings(receiver, settings);
        return this.listeners[receiver].error || hostText('services.automation.configured');
      }
      case 'selectConfig':
        this.saveLocal({
          ...this.config,
          codex: { ...this.config.codex, configFile: codexConfigPath(action.file) },
        });
        return;
      case 'selectName':
        this.saveLocal({
          ...this.config,
          codex: { ...this.config.codex, serverName: codexServerName(action.name) },
        });
        return hostText('services.automation.registrationNameSaved');
      case 'setWrite':
        return this.setPermission(
          'allowWrite',
          action.allowed,
          'services.automation.invalidWritePermission',
          'services.automation.writePermissionSaved',
        );
      case 'setTts':
        return this.setPermission(
          'allowUseTts',
          action.allowed,
          'services.automation.invalidTtsPermission',
          'services.automation.ttsPermissionSaved',
        );
      case 'setInputSending':
      case 'setProcessLaunching':
        return this.setPermission(
          action.kind === 'setInputSending' ? 'allowSendInput' : 'allowRunProcesses',
          action.allowed,
          'services.automation.invalidExecutionPermission',
          'services.automation.executionPermissionSaved',
        );
      case 'setMcpClient':
        return this.setPermission(
          'allowUseMcp',
          action.allowed,
          'services.automation.invalidMcpPermission',
          'services.automation.mcpPermissionSaved',
        );
      case 'setAi':
        return this.setPermission(
          'allowUseAi',
          action.allowed,
          'services.automation.invalidAiPermission',
          'services.automation.aiPermissionSaved',
        );
      case 'setExecution':
        return this.setPermission(
          'allowExecute',
          action.allowed,
          'services.automation.invalidCommandPermission',
          'services.automation.commandPermissionSaved',
        );
      case 'rotateToken': {
        const previous = this.credentials[receiver];
        if (!previous) throw Error(hostText('services.automation.enableFirst'));
        this.setCredential(receiver);
        this.revoke(receiver);
        return hostText('services.automation.credentialsRenewed');
      }
      case 'test': {
        if (!this.listeners[receiver].server)
          throw Error(hostText('services.automation.notRunning'));
        const response = await fetch(endpoint(settings.port), {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: 'Bearer ' + this.credentials[receiver]?.token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'x-appdock-self-test': '1',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'AppDock connection test', version: '1' },
            },
          }),
        });
        const value = (await response.json()) as any;
        if (!response.ok || !value.result?.serverInfo)
          throw Error(hostText('services.automation.testFailed'));
        return hostText('services.automation.testSucceeded');
      }
      default:
        throw Error(hostText('services.automation.unsupportedOperation'));
    }
  }

  private setPermission(
    key: McpPermission,
    allowed: boolean,
    invalidKey: Parameters<typeof hostText>[0],
    savedKey: Parameters<typeof hostText>[0],
  ) {
    if (typeof allowed !== 'boolean') throw Error(hostText(invalidKey));
    this.options.settings.saveOperationPermissions({
      mcp: { ...this.options.settings.operationPermissions().mcp, [key]: allowed },
    });
    this.reconcilePermissions();
    return hostText(savedKey);
  }

  reconcilePermissions() {
    const before = this.appliedPermissions;
    const after = this.options.settings.operationPermissions().mcp ?? {};
    this.appliedPermissions = after;
    if (
      (before.allowUseAi && !after.allowUseAi) ||
      (['allowUseMcp', 'allowSendInput', 'allowRunProcesses'] as const).some(
        (key) => (before[key] === true) !== (after[key] === true),
      )
    )
      this.options.authorizationChanged?.();
  }

  private changeRegistration(
    action: Extract<AutomationAction, { kind: 'register' | 'unregister' }>,
  ) {
    const remove = action.kind === 'unregister';
    if (!remove && !this.listeners.codex.server)
      throw Error(hostText('services.automation.startFirst'));
    if (!this.credentials.codex) throw Error(hostText('services.automation.registrationMissing'));
    const { codex } = this.config;
    const file = codex.configFile;
    const block = this.block();
    const ownedHash = codex.owned[file];
    const pending = this.registrationConfirmation;
    this.registrationConfirmation = undefined;
    let revision: string;
    if (action.confirmationId !== undefined) {
      if (
        !pending ||
        pending.id !== action.confirmationId ||
        pending.kind !== action.kind ||
        pending.file !== file ||
        pending.block !== block ||
        pending.ownedHash !== ownedHash
      )
        throw Error(hostText('services.codexRegistration.settingsChanged'));
      revision = pending.revision;
    } else {
      const preview = previewRegistrationChange(file, this.id, block, ownedHash, remove);
      if (preview.requiresConfirmation) {
        this.registrationConfirmation = {
          id: randomBytes(32).toString('hex'),
          kind: action.kind,
          file,
          block,
          ownedHash,
          revision: preview.revision,
        };
        return {
          id: this.registrationConfirmation.id,
          kind: action.kind,
          name: preview.name,
          configFile: file,
        };
      }
      revision = preview.revision;
    }
    const hash = changeRegistration(file, this.id, block, ownedHash, remove, revision);
    const owned = { ...codex.owned };
    if (remove) delete owned[file];
    else owned[file] = hash!;
    this.saveLocal({ ...this.config, codex: { ...codex, owned } });
    return hostText(remove ? 'services.automation.unregistered' : 'services.automation.registered');
  }

  async close() {
    this.closed = true;
    await this.work?.catch(() => {});
    await Promise.all(
      receivers.map(async (receiver) => {
        await this.stop(receiver);
        await this.listeners[receiver].events.close();
      }),
    );
  }
}

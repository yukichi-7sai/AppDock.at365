import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import type {
  AutomationAction,
  AutomationState,
  AutomationReply,
  ConnectionScope,
  McpPermission,
  McpPermissions,
} from '../../shared/automation';
import { atomicWrite } from './settings';
import { retiredMcpPermissionKeys, retiredPermissionActions } from '../../shared/automation';
import type { DeviceSettingsStore } from './device-settings-store';
import { AutomationApi } from './automation-api';
import { AutomationMcp } from './automation-mcp';
import { McpEvents } from './mcp-events';
import type { NotificationTypeEntry } from '../../shared/notification-types';
import type { NotificationPublication } from './typed-notifications';
import { networkEndpointAddresses, networkHostnames } from './automation-network';
import {
  changeRegistration,
  codexConfigPath,
  codexServerName,
  registrationBlock,
  registrationStatus,
  previewRegistrationChange,
} from './codex-registration';

interface LocalConfig {
  connectionScope: ConnectionScope;
  networkHostnames: string[];
  version: 1;
  enabled: boolean;
  port: number;
  token: string;
  configFile: string;
  serverName: string;
  owned: Record<string, string>;
}
class AutomationStorageError extends Error {
  constructor() {
    super(hostText('services.automation.saveFailed'));
  }
}
export class AutomationService {
  private config: LocalConfig;
  private persistedConfig: LocalConfig;
  private appliedPermissions: McpPermissions;
  private persistedToken = '';
  private api?: AutomationApi;
  private token = '';
  private server?: AutomationMcp;
  private initialized = false;
  private starting = false;
  private events: McpEvents;
  private busy = false;
  private closed = false;
  private loadError?: string;
  private error?: string;
  private lastClientAt?: string;
  private lastLocalClientAt?: string;
  private lastNetworkClientAt?: string;
  readonly id: string;
  private file: string;
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
      authorizationChanged?(): void;
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
    this.config = {
      connectionScope: 'local',
      networkHostnames: [],
      version: 1,
      enabled: false,
      port: 0,
      token: '',
      serverName: 'AppDock',
      configFile: path.join(
        process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
        'config.toml',
      ),
      owned: {},
    };
    try {
      if (fs.existsSync(this.file)) {
        if (fs.statSync(this.file).size > 262144) throw Error();
        const c = JSON.parse(fs.readFileSync(this.file, 'utf8')) as LocalConfig;
        if (
          c.version !== 1 ||
          typeof c.enabled !== 'boolean' ||
          !Number.isInteger(c.port) ||
          c.port < 0 ||
          c.port > 65535 ||
          typeof c.token !== 'string' ||
          !c.owned ||
          typeof c.owned !== 'object' ||
          Array.isArray(c.owned) ||
          Object.values(c.owned).some((v) => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
        )
          throw Error();
        const connectionScope = c.connectionScope === undefined ? 'local' : c.connectionScope;
        if (connectionScope !== 'local' && connectionScope !== 'network') throw Error();
        const token = options.decrypt(c.token);
        if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
        this.config = {
          version: 1,
          enabled: c.enabled,
          port: c.port,
          token: c.token,
          configFile: codexConfigPath(c.configFile),
          serverName: codexServerName(c.serverName ?? 'AppDock'),
          owned: c.owned,
          connectionScope,
          networkHostnames: networkHostnames(
            c.networkHostnames === undefined ? [] : c.networkHostnames,
          ),
        };
        this.token = token;
      }
    } catch {
      this.loadError = hostText('services.automation.readFailed');
    }
    this.persistedConfig = structuredClone(this.config);
    this.persistedToken = this.token;
    this.appliedPermissions = options.settings.operationPermissions().mcp ?? {};
    this.events = new McpEvents({
      directory: options.localDirectory,
      encrypt: options.encrypt,
      decrypt: options.decrypt,
      enabled: () => !!this.server && !this.closed && this.config.enabled && !this.loadError,
      principal: () => createHash('sha256').update(this.token).digest('hex'),
      types: () => options.eventTypes?.() ?? [],
      audit: (code) => options.audit?.('warn', '[MCP Events] code=' + code),
      failed: (code) => options.failed?.(code, hostText('services.automation.eventsFailed')),
    });
    if (!this.config.enabled) this.events.reconcile(true);
  }
  private save() {
    try {
      if (!this.token) {
        this.token = randomBytes(32).toString('hex');
        this.config.token = this.options.encrypt(this.token);
      }
      atomicWrite(this.file, JSON.stringify(this.config, null, 2) + '\n');
      this.persistedConfig = structuredClone(this.config);
      this.persistedToken = this.token;
    } catch {
      this.restoreSaved();
      throw new AutomationStorageError();
    }
  }
  private restoreSaved() {
    this.config = structuredClone(this.persistedConfig);
    this.token = this.persistedToken;
  }
  private reportFailure(code: string, message: string) {
    try {
      this.options.failed?.(code, message);
    } catch {
      /* Reporting must not change the result. */
    }
  }
  private clearConnections() {
    this.lastClientAt = this.lastLocalClientAt = this.lastNetworkClientAt = undefined;
  }
  private async stop() {
    const server = this.server;
    this.server = undefined;
    this.events.pause();
    this.clearConnections();
    await server?.close();
  }
  private setPermission(key: McpPermission, allowed: boolean) {
    this.options.settings.saveOperationPermissions({
      mcp: { ...this.options.settings.operationPermissions().mcp, [key]: allowed },
    });
    this.reconcilePermissions();
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
  allowed(key: McpPermission | (typeof retiredMcpPermissionKeys)[number]) {
    const effectiveKey = (retiredMcpPermissionKeys as readonly string[]).includes(key)
      ? 'allowWrite'
      : (key as McpPermission);
    const { mcp } = this.options.settings.operationPermissions();
    if (this.closed || this.loadError || !this.config.enabled || mcp?.[effectiveKey] !== true)
      return false;
    return key === 'allowSendInput' || key === 'allowRunProcesses'
      ? mcp.allowExecute === true
      : true;
  }
  private block() {
    return registrationBlock(
      this.id,
      `http://127.0.0.1:${this.config.port}/mcp`,
      this.token,
      this.config.serverName,
    );
  }
  state(): AutomationState {
    const {
      allowWrite = false,
      allowExecute = false,
      allowUseTts = false,
      allowUseAi = false,
      allowUseMcp = false,
      allowSendInput = false,
      allowRunProcesses = false,
    } = this.options.settings.operationPermissions().mcp ?? {};
    return {
      connectionScope: this.config.connectionScope,
      activeConnectionScope: this.server ? this.config.connectionScope : null,
      networkHostnames: [...this.config.networkHostnames],
      networkEndpoints:
        this.server && this.config.connectionScope === 'network'
          ? networkEndpointAddresses().map((address) => `http://${address}:${this.config.port}/mcp`)
          : [],
      canCopyToken: !this.loadError && !!this.persistedConfig.token && !!this.token,
      lastLocalClientAt: this.lastLocalClientAt,
      lastNetworkClientAt: this.lastNetworkClientAt,
      enabled: this.config.enabled,
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
      port: this.config.port,
      starting:
        this.config.enabled &&
        !this.server &&
        !this.closed &&
        !this.loadError &&
        (!this.initialized || this.starting),
      running: !!this.server,
      endpoint: this.config.port ? `http://127.0.0.1:${this.config.port}/mcp` : '',
      serverId: this.config.serverName,
      error: this.loadError || this.error,
      lastClientAt: this.lastClientAt,
      configFile: this.config.configFile,
      ...(this.token
        ? registrationStatus(
            this.config.configFile,
            this.id,
            this.block(),
            this.config.owned[this.config.configFile],
          )
        : { registration: 'absent' as const }),
    };
  }
  principal() {
    return createHash('sha256').update(this.token).digest('hex');
  }
  private async start() {
    this.initialized = true;
    if (!this.config.enabled || this.server || this.loadError || this.closed || this.starting)
      return;
    this.starting = true;
    this.error = undefined;
    this.options.changed();
    let server: AutomationMcp | undefined;
    try {
      server = new AutomationMcp(
        (this.api ??= this.options.createApi(
          () => this.allowed('allowWrite'),
          this.id,
          () => this.allowed('allowExecute'),
          () => this.allowed('allowWrite'),
          () => this.allowed('allowWrite'),
          () => this.allowed('allowWrite'),
          () => this.allowed('allowWrite'),
          () => this.allowed('allowWrite'),
        )),
        () => this.token,
        (local) => {
          if (this.server !== server || this.closed) return;
          this.lastClientAt = new Date().toISOString();
          if (local) this.lastLocalClientAt = this.lastClientAt;
          else this.lastNetworkClientAt = this.lastClientAt;
          this.options.changed();
        },
        this.options.version,
        this.options.audit,
        this.events,
      );
      await server.start(
        this.config.port,
        this.config.connectionScope,
        () => this.config.networkHostnames,
        true,
      );
      await server.verifyLoopback();
      if (this.closed) {
        await server.close();
        return;
      }
      this.config.port = server.port;
      this.save();
      this.server = server;
      server.activate();
      this.events.start();
      this.error = undefined;
    } catch (error) {
      await server?.close();
      this.error =
        error instanceof AutomationStorageError
          ? error.message
          : hostText('services.automation.startFailed');
      this.reportFailure(
        error instanceof AutomationStorageError ? 'MCP_SAVE_FAILED' : 'MCP_START_FAILED',
        this.error,
      );
    } finally {
      this.starting = false;
      this.options.changed();
    }
  }
  async initialize() {
    await this.start();
  }
  publishEvent(event: NotificationPublication) {
    this.events.publish(event);
  }
  reconcileEvents() {
    this.events.reconcile();
  }
  async action(action: AutomationAction): Promise<AutomationReply> {
    if (!action || typeof action !== 'object' || typeof action.kind !== 'string')
      throw Error(hostText('services.automation.invalidOperation'));
    if (action.kind === 'status') return { state: this.state() };
    if ((retiredPermissionActions as readonly string[]).includes(action.kind))
      throw Error(hostText('services.automation.retiredPermission'));
    if (this.busy || this.starting || this.closed)
      throw Error(hostText('services.automation.busy'));
    if (this.loadError) throw Error(this.loadError);
    if (action.kind !== 'register' && action.kind !== 'unregister')
      this.registrationConfirmation = undefined;
    this.busy = true;
    const previous = structuredClone(this.config);
    try {
      let message: string | undefined;
      switch (action.kind) {
        case 'setConnectionScope': {
          if (action.scope !== 'local' && action.scope !== 'network')
            throw Error(hostText('services.automation.invalidScope'));
          if (action.scope === this.config.connectionScope) break;
          this.config.connectionScope = action.scope;
          this.save();
          await this.stop();
          this.error = undefined;
          await this.start();
          message = this.error || hostText('services.automation.scopeSaved');
          break;
        }
        case 'setNetworkHostnames': {
          const names = networkHostnames(action.hostnames);
          if (JSON.stringify(names) === JSON.stringify(this.config.networkHostnames)) break;
          this.config.networkHostnames = names;
          this.save();
          message = hostText('services.automation.hostnamesSaved');
          break;
        }
        case 'copyToken':
          if (!this.state().canCopyToken || !this.options.writeClipboard)
            throw Error(hostText('services.automation.tokenCopyNotReady'));
          try {
            this.options.writeClipboard(this.token);
          } catch {
            throw Error(hostText('services.automation.tokenCopyFailed'));
          }
          message = hostText('services.automation.tokenCopied');
          break;
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
          message = hostText('services.automation.endpointCopied');
          break;
        }
        case 'retryStart':
          if (!this.config.enabled) throw Error(hostText('services.automation.enableFirst'));
          await this.start();
          message = this.error || hostText('services.automation.running');
          break;
        case 'configure': {
          if (
            typeof action.enabled !== 'boolean' ||
            !Number.isInteger(action.port) ||
            action.port < 0 ||
            action.port > 65535 ||
            (action.port > 0 && action.port < 1024)
          )
            throw Error(hostText('services.automation.invalidPort'));
          if (action.enabled === this.config.enabled && action.port === this.config.port) break;
          this.config.enabled = action.enabled;
          this.config.port = action.port;
          this.save();
          if (!action.enabled || action.port !== previous.port) {
            if (!action.enabled) {
              this.events.reconcile(true);
              this.options.authorizationChanged?.();
            }
            await this.stop();
          }
          this.error = undefined;
          await this.start();
          message = this.error || hostText('services.automation.configured');
          break;
        }
        case 'selectConfig':
          this.config.configFile = codexConfigPath(action.file);
          this.save();
          break;
        case 'selectName':
          this.config.serverName = codexServerName(action.name);
          this.save();
          message = hostText('services.automation.registrationNameSaved');
          break;
        case 'setWrite':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.operationPermissions.invalid'));
          this.setPermission('allowWrite', action.allowed);
          message = hostText('services.automation.writePermissionSaved');
          break;
        case 'setTts':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidTtsPermission'));
          this.setPermission('allowUseTts', action.allowed);
          message = hostText('services.automation.ttsPermissionSaved');
          break;
        case 'setInputSending':
        case 'setProcessLaunching':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidExecutionPermission'));
          this.setPermission(
            action.kind === 'setInputSending' ? 'allowSendInput' : 'allowRunProcesses',
            action.allowed,
          );
          message = hostText('services.automation.executionPermissionSaved');
          break;
        case 'setMcpClient':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidMcpPermission'));
          this.setPermission('allowUseMcp', action.allowed);
          message = hostText('services.automation.mcpPermissionSaved');
          break;
        case 'setAi':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidAiPermission'));
          this.setPermission('allowUseAi', action.allowed);
          message = hostText('services.automation.aiPermissionSaved');
          break;
        case 'setExecution':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidCommandPermission'));
          this.setPermission('allowExecute', action.allowed);
          message = hostText('services.automation.commandPermissionSaved');
          break;
        case 'register':
        case 'unregister': {
          const remove = action.kind === 'unregister';
          if (!remove && !this.server) throw Error(hostText('services.automation.startFirst'));
          if (!this.token) throw Error(hostText('services.automation.registrationMissing'));
          const file = this.config.configFile,
            block = this.block(),
            ownedHash = this.config.owned[file];
          let revision: string;
          if (action.confirmationId !== undefined) {
            const pending = this.registrationConfirmation;
            this.registrationConfirmation = undefined;
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
            this.registrationConfirmation = undefined;
            const preview = previewRegistrationChange(file, this.id, block, ownedHash, remove);
            if (preview.requiresConfirmation) {
              const id = randomBytes(32).toString('hex');
              this.registrationConfirmation = {
                id,
                kind: action.kind,
                file,
                block,
                ownedHash,
                revision: preview.revision,
              };
              return {
                state: this.state(),
                registrationConfirmation: {
                  id,
                  kind: action.kind,
                  name: preview.name,
                  configFile: file,
                },
              };
            }
            revision = preview.revision;
          }
          const registeredHash = changeRegistration(
            file,
            this.id,
            block,
            ownedHash,
            remove,
            revision,
          );
          if (remove) delete this.config.owned[file];
          else this.config.owned[file] = registeredHash!;
          this.save();
          message = hostText(
            remove ? 'services.automation.unregistered' : 'services.automation.registered',
          );
          break;
        }
        case 'rotateToken':
          if (!this.token) throw Error(hostText('services.automation.enableFirst'));
          this.token = randomBytes(32).toString('hex');
          this.config.token = this.options.encrypt(this.token);
          this.save();
          this.clearConnections();
          this.events.reconcile(true);
          this.options.authorizationChanged?.();
          message = hostText('services.automation.credentialsRenewed');
          break;
        case 'test': {
          if (!this.server) throw Error(hostText('services.automation.notRunning'));
          const response = await fetch(this.state().endpoint, {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: {
              Authorization: `Bearer ${this.token}`,
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
          message = hostText('services.automation.testSucceeded');
          break;
        }
        default:
          throw Error(hostText('services.automation.unsupportedOperation'));
      }
      this.options.changed();
      if (message && message !== this.error) {
        try {
          this.options.informed?.(message);
        } catch {
          /* Reporting preserves the result. */
        }
      }
      return { state: this.state(), message };
    } catch (e) {
      this.restoreSaved();
      if (action.kind === 'test') {
        const message = hostText('services.automation.testUnconfirmed');
        this.reportFailure('MCP_CONNECTION_TEST_FAILED', message);
        throw Error(message);
      }
      if (e instanceof AutomationStorageError) this.reportFailure('MCP_SAVE_FAILED', e.message);
      // Never echo credentials or raw TOML in an IPC error.
      if (e instanceof Error && !/Bearer |authorization|token =/i.test(e.message)) throw e;
      throw Error(hostText('services.automation.operationFailed'));
    } finally {
      this.busy = false;
    }
  }
  async close() {
    this.closed = true;
    await this.events.close();
    await this.stop();
  }
}

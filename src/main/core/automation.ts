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
} from '../../shared/automation';
import { atomicWrite } from './settings';
import { retiredMcpPermissionKeys, retiredPermissionActions } from '../../shared/automation';
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
} from './codex-registration';

interface LocalConfig {
  connectionScope: ConnectionScope;
  networkHostnames: string[];
  version: 1;
  enabled: boolean;
  allowWrite: boolean;
  allowExecute: boolean;
  allowManageApplets?: boolean;
  allowEditShortcuts?: boolean;
  allowEditGestures?: boolean;
  allowEditTouchpadGestures?: boolean;
  allowEditRibbon?: boolean;
  allowUseTts: boolean;
  allowUseAi: boolean;
  allowUseMcp: boolean;
  allowSendInput: boolean;
  allowRunProcesses: boolean;
  allowManageMcpServers?: boolean;
  allowEditTray?: boolean;
  allowManageCustomCommands?: boolean;
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
  private persistedToken = '';
  private api?: AutomationApi;
  private token = '';
  private server?: AutomationMcp;
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
  constructor(
    private options: {
      localDirectory: string;
      baseDirectory: string;
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
      allowWrite: false,
      allowExecute: false,
      allowUseTts: false,
      allowUseAi: false,
      allowUseMcp: false,
      allowSendInput: false,
      allowRunProcesses: false,
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
          typeof c.allowWrite !== 'boolean' ||
          (c.allowExecute !== undefined && typeof c.allowExecute !== 'boolean') ||
          (c.allowManageApplets !== undefined && typeof c.allowManageApplets !== 'boolean') ||
          (c.allowUseTts !== undefined && typeof c.allowUseTts !== 'boolean') ||
          (c.allowUseAi !== undefined && typeof c.allowUseAi !== 'boolean') ||
          (c.allowUseMcp !== undefined && typeof c.allowUseMcp !== 'boolean') ||
          (c.allowSendInput !== undefined && typeof c.allowSendInput !== 'boolean') ||
          (c.allowRunProcesses !== undefined && typeof c.allowRunProcesses !== 'boolean') ||
          (c.allowManageMcpServers !== undefined && typeof c.allowManageMcpServers !== 'boolean') ||
          (c.allowEditTray !== undefined && typeof c.allowEditTray !== 'boolean') ||
          (c.allowManageCustomCommands !== undefined &&
            typeof c.allowManageCustomCommands !== 'boolean') ||
          (c.allowEditRibbon !== undefined && typeof c.allowEditRibbon !== 'boolean') ||
          (c.allowEditTouchpadGestures !== undefined &&
            typeof c.allowEditTouchpadGestures !== 'boolean') ||
          (c.allowEditGestures !== undefined && typeof c.allowEditGestures !== 'boolean') ||
          (c.allowEditShortcuts !== undefined && typeof c.allowEditShortcuts !== 'boolean') ||
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
        c.configFile = codexConfigPath(c.configFile);
        if (c.connectionScope === undefined) c.connectionScope = 'local';
        if (c.connectionScope !== 'local' && c.connectionScope !== 'network') throw Error();
        c.networkHostnames = networkHostnames(
          c.networkHostnames === undefined ? [] : c.networkHostnames,
        );
        c.allowExecute ??= false;
        c.allowUseTts ??= false;
        c.allowUseAi ??= false;
        c.allowUseMcp ??= false;
        c.allowSendInput ??= false;
        c.allowRunProcesses ??= false;
        c.serverName = codexServerName(c.serverName ?? 'AppDock');
        const token = options.decrypt(c.token);
        if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
        this.token = token;
        this.config = c;
      }
    } catch {
      this.loadError = hostText('services.automation.readFailed');
    }
    this.persistedConfig = structuredClone(this.config);
    this.persistedToken = this.token;
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
  private save(permissionsChanged = false) {
    try {
      if (permissionsChanged) for (const key of retiredMcpPermissionKeys) delete this.config[key];
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
    this.clearConnections();
    await server?.close();
  }
  allowed(
    key:
      | 'allowUseTts'
      | 'allowUseAi'
      | 'allowUseMcp'
      | 'allowSendInput'
      | 'allowRunProcesses'
      | 'allowManageMcpServers'
      | 'allowWrite'
      | 'allowExecute'
      | 'allowManageApplets'
      | 'allowEditShortcuts'
      | 'allowEditGestures'
      | 'allowEditTouchpadGestures'
      | 'allowEditRibbon'
      | 'allowManageCustomCommands'
      | 'allowEditTray',
  ) {
    const effectiveKey = (retiredMcpPermissionKeys as readonly string[]).includes(key)
      ? 'allowWrite'
      : key;
    if (this.closed || this.loadError || !this.config.enabled || !this.config[effectiveKey])
      return false;
    return key === 'allowSendInput' || key === 'allowRunProcesses'
      ? this.config.allowExecute
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
      allowWrite: this.config.allowWrite,
      allowExecute: this.config.allowExecute,
      allowManageApplets: this.config.allowWrite,
      allowEditShortcuts: this.config.allowWrite,
      allowEditGestures: this.config.allowWrite,
      allowEditTouchpadGestures: this.config.allowWrite,
      allowEditRibbon: this.config.allowWrite,
      allowUseTts: this.config.allowUseTts,
      allowUseAi: this.config.allowUseAi,
      allowUseMcp: this.config.allowUseMcp,
      allowSendInput: this.config.allowSendInput,
      allowRunProcesses: this.config.allowRunProcesses,
      allowManageMcpServers: this.config.allowWrite,
      allowEditTray: this.config.allowWrite,
      allowManageCustomCommands: this.config.allowWrite,
      port: this.config.port,
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
  private async start() {
    if (!this.config.enabled || this.server || this.loadError || this.closed) return;
    const server = new AutomationMcp(
      (this.api ??= this.options.createApi(
        () => this.config.enabled && this.config.allowWrite && !this.closed,
        this.id,
        () => this.config.enabled && this.config.allowExecute && !this.closed,
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
    try {
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
      await server.close();
      this.error =
        error instanceof AutomationStorageError
          ? error.message
          : hostText('services.automation.startFailed');
      this.reportFailure(
        error instanceof AutomationStorageError ? 'MCP_SAVE_FAILED' : 'MCP_START_FAILED',
        this.error,
      );
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
    if (this.busy || this.closed) throw Error(hostText('services.automation.busy'));
    if (this.loadError) throw Error(this.loadError);
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
            typeof action.allowWrite !== 'boolean' ||
            !Number.isInteger(action.port) ||
            action.port < 0 ||
            action.port > 65535 ||
            (action.port > 0 && action.port < 1024)
          )
            throw Error(hostText('services.automation.invalidPort'));
          if (
            action.enabled === this.config.enabled &&
            action.allowWrite === this.config.allowWrite &&
            action.port === this.config.port &&
            !retiredMcpPermissionKeys.some((key) => Object.hasOwn(this.config, key))
          )
            break;
          this.config.enabled = action.enabled;
          this.config.allowWrite = action.allowWrite;
          this.config.port = action.port;
          this.save(true);
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
        case 'setTts':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidTtsPermission'));
          this.config.allowUseTts = action.allowed;
          this.save(true);
          message = hostText('services.automation.ttsPermissionSaved');
          break;
        case 'setInputSending':
        case 'setProcessLaunching':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidExecutionPermission'));
          this.config[action.kind === 'setInputSending' ? 'allowSendInput' : 'allowRunProcesses'] =
            action.allowed;
          this.save(true);
          this.options.authorizationChanged?.();
          message = hostText('services.automation.executionPermissionSaved');
          break;
        case 'setMcpClient':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidMcpPermission'));
          this.config.allowUseMcp = action.allowed;
          this.save(true);
          this.options.authorizationChanged?.();
          message = hostText('services.automation.mcpPermissionSaved');
          break;
        case 'setAi':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidAiPermission'));
          this.config.allowUseAi = action.allowed;
          this.save(true);
          if (!action.allowed) this.options.authorizationChanged?.();
          message = hostText('services.automation.aiPermissionSaved');
          break;
        case 'setExecution':
          if (typeof action.allowed !== 'boolean')
            throw Error(hostText('services.automation.invalidCommandPermission'));
          this.config.allowExecute = action.allowed;
          this.save(true);
          message = hostText('services.automation.commandPermissionSaved');
          break;
        case 'register':
          if (!this.server) throw Error(hostText('services.automation.startFirst'));
          this.config.owned[this.config.configFile] = changeRegistration(
            this.config.configFile,
            this.id,
            this.block(),
            this.config.owned[this.config.configFile],
          )!;
          this.save();
          message = hostText('services.automation.registered');
          break;
        case 'unregister':
          if (!this.token) throw Error(hostText('services.automation.registrationMissing'));
          changeRegistration(
            this.config.configFile,
            this.id,
            this.block(),
            this.config.owned[this.config.configFile],
            true,
          );
          delete this.config.owned[this.config.configFile];
          this.save();
          message = hostText('services.automation.unregistered');
          break;
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

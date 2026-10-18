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
  allowManageApplets: boolean;
  allowEditShortcuts: boolean;
  allowEditGestures: boolean;
  allowEditRibbon: boolean;
  allowUseTts: boolean;
  allowUseAi: boolean;
  allowUseMcp: boolean;
  allowManageMcpServers: boolean;
  allowEditTray: boolean;
  allowManageCustomCommands: boolean;
  port: number;
  token: string;
  configFile: string;
  serverName: string;
  owned: Record<string, string>;
}
class AutomationStorageError extends Error {
  constructor() {
    super('連携設定を保存できません。保存先のアクセス権と空き容量を確認してください。');
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
      allowManageApplets: false,
      allowEditShortcuts: false,
      allowEditGestures: false,
      allowEditRibbon: false,
      allowUseTts: false,
      allowUseAi: false,
      allowUseMcp: false,
      allowManageMcpServers: false,
      allowEditTray: false,
      allowManageCustomCommands: false,
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
          (c.allowManageMcpServers !== undefined && typeof c.allowManageMcpServers !== 'boolean') ||
          (c.allowEditTray !== undefined && typeof c.allowEditTray !== 'boolean') ||
          (c.allowManageCustomCommands !== undefined &&
            typeof c.allowManageCustomCommands !== 'boolean') ||
          (c.allowEditRibbon !== undefined && typeof c.allowEditRibbon !== 'boolean') ||
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
        c.allowManageApplets ??= false;
        c.allowEditShortcuts ??= false;
        c.allowEditGestures ??= false;
        c.allowEditRibbon ??= false;
        c.allowUseTts ??= false;
        c.allowUseAi ??= false;
        c.allowUseMcp ??= false;
        c.allowManageMcpServers ??= false;
        c.allowEditTray ??= false;
        c.allowManageCustomCommands ??= false;
        c.serverName = codexServerName(c.serverName ?? 'AppDock');
        const token = options.decrypt(c.token);
        if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
        this.token = token;
        this.config = c;
      }
    } catch {
      this.loadError = '連携設定を読み取れません。PC専用のautomation.jsonを確認してください。';
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
      failed: (code) =>
        options.failed?.(
          code,
          'MCP Eventsの保存または配信を完了できませんでした。ログとMCP接続、通知の監視登録を確認してください。',
        ),
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
    this.clearConnections();
    await server?.close();
  }
  allowed(
    key:
      | 'allowUseTts'
      | 'allowUseAi'
      | 'allowUseMcp'
      | 'allowManageMcpServers'
      | 'allowWrite'
      | 'allowExecute'
      | 'allowManageApplets'
      | 'allowEditShortcuts'
      | 'allowEditGestures'
      | 'allowEditRibbon'
      | 'allowManageCustomCommands'
      | 'allowEditTray',
  ) {
    if (this.closed || this.loadError || !this.config.enabled || !this.config[key]) return false;
    if (key === 'allowManageCustomCommands' || key === 'allowManageMcpServers') return true;
    if (key === 'allowUseTts' || key === 'allowUseAi' || key === 'allowUseMcp') return true;
    if (key === 'allowWrite' || key === 'allowExecute') return true;
    return this.config.allowExecute && (key === 'allowManageApplets' || this.config.allowWrite);
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
      allowManageApplets: this.config.allowManageApplets,
      allowEditShortcuts: this.config.allowEditShortcuts,
      allowEditGestures: this.config.allowEditGestures,
      allowEditRibbon: this.config.allowEditRibbon,
      allowUseTts: this.config.allowUseTts,
      allowUseAi: this.config.allowUseAi,
      allowUseMcp: this.config.allowUseMcp,
      allowManageMcpServers: this.config.allowManageMcpServers,
      allowEditTray: this.config.allowEditTray,
      allowManageCustomCommands: this.config.allowManageCustomCommands,
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
        () =>
          this.config.enabled &&
          this.config.allowExecute &&
          this.config.allowManageApplets &&
          !this.closed,
        () =>
          this.config.enabled &&
          this.config.allowExecute &&
          this.config.allowWrite &&
          this.config.allowEditShortcuts &&
          !this.closed,
        () =>
          this.config.enabled &&
          this.config.allowExecute &&
          this.config.allowWrite &&
          this.config.allowEditGestures &&
          !this.closed,
        () =>
          this.config.enabled &&
          this.config.allowExecute &&
          this.config.allowWrite &&
          this.config.allowEditRibbon &&
          !this.closed,
        () =>
          this.config.enabled &&
          this.config.allowExecute &&
          this.config.allowWrite &&
          this.config.allowEditTray &&
          !this.closed,
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
          : 'MCPを開始できません。ポートの競合や連携設定の保存先を確認して、接続を再試行してください。';
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
      throw Error('連携操作が不正です。');
    if (action.kind === 'status') return { state: this.state() };
    if (this.busy || this.closed) throw Error('連携の処理中です。しばらく待ってください。');
    if (this.loadError) throw Error(this.loadError);
    this.busy = true;
    const previous = structuredClone(this.config);
    try {
      let message: string | undefined;
      switch (action.kind) {
        case 'setConnectionScope': {
          if (action.scope !== 'local' && action.scope !== 'network')
            throw Error('接続範囲が不正です。');
          if (action.scope === this.config.connectionScope) break;
          this.config.connectionScope = action.scope;
          this.save();
          await this.stop();
          this.error = undefined;
          await this.start();
          message =
            this.error ||
            '接続範囲を変更しました。同じPCのCodexの再登録は不要です。通信が戻らない場合は接続を再読み込みしてください。';
          break;
        }
        case 'setNetworkHostnames': {
          const names = networkHostnames(action.hostnames);
          if (JSON.stringify(names) === JSON.stringify(this.config.networkHostnames)) break;
          this.config.networkHostnames = names;
          this.save();
          message = '追加の接続先ホスト名を保存しました。';
          break;
        }
        case 'copyToken':
          if (!this.state().canCopyToken || !this.options.writeClipboard)
            throw Error('接続トークンをコピーできません。先に連携設定を保存してください。');
          try {
            this.options.writeClipboard(this.token);
          } catch {
            throw Error('接続トークンをコピーできません。クリップボードを確認してください。');
          }
          message = '接続トークンをクリップボードへコピーしました。';
          break;
        case 'copyEndpoint': {
          const state = this.state();
          if (
            !state.running ||
            ![state.endpoint, ...state.networkEndpoints].includes(action.endpoint) ||
            !this.options.writeClipboard
          )
            throw Error('接続先をコピーできません。接続の状態を再読み込みしてください。');
          try {
            this.options.writeClipboard(action.endpoint);
          } catch {
            throw Error('接続先をコピーできません。クリップボードを確認してください。');
          }
          message = '接続先をクリップボードへコピーしました。';
          break;
        }
        case 'retryStart':
          if (!this.config.enabled) throw Error('先に連携を有効にしてください。');
          await this.start();
          message = this.error || 'MCPは稼働中です。';
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
            throw Error('連携設定が不正です。ポートは1024～65535、または0（自動選択）です。');
          if (
            action.enabled === this.config.enabled &&
            action.allowWrite === this.config.allowWrite &&
            action.port === this.config.port
          )
            break;
          this.config.enabled = action.enabled;
          this.config.allowWrite = action.allowWrite;
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
          message = this.error || 'このPCの連携設定を保存しました。';
          break;
        }
        case 'selectConfig':
          this.config.configFile = codexConfigPath(action.file);
          this.save();
          break;
        case 'selectName':
          this.config.serverName = codexServerName(action.name);
          this.save();
          message = '登録名を保存しました。既存の登録は解除してから登録し直してください。';
          break;
        case 'setTts':
          if (typeof action.allowed !== 'boolean') throw Error('読み上げの許可が不正です。');
          this.config.allowUseTts = action.allowed;
          this.save();
          message = 'このPCの読み上げ許可を保存しました。';
          break;
        case 'setMcpClient':
          if (typeof action.allowed !== 'boolean') throw Error('MCP利用許可が不正です。');
          this.config.allowUseMcp = action.allowed;
          this.save();
          this.options.authorizationChanged?.();
          message = 'このPCのMCP利用許可を保存しました。';
          break;
        case 'setMcpServerManagement':
          if (typeof action.allowed !== 'boolean') throw Error('MCP接続先の管理許可が不正です。');
          this.config.allowManageMcpServers = action.allowed;
          this.save();
          this.options.authorizationChanged?.();
          message = 'このPCのMCP接続先の管理許可を保存しました。';
          break;
        case 'setAi':
          if (typeof action.allowed !== 'boolean') throw Error('AIの許可が不正です。');
          this.config.allowUseAi = action.allowed;
          this.save();
          if (!action.allowed) this.options.authorizationChanged?.();
          message = 'このPCのAI利用許可を保存しました。';
          break;
        case 'setExecution':
          if (typeof action.allowed !== 'boolean') throw Error('コマンド実行の許可が不正です。');
          this.config.allowExecute = action.allowed;
          this.save();
          message = 'このPCのコマンド実行許可を保存しました。';
          break;
        case 'setAppletManagement':
          if (typeof action.allowed !== 'boolean') throw Error('Applet管理の許可が不正です。');
          this.config.allowManageApplets = action.allowed;
          this.save();
          message = 'このPCのApplet管理許可を保存しました。';
          break;
        case 'setTrayEditing':
          if (typeof action.allowed !== 'boolean') throw Error('許可設定が不正です。');
          this.config.allowEditTray = action.allowed;
          this.save();
          message = 'このPCのタスクトレイ編集許可を保存しました。';
          break;
        case 'setCustomCommandManagement':
          if (typeof action.allowed !== 'boolean') throw Error('許可設定が不正です。');
          this.config.allowManageCustomCommands = action.allowed;
          this.save();
          this.options.authorizationChanged?.();
          message = 'このPCのカスタムコマンド管理許可を保存しました。';
          break;
        case 'setRibbonEditing':
          if (typeof action.allowed !== 'boolean') throw Error('許可設定が不正です。');
          this.config.allowEditRibbon = action.allowed;
          this.save();
          message = 'このPCのリボン編集許可を保存しました。';
          break;
        case 'setGestureEditing':
          if (typeof action.allowed !== 'boolean') throw Error('許可設定が不正です。');
          this.config.allowEditGestures = action.allowed;
          this.save();
          message = 'このPCのジェスチャー編集許可を保存しました。';
          break;
        case 'setShortcutEditing':
          if (typeof action.allowed !== 'boolean')
            throw Error('ショートカット編集の許可が不正です。');
          this.config.allowEditShortcuts = action.allowed;
          this.save();
          message = 'このPCのショートカット編集許可を保存しました。';
          break;
        case 'register':
          if (!this.server) throw Error('先に連携を有効にしてMCPを起動してください。');
          this.config.owned[this.config.configFile] = changeRegistration(
            this.config.configFile,
            this.id,
            this.block(),
            this.config.owned[this.config.configFile],
          )!;
          this.save();
          message =
            '登録しました。Codexを再読み込みまたは再起動して、新しいチャットから接続を確認してください。';
          break;
        case 'unregister':
          if (!this.token) throw Error('解除する登録がありません。');
          changeRegistration(
            this.config.configFile,
            this.id,
            this.block(),
            this.config.owned[this.config.configFile],
            true,
          );
          delete this.config.owned[this.config.configFile];
          this.save();
          message = 'このAppDockの登録を解除しました。Codexを再読み込みしてください。';
          break;
        case 'rotateToken':
          if (!this.token) throw Error('先に連携を有効にしてください。');
          this.token = randomBytes(32).toString('hex');
          this.config.token = this.options.encrypt(this.token);
          this.save();
          this.clearConnections();
          this.events.reconcile(true);
          this.options.authorizationChanged?.();
          message =
            '認証情報を再発行しました。「登録・修復」でCodexの登録を更新し、他のMCPクライアントにも新しいトークンを設定してください。';
          break;
        case 'test': {
          if (!this.server) throw Error('MCPが起動していません。');
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
          if (!response.ok || !value.result?.serverInfo) throw Error('接続テストに失敗しました。');
          message = 'AppDock内の疎通に成功しました。Codexからの接続確認は別途必要です。';
          break;
        }
        default:
          throw Error('対応していない連携操作です。');
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
        const message =
          'AppDock内の疎通を確認できませんでした。連携が有効でMCPが稼働中かを確認して、もう一度接続テストを実行してください。';
        this.reportFailure('MCP_CONNECTION_TEST_FAILED', message);
        throw Error(message);
      }
      if (e instanceof AutomationStorageError) this.reportFailure('MCP_SAVE_FAILED', e.message);
      // Never echo credentials or raw TOML in an IPC error.
      if (e instanceof Error && !/Bearer |authorization|token =/i.test(e.message)) throw e;
      throw Error('連携操作に失敗しました。設定とアクセス権を確認してください。');
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

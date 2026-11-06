import { hostText, type HostTextKey } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { boundedJson, jsonObject } from '../../shared/custom-commands';
import {
  parseMcpConnection,
  parseMcpRoster,
  type McpConnection,
  type McpServerEntry,
} from '../../shared/mcp-client';
import {
  emptyMcpDeviceSettings,
  parseMcpDeviceSettings,
  type McpDeviceServer,
  type McpToolCommand,
} from '../../shared/mcp-device-settings';
import {
  atomicWrite,
  SettingsConflictError,
  type SettingsAsset,
  type SettingsStore,
} from './settings';
import { observeFile } from './file-observer';
import type { FileWatchAssistance } from './file-watch-assistance';

export const mcpDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : jsonObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const mcpStableDigest = (value: unknown) => mcpDigest(canonical(value));
export const mcpEndpointIdentity = (c: McpConnection) =>
  mcpDigest({
    transport: c.transport,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    authentication: c.authentication,
  });
export interface PublicMcpRow extends McpServerEntry {
  connection?: McpConnection;
}
export class McpSettingsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const failure = (code: string, key: HostTextKey): never => {
  throw new McpSettingsError(code, hostText(key));
};
const privateSetting = () =>
  failure('PRIVATE_SETTING', 'settings.mcp-client-settings.privateSetting');
export class McpClientSettings {
  private observer?: ReturnType<typeof observeFile>;
  private indexedServers?: McpDeviceServer[];
  private serversById = new Map<string, McpDeviceServer>();
  constructor(
    private settings: SettingsStore,
    readonly file: string,
    private encryption: { encrypt(v: string): string; decrypt(v: string): string },
    private changed: () => void,
    private writable?: () => void,
  ) {}
  block() {
    return this.settings.value.mcpClient ?? emptyMcpDeviceSettings();
  }
  roster(): McpServerEntry[] {
    return this.block().servers.map(({ id, name, description }) => ({ id, name, description }));
  }
  server(id: string) {
    const servers = this.block().servers;
    if (servers !== this.indexedServers) {
      this.indexedServers = servers;
      this.serversById = new Map(servers.map((row) => [row.id, row]));
    }
    return this.serversById.get(id);
  }
  connection(id: string) {
    return this.server(id)?.connection;
  }
  private bytes() {
    return fs.existsSync(this.file) ? fs.readFileSync(this.file) : undefined;
  }
  private read(): Record<string, unknown> {
    try {
      const bytes = this.bytes();
      if (!bytes) return {};
      const data = JSON.parse(bytes.toString('utf8'));
      if (
        !jsonObject(data) ||
        data.version !== 1 ||
        !jsonObject(data.entries) ||
        Object.keys(data).some((k) => !['version', 'entries'].includes(k))
      )
        throw Error();
      return data.entries;
    } catch {
      return failure('CONFIGURATION_REQUIRED', 'settings.mcp-client-settings.unreadable');
    }
  }
  revision() {
    return mcpDigest([this.settings.revision, this.bytes()?.toString('base64') ?? null]);
  }
  stateVersion() {
    try {
      const stat = fs.statSync(this.file);
      return [this.settings.revision, stat.mtimeMs, stat.ctimeMs, stat.size, stat.ino];
    } catch {
      return [this.settings.revision, 'missing'];
    }
  }
  identity(id: string) {
    const row = this.server(id);
    if (!row) return mcpDigest(null);
    const needsSecret = row.connection.authentication === 'bearer' || row.requiresEnvironment;
    return mcpDigest([
      row.connection,
      row.requiresEnvironment,
      needsSecret ? (this.read()[id] ?? null) : null,
    ]);
  }
  health(): { revision: string; error?: string } {
    try {
      this.read();
      return { revision: this.revision() };
    } catch {
      return {
        revision: this.revision(),
        error: hostText('settings.mcp-client-settings.readonly'),
      };
    }
  }
  secrets(id: string): { token?: string; env: Record<string, string> } {
    const row = this.server(id);
    if (!row || (row.connection.authentication === 'none' && !row.requiresEnvironment))
      return { env: {} };
    const cipher = this.read()[id];
    if (cipher === undefined) return { env: {} };
    try {
      if (typeof cipher !== 'string') throw Error();
      const data = JSON.parse(this.encryption.decrypt(cipher));
      boundedJson(data, Infinity, 4, Infinity);
      if (
        data.binding !== mcpEndpointIdentity(row.connection) ||
        !jsonObject(data.env) ||
        Object.entries(data.env).some(
          ([k, v]) =>
            !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) ||
            typeof v !== 'string' ||
            v.length > 8192 ||
            /[\x00]/.test(v),
        ) ||
        (data.token !== undefined &&
          (typeof data.token !== 'string' ||
            data.token.length > 8192 ||
            /[\x00-\x1f\x7f]/.test(data.token)))
      )
        throw Error();
      return {
        token: row.connection.authentication === 'bearer' ? data.token : undefined,
        env: row.requiresEnvironment ? data.env : {},
      };
    } catch {
      return failure('CONFIGURATION_REQUIRED', 'settings.mcp-client-settings.decryptFailed');
    }
  }
  credentialReason(id: string): string | null {
    const row = this.server(id);
    if (!row) return hostText('settings.mcp-client-settings.missingServer');
    try {
      const secret = this.secrets(id);
      if (row.connection.authentication === 'bearer' && !secret.token)
        return hostText('settings.mcpRecovery.tokenRequired');
      if (row.requiresEnvironment && !Object.keys(secret.env).length)
        return hostText('settings.mcpRecovery.environmentRequired');
      return null;
    } catch {
      return hostText('settings.mcpRecovery.credentialsUnreadable');
    }
  }
  statuses() {
    return this.block().servers.map((row) => {
      const error = this.credentialReason(row.id);
      let secret: { token?: string; env: Record<string, string> } = { env: {} };
      try {
        secret = this.secrets(row.id);
      } catch {
        /* Keep the definition editable. */
      }
      return {
        id: row.id,
        connection: row.connection,
        tokenConfigured: !!secret.token,
        environmentNames: Object.keys(secret.env),
        requiresEnvironment: row.requiresEnvironment,
        state: !row.connection.enabled
          ? 'disabled'
          : error
            ? 'credentials-required'
            : 'disconnected',
        ...(error ? { error } : {}),
      };
    });
  }
  getSettings(serverId?: unknown) {
    const revision = this.revision(),
      items = this.roster(),
      statuses = this.statuses();
    if (serverId === undefined)
      return {
        revision,
        items: items.map((item) => ({
          ...item,
          state: statuses.find((s) => s.id === item.id)?.state,
        })),
      };
    const item = items.find((v) => v.id === serverId);
    if (!item) return failure('NOT_FOUND', 'settings.mcp-client-settings.missingServer');
    return { revision, item, ...statuses.find((s) => s.id === serverId) };
  }
  publicConfiguration() {
    let entries: Record<string, unknown> | undefined;
    try {
      entries = this.read();
    } catch {
      /* Public metadata never decrypts secrets. */
    }
    const rows: PublicMcpRow[] = [],
      protectedIds: string[] = [],
      states: Record<string, string> = {};
    for (const row of this.block().servers) {
      const { requiresEnvironment, ...publicRow } = row;
      rows.push(structuredClone(publicRow));
      if (
        !entries ||
        Object.hasOwn(entries, row.id) ||
        requiresEnvironment ||
        row.connection.authentication === 'bearer'
      )
        protectedIds.push(row.id);
      states[row.id] = !row.connection.enabled
        ? 'disabled'
        : !entries ||
            ((requiresEnvironment || row.connection.authentication === 'bearer') &&
              !Object.hasOwn(entries, row.id))
          ? 'credentials-required'
          : 'disconnected';
    }
    return { rows, protectedIds, states, revision: this.revision() };
  }
  publicSettings(serverId?: unknown) {
    const { rows, revision, states } = this.publicConfiguration();
    if (serverId === undefined)
      return {
        revision,
        items: rows.map(({ connection: _connection, ...item }) => ({
          ...item,
          state: states[item.id],
        })),
      };
    const row = rows.find((r) => r.id === serverId);
    if (!row) return failure('NOT_FOUND', 'settings.mcp-client-settings.missingServer');
    const { connection, ...item } = row;
    return { revision, item, id: item.id, connection, state: states[item.id] };
  }
  assertRevision(expected: string) {
    try {
      this.writable?.();
    } catch {
      return failure('BUSY', 'services.index.settingsRestoring');
    }
    try {
      this.settings.assertRevision(this.settings.revision);
    } catch {
      return failure('REVISION_CONFLICT', 'settings.mcp-client-settings.conflict');
    }
    if (expected !== this.revision())
      return failure('REVISION_CONFLICT', 'settings.mcp-client-settings.editConflict');
  }
  private save(
    servers: McpDeviceServer[],
    commands: McpToolCommand[],
    expected: string,
    asset?: SettingsAsset,
  ) {
    this.assertRevision(expected);
    const mcpClient = parseMcpDeviceSettings({ version: 1, servers, commands });
    if (isDeepStrictEqual(mcpClient, this.block()) && !asset) return;
    try {
      this.settings.save({ ...this.settings.value, mcpClient }, this.settings.revision, asset);
    } catch (error) {
      return failure(
        error instanceof SettingsConflictError ? 'REVISION_CONFLICT' : 'SAVE_FAILED',
        error instanceof SettingsConflictError
          ? 'settings.mcp-client-settings.conflict'
          : 'settings.mcp-client-settings.saveFailed',
      );
    }
    this.changed();
  }
  saveCommands(commands: McpToolCommand[], expected: string) {
    this.save(this.block().servers, commands, expected);
  }
  planPublicConfiguration(rows: PublicMcpRow[], expected: string) {
    this.assertRevision(expected);
    const snapshot = this.publicConfiguration(),
      before = this.block().servers;
    if (
      !Array.isArray(rows) ||
      rows.some(
        (r) =>
          !jsonObject(r) ||
          Object.keys(r).some((k) => !['id', 'name', 'description', 'connection'].includes(k)),
      )
    )
      return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    const roster = parseMcpRoster({
      version: 1,
      items: rows.map(({ id, name, description }) => ({ id, name, description })),
    }).items;
    for (const row of before)
      if (!rows.some((r) => r.id === row.id) && snapshot.protectedIds.includes(row.id))
        return privateSetting();
    const servers = rows.map((row, i) => {
      const old = before.find((r) => r.id === row.id),
        connection = parseMcpConnection(row.connection);
      if (
        snapshot.protectedIds.includes(row.id) &&
        (!old || mcpEndpointIdentity(old.connection) !== mcpEndpointIdentity(connection))
      )
        return privateSetting();
      if (connection.authentication === 'bearer' && old?.connection.authentication !== 'bearer')
        return privateSetting();
      return { ...roster[i], connection, requiresEnvironment: old?.requiresEnvironment ?? false };
    });
    return {
      changed: !isDeepStrictEqual(servers, before),
      commit: () => this.save(servers, this.block().commands, expected),
    };
  }
  private asset(entries: Record<string, unknown>, expected: string): SettingsAsset {
    const previous = this.bytes(),
      content = Buffer.from(JSON.stringify({ version: 1, entries }) + '\n');
    let committed = false;
    return {
      recovery: {
        scope: 'mcp-secrets',
        before: previous?.toString('base64') ?? null,
        after: content.toString('base64'),
      },
      commit: () => {
        if (expected !== this.revision())
          throw new SettingsConflictError(hostText('settings.mcp-client-settings.changed'));
        if (previous)
          atomicWrite(
            path.join(path.dirname(this.file), 'settings-backups', 'mcp-secrets', 'previous.json'),
            previous,
          );
        atomicWrite(this.file, content, { previous });
        committed = true;
        this.observer?.invalidate(content.toString('utf8'));
      },
      rollback: () => {
        if (!committed) return;
        if (previous) atomicWrite(this.file, previous, { previous: content });
        else if (this.bytes()?.equals(content)) fs.unlinkSync(this.file);
        else throw new SettingsConflictError(hostText('settings.mcp-client-settings.changed'));
      },
    };
  }
  resetSecrets(expected: string) {
    this.assertRevision(expected);
    const previous = this.bytes();
    if (previous)
      atomicWrite(
        path.join(
          path.dirname(this.file),
          'settings-backups',
          'mcp-secrets',
          `recovery-${Date.now()}-${randomUUID()}.json`,
        ),
        previous,
        { previous: undefined },
      );
    this.save(this.block().servers, this.block().commands, expected, this.asset({}, expected));
    return { saved: true, revision: this.revision() };
  }
  reset(expected: string) {
    this.assertRevision(expected);
    this.read();
    this.save([], [], expected, this.asset({}, expected));
  }
  update(request: unknown, external = false) {
    if (!jsonObject(request) || typeof request.expectedRevision !== 'string')
      return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    if (external && ('token' in request || 'environment' in request)) return privateSetting();
    const fields: Record<string, string[]> = {
      save: ['item', 'connection', 'token', 'environment'],
      remove: ['id'],
      reorder: ['ids'],
      enabled: ['id', 'enabled'],
    };
    const permitted = fields[String(request.op)];
    if (
      !permitted ||
      Object.keys(request).some(
        (k) => !['op', 'expectedRevision', 'dryRun', ...permitted].includes(k),
      ) ||
      (request.dryRun !== undefined && typeof request.dryRun !== 'boolean')
    )
      return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidUpdate');
    this.assertRevision(request.expectedRevision);
    let servers = structuredClone(this.block().servers),
      entries: Record<string, unknown> | undefined;
    const originalEntries = () => (entries ??= this.read());
    let secretsChanged = false;
    if (request.op === 'save') {
      const item = parseMcpRoster({ version: 1, items: [request.item] }).items[0],
        connection = parseMcpConnection(request.connection);
      const old = servers.find((v) => v.id === item.id),
        endpointChanged =
          !old || mcpEndpointIdentity(old.connection) !== mcpEndpointIdentity(connection);
      let requiresEnvironment = old?.requiresEnvironment ?? false;
      if (
        !external &&
        ((endpointChanged && !!old) ||
          request.token !== undefined ||
          request.environment !== undefined)
      ) {
        const values = originalEntries(),
          originalCipher = values[item.id];
        let previous: { token?: string; env: Record<string, string> } = { env: {} };
        if (!endpointChanged && originalCipher !== undefined) {
          try {
            previous = this.secrets(item.id);
          } catch {
            if (request.token === undefined && request.environment === undefined)
              return failure(
                'CONFIGURATION_REQUIRED',
                'settings.mcp-client-settings.credentialRequired',
              );
          }
        }
        const token =
          connection.authentication === 'bearer'
            ? request.token === undefined
              ? previous.token
              : request.token
            : undefined;
        const env =
          connection.transport === 'stdio'
            ? request.environment === undefined
              ? previous.env
              : request.environment
            : {};
        if (
          (token !== undefined &&
            (typeof token !== 'string' || token.length > 8192 || /[\x00-\x1f\x7f]/.test(token))) ||
          !jsonObject(env) ||
          Object.entries(env).some(
            ([k, v]) =>
              !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) ||
              typeof v !== 'string' ||
              v.length > 8192 ||
              /[\x00]/.test(v),
          )
        )
          return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.invalidEnvironment');
        if (request.environment !== undefined || connection.transport !== 'stdio')
          requiresEnvironment = Object.keys(env).length > 0;
        const hasValues = !!token || Object.keys(env).length > 0;
        if (hasValues) {
          if (endpointChanged || !isDeepStrictEqual(previous, { token, env }))
            values[item.id] = this.encryption.encrypt(
              JSON.stringify({ binding: mcpEndpointIdentity(connection), token, env }),
            );
        } else delete values[item.id];
        secretsChanged = !isDeepStrictEqual(originalCipher, values[item.id]);
      }
      const row = { ...item, connection, requiresEnvironment };
      servers = old ? servers.map((v) => (v.id === row.id ? row : v)) : [...servers, row];
    } else if (request.op === 'remove') {
      if (!servers.some((r) => r.id === request.id))
        return failure('NOT_FOUND', 'settings.mcp-client-settings.missingServer');
      if (!external) {
        const values = originalEntries();
        secretsChanged = Object.hasOwn(values, String(request.id));
        delete values[String(request.id)];
      }
      servers = servers.filter((r) => r.id !== request.id);
    } else if (request.op === 'enabled') {
      const row = servers.find((r) => r.id === request.id);
      if (!row || typeof request.enabled !== 'boolean')
        return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.configureFirst');
      row.connection.enabled = request.enabled;
    } else {
      const indexed = new Map(servers.map((r) => [r.id, r]));
      if (
        !Array.isArray(request.ids) ||
        request.ids.length !== servers.length ||
        new Set(request.ids).size !== servers.length ||
        request.ids.some((id) => !indexed.has(id))
      )
        return failure('INVALID_ARGUMENT', 'settings.mcp-client-settings.order');
      servers = request.ids.map((id) => indexed.get(id)!);
    }
    if (external) {
      const plan = this.planPublicConfiguration(
        servers.map(({ requiresEnvironment: _required, ...row }) => row),
        request.expectedRevision,
      );
      if (!request.dryRun) plan.commit();
    } else {
      const block = parseMcpDeviceSettings({ ...this.block(), servers });
      if (!request.dryRun)
        this.save(
          block.servers,
          block.commands,
          request.expectedRevision,
          secretsChanged ? this.asset(entries!, request.expectedRevision) : undefined,
        );
    }
    return request.dryRun
      ? { saved: false, validated: true, revision: this.revision() }
      : { saved: true, revision: this.revision() };
  }
  watch(assistance?: FileWatchAssistance) {
    this.observer?.close();
    this.observer = observeFile(
      this.file,
      () => this.changed(),
      () => this.changed(),
      assistance,
    );
  }
  close() {
    this.observer?.close();
  }
}

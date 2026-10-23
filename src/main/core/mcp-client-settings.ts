import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { boundedJson, jsonObject } from '../../shared/custom-commands';
import {
  mcpUuid,
  parseMcpConnection,
  parseMcpRoster,
  type McpConnection,
} from '../../shared/mcp-client';
import { atomicWrite, SettingsConflictError, type SettingsStore } from './settings';

export const mcpDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const mcpEndpointIdentity = (c: McpConnection) =>
  mcpDigest({
    transport: c.transport,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    authentication: c.authentication,
  });
interface LocalEntry {
  connection: McpConnection;
  secret?: string;
}
export class McpSettingsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export class McpClientSettings {
  constructor(
    private settings: SettingsStore,
    private file: string,
    private encryption: { encrypt(v: string): string; decrypt(v: string): string },
    private changed: () => void,
  ) {}
  private read(): Record<string, unknown> {
    if (!fs.existsSync(this.file)) return {};
    try {
      if (fs.statSync(this.file).size > 1024 * 1024) throw Error();
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !jsonObject(data.entries) || Object.keys(data.entries).length > 64)
        throw Error();
      return data.entries;
    } catch {
      throw new McpSettingsError(
        'CONFIGURATION_REQUIRED',
        hostText('settings.mcp-client-settings.unreadable'),
      );
    }
  }
  private entry(id: string, entries = this.read()): LocalEntry | undefined {
    if (!Object.hasOwn(entries, id)) return undefined;
    const value = entries[id];
    if (
      !mcpUuid(id) ||
      !jsonObject(value) ||
      Object.keys(value).some((key) => !['connection', 'secret'].includes(key)) ||
      (value.secret !== undefined &&
        (typeof value.secret !== 'string' || value.secret.length > 131072))
    )
      throw new McpSettingsError(
        'CONFIGURATION_REQUIRED',
        hostText('settings.mcp-client-settings.invalidDeviceSettings'),
      );
    parseMcpConnection(value.connection);
    return value as unknown as LocalEntry;
  }
  roster() {
    return parseMcpRoster(this.settings.value.mcpServers).items;
  }
  revision() {
    return mcpDigest([this.settings.revision, this.read()]);
  }
  health(): { revision: string; error?: string } {
    try {
      return { revision: this.revision() };
    } catch {
      return {
        revision: '',
        error: hostText('settings.mcp-client-settings.readonly'),
      };
    }
  }
  connection(id: string) {
    return this.entry(id)?.connection;
  }
  identity(id: string) {
    return mcpDigest(this.entry(id) ?? null);
  }
  secrets(id: string): { token?: string; env: Record<string, string> } {
    const entry = this.entry(id);
    if (!entry?.secret) return { env: {} };
    try {
      const data = JSON.parse(this.encryption.decrypt(entry.secret));
      boundedJson(data, 65536, 4, 256);
      if (
        data.binding !== mcpEndpointIdentity(entry.connection) ||
        !jsonObject(data.env) ||
        Object.keys(data.env).length > 32 ||
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
      return { token: data.token, env: data.env };
    } catch {
      throw new McpSettingsError(
        'CONFIGURATION_REQUIRED',
        hostText('settings.mcp-client-settings.decryptFailed'),
      );
    }
  }
  statuses() {
    return this.roster().map(({ id }) => {
      let connection: McpConnection | undefined;
      try {
        connection = this.connection(id);
        const secrets = this.secrets(id);
        return {
          id,
          connection,
          tokenConfigured: !!secrets.token,
          environmentNames: Object.keys(secrets.env),
          state: connection ? (connection.enabled ? 'disconnected' : 'disabled') : 'unconfigured',
        };
      } catch {
        let disabled = false;
        try {
          const raw = this.read()[id];
          disabled =
            jsonObject(raw) && jsonObject(raw.connection) && raw.connection.enabled === false;
        } catch {
          // An unreadable document is reported by health(), without breaking the page snapshot.
        }
        return {
          id,
          connection,
          tokenConfigured: false,
          environmentNames: [],
          state: disabled ? 'disabled' : 'error',
          error: hostText('settings.mcp-client-settings.unhealthy'),
        };
      }
    });
  }
  getSettings(serverId?: unknown) {
    const revision = this.revision();
    const items = this.roster();
    if (serverId === undefined) {
      const statuses = this.statuses();
      return {
        revision,
        items: items.map((item) => ({
          ...item,
          state: statuses.find((s) => s.id === item.id)?.state,
        })),
      };
    }
    const item = items.find((item) => item.id === serverId);
    if (!item)
      throw new McpSettingsError(
        'NOT_FOUND',
        hostText('settings.mcp-client-settings.missingServer'),
      );
    return { revision, item, ...this.statuses().find((s) => s.id === serverId) };
  }
  private asset(entries: Record<string, unknown>, expectedRevision: string) {
    const content = JSON.stringify({ version: 1, entries }) + '\n';
    if (Object.keys(entries).length > 64 || Buffer.byteLength(content, 'utf8') > 1024 * 1024)
      throw Error(hostText('settings.mcp-client-settings.size'));
    const previous = fs.existsSync(this.file) ? fs.readFileSync(this.file) : undefined;
    let committed = false;
    return {
      commit: () => {
        if (this.revision() !== expectedRevision)
          throw new SettingsConflictError(hostText('settings.mcp-client-settings.changed'));
        atomicWrite(this.file, content, { previous });
        committed = true;
      },
      rollback: () => {
        if (!committed) return;
        const written = Buffer.from(content, 'utf8');
        if (previous) atomicWrite(this.file, previous, { previous: written });
        else {
          if (!fs.readFileSync(this.file).equals(written))
            throw new SettingsConflictError(hostText('settings.mcp-client-settings.changed'));
          fs.rmSync(this.file);
        }
      },
    };
  }
  update(request: unknown) {
    if (!jsonObject(request) || typeof request.expectedRevision !== 'string')
      throw Error(hostText('settings.mcp-client-settings.invalidUpdate'));
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
      throw Error(hostText('settings.mcp-client-settings.invalidUpdate'));
    boundedJson(request, 262144, 8, 4096);
    try {
      this.settings.assertRevision(this.settings.revision);
    } catch {
      throw new McpSettingsError(
        'REVISION_CONFLICT',
        hostText('settings.mcp-client-settings.conflict'),
      );
    }
    if (request.expectedRevision !== this.revision())
      throw new McpSettingsError(
        'REVISION_CONFLICT',
        hostText('settings.mcp-client-settings.editConflict'),
      );
    const entries = this.read();
    let items = this.roster();
    if (request.op === 'save') {
      const item = parseMcpRoster({ version: 1, items: [request.item] }).items[0];
      const connection = parseMcpConnection(request.connection);
      let previous: { token?: string; env: Record<string, string> } = { env: {} };
      let old: LocalEntry | undefined;
      try {
        old = this.entry(item.id, entries);
      } catch {
        // Explicitly saving this row repairs it; untouched entries remain verbatim JSON values.
      }
      if (old && mcpEndpointIdentity(old.connection) === mcpEndpointIdentity(connection)) {
        try {
          previous = this.secrets(item.id);
        } catch {
          if (request.token === undefined && request.environment === undefined)
            throw Error(hostText('settings.mcp-client-settings.credentialRequired'));
        }
      }
      const token = request.token === undefined ? previous.token : request.token;
      if (
        token !== undefined &&
        (typeof token !== 'string' || token.length > 8192 || /[\x00-\x1f\x7f]/.test(token))
      )
        throw Error(hostText('settings.mcp-client-settings.invalidBearer'));
      const env = request.environment === undefined ? previous.env : request.environment;
      if (
        !jsonObject(env) ||
        Object.keys(env).length > 32 ||
        Object.entries(env).some(
          ([k, v]) =>
            !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) ||
            typeof v !== 'string' ||
            v.length > 8192 ||
            /[\x00]/.test(v),
        )
      )
        throw Error(hostText('settings.mcp-client-settings.invalidEnvironment'));
      boundedJson(env, 32768, 2, 100);
      if (connection.authentication === 'bearer' && !token)
        throw Error(hostText('settings.mcp-client-settings.bearerRequired'));
      const secretData = {
        binding: mcpEndpointIdentity(connection),
        token: connection.authentication === 'bearer' ? token : undefined,
        env: connection.transport === 'stdio' ? env : {},
      };
      entries[item.id] = {
        connection,
        ...(secretData.token || Object.keys(secretData.env).length
          ? {
              secret:
                old?.secret &&
                mcpEndpointIdentity(old.connection) === secretData.binding &&
                isDeepStrictEqual(
                  { token: previous.token, env: previous.env },
                  { token: secretData.token, env: secretData.env },
                )
                  ? old.secret
                  : this.encryption.encrypt(JSON.stringify(secretData)),
            }
          : {}),
      };
      items = items.some((v) => v.id === item.id)
        ? items.map((v) => (v.id === item.id ? item : v))
        : [...items, item];
    } else if (request.op === 'remove') {
      if (!mcpUuid(request.id) || !items.some((v) => v.id === request.id))
        throw Error(hostText('settings.mcp-client-settings.missingConnection'));
      items = items.filter((v) => v.id !== request.id);
      delete entries[request.id];
    } else if (request.op === 'reorder') {
      if (
        !Array.isArray(request.ids) ||
        request.ids.length !== items.length ||
        new Set(request.ids).size !== items.length ||
        request.ids.some((id) => !items.some((v) => v.id === id))
      )
        throw Error(hostText('settings.mcp-client-settings.order'));
      items = request.ids.map((id) => items.find((v) => v.id === id)!);
    } else if (request.op === 'enabled') {
      if (
        !mcpUuid(request.id) ||
        !items.some((v) => v.id === request.id) ||
        !entries[request.id] ||
        typeof request.enabled !== 'boolean'
      )
        throw Error(hostText('settings.mcp-client-settings.configureFirst'));
      const entry = this.entry(request.id, entries);
      if (!entry) throw Error(hostText('settings.mcp-client-settings.configureFirst'));
      entry.connection.enabled = request.enabled;
    } else throw Error(hostText('settings.mcp-client-settings.unsupported'));
    const mcpServers = parseMcpRoster({ version: 1, items });
    const next = { ...this.settings.value, mcpServers };
    if (Buffer.byteLength(JSON.stringify(next, null, 2) + '\n', 'utf8') > 4 * 1024 * 1024)
      throw Error(hostText('settings.mcp-client-settings.fileSize'));
    if (request.expectedRevision !== this.revision())
      throw new McpSettingsError(
        'REVISION_CONFLICT',
        hostText('settings.mcp-client-settings.conflict'),
      );
    const asset = this.asset(entries, request.expectedRevision);
    if (request.dryRun === true)
      return { saved: false, validated: true, revision: this.revision() };
    try {
      this.settings.save(next, this.settings.revision, asset);
    } catch (error) {
      if (error instanceof SettingsConflictError)
        throw new McpSettingsError(
          'REVISION_CONFLICT',
          hostText('settings.mcp-client-settings.conflict'),
        );
      throw new McpSettingsError(
        'SAVE_FAILED',
        hostText('settings.mcp-client-settings.saveFailed'),
      );
    }
    this.changed();
    return { saved: true, revision: this.revision() };
  }
}

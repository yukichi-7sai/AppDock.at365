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
  type McpServerEntry,
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
const hasSecret = (entry: unknown) => jsonObject(entry) && Object.hasOwn(entry, 'secret');
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
export class McpClientSettings {
  constructor(
    private settings: SettingsStore,
    private file: string,
    private encryption: { encrypt(v: string): string; decrypt(v: string): string },
    private changed: () => void,
    private writable?: () => void,
  ) {}
  private read(): Record<string, unknown> {
    if (!fs.existsSync(this.file)) return {};
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !jsonObject(data.entries)) throw Error();
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
      (value.secret !== undefined && typeof value.secret !== 'string')
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
  /** Presentation invalidation only; permissions, secrets and execution still use current reads. */
  stateVersion() {
    try {
      const stat = fs.statSync(this.file, { bigint: true, throwIfNoEntry: false });
      return [this.settings.revision, stat?.ino, stat?.size, stat?.mtimeNs, stat?.ctimeNs].join(
        ':',
      );
    } catch {
      return 'unreadable';
    }
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
      boundedJson(data, Infinity, 4, Infinity);
      if (
        data.binding !== mcpEndpointIdentity(entry.connection) ||
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
  publicConfiguration() {
    const entries = this.read();
    const rows: PublicMcpRow[] = [];
    const protectedIds: string[] = [];
    const states: Record<string, string> = {};
    for (const item of this.roster()) {
      let connection: McpConnection | undefined;
      try {
        connection = this.entry(item.id, entries)?.connection;
        states[item.id] = connection
          ? connection.enabled
            ? 'disconnected'
            : 'disabled'
          : 'unconfigured';
      } catch {
        // Invalid rows stay editable as roster metadata without repairing their local data.
        const raw = entries[item.id];
        states[item.id] =
          jsonObject(raw) && jsonObject(raw.connection) && raw.connection.enabled === false
            ? 'disabled'
            : 'error';
      }
      rows.push({ ...item, ...(connection ? { connection: structuredClone(connection) } : {}) });
      if (hasSecret(entries[item.id])) protectedIds.push(item.id);
    }
    return { rows, protectedIds, states, revision: mcpDigest([this.settings.revision, entries]) };
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
    const row = rows.find((row) => row.id === serverId);
    if (!row)
      throw new McpSettingsError(
        'NOT_FOUND',
        hostText('settings.mcp-client-settings.missingServer'),
      );
    const { connection, ...item } = row;
    return { revision, item, id: item.id, connection, state: states[item.id] };
  }
  private assertPublicRevision(expectedRevision: string) {
    try {
      this.writable?.();
    } catch {
      throw new McpSettingsError('BUSY', hostText('services.index.settingsRestoring'));
    }
    try {
      this.settings.assertRevision(this.settings.revision);
    } catch {
      throw new McpSettingsError(
        'REVISION_CONFLICT',
        hostText('settings.mcp-client-settings.conflict'),
      );
    }
    if (expectedRevision !== this.revision())
      throw new McpSettingsError(
        'REVISION_CONFLICT',
        hostText('settings.mcp-client-settings.editConflict'),
      );
  }
  /** Plan a complete public snapshot while retaining every untouched local entry and cipher. */
  planPublicConfiguration(rows: PublicMcpRow[], expectedRevision: string) {
    this.assertPublicRevision(expectedRevision);
    const entries = this.read(),
      previousEntries = structuredClone(entries),
      before = this.roster();
    let items: McpServerEntry[];
    try {
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) =>
            !jsonObject(row) ||
            Object.keys(row).some(
              (key) => !['id', 'name', 'description', 'connection'].includes(key),
            ),
        )
      )
        throw Error();
      items = parseMcpRoster({
        version: 1,
        items: rows.map(({ id, name, description }) => ({ id, name, description })),
      }).items;
      const itemIds = new Set(items.map((item) => item.id));
      const beforeIds = new Set(before.map((item) => item.id));
      for (const item of before) {
        if (itemIds.has(item.id)) continue;
        if (hasSecret(entries[item.id]))
          throw new McpSettingsError(
            'PRIVATE_SETTING',
            hostText('settings.mcp-client-settings.privateSetting'),
          );
        delete entries[item.id];
      }
      for (const row of rows) {
        let old: LocalEntry | undefined;
        try {
          old = this.entry(row.id, entries);
        } catch {
          /* Explicit connection edits may repair a non-secret row. */
        }
        if (row.connection === undefined) {
          if (!beforeIds.has(row.id) || old) throw Error();
          continue;
        }
        if (old && isDeepStrictEqual(old.connection, row.connection)) continue;
        const connection = parseMcpConnection(row.connection);
        // Validation must not rewrite an untouched endpoint spelling or its credential binding.
        if (old && old.connection.url === row.connection.url) connection.url = old.connection.url;
        if (
          hasSecret(entries[row.id]) &&
          (!old || mcpEndpointIdentity(old.connection) !== mcpEndpointIdentity(connection))
        )
          throw new McpSettingsError(
            'PRIVATE_SETTING',
            hostText('settings.mcp-client-settings.privateSetting'),
          );
        if (connection.authentication === 'bearer' && !hasSecret(entries[row.id]))
          throw new McpSettingsError(
            'PRIVATE_SETTING',
            hostText('settings.mcp-client-settings.privateSetting'),
          );
        entries[row.id] = {
          connection,
          ...(old && Object.hasOwn(old, 'secret') ? { secret: old.secret } : {}),
        };
      }
    } catch (error) {
      if (error instanceof McpSettingsError) throw error;
      throw new McpSettingsError(
        'INVALID_ARGUMENT',
        hostText('settings.mcp-client-settings.invalidUpdate'),
      );
    }
    const next = { ...this.settings.value, mcpServers: { version: 1 as const, items } };
    const localChanged = !isDeepStrictEqual(entries, previousEntries);
    const changed = localChanged || !isDeepStrictEqual(before, items);
    // Prepare the asset without writing or decrypting anything.
    const asset = localChanged
      ? this.asset(entries, expectedRevision)
      : {
          commit: () => {
            if (this.revision() !== expectedRevision)
              throw new SettingsConflictError(hostText('settings.mcp-client-settings.changed'));
          },
          rollback: () => {},
        };
    this.assertPublicRevision(expectedRevision);
    return {
      changed,
      commit: () => {
        this.assertPublicRevision(expectedRevision);
        if (!changed) return;
        try {
          this.settings.save(next, this.settings.revision, asset);
        } catch (error) {
          throw new McpSettingsError(
            error instanceof SettingsConflictError ? 'REVISION_CONFLICT' : 'SAVE_FAILED',
            hostText(
              error instanceof SettingsConflictError
                ? 'settings.mcp-client-settings.conflict'
                : 'settings.mcp-client-settings.saveFailed',
            ),
          );
        }
        this.changed();
      },
    };
  }
  private updatePublic(request: Record<string, unknown>) {
    const snapshot = this.publicConfiguration();
    let rows = snapshot.rows;
    if (request.op === 'save') {
      const item = parseMcpRoster({ version: 1, items: [request.item] }).items[0];
      const row = { ...item, connection: parseMcpConnection(request.connection) };
      rows = rows.some((value) => value.id === item.id)
        ? rows.map((value) => (value.id === item.id ? row : value))
        : [...rows, row];
    } else if (request.op === 'remove') {
      if (!rows.some((row) => row.id === request.id))
        throw new McpSettingsError(
          'NOT_FOUND',
          hostText('settings.mcp-client-settings.missingServer'),
        );
      rows = rows.filter((row) => row.id !== request.id);
    } else if (request.op === 'enabled') {
      const row = rows.find((row) => row.id === request.id);
      if (!row?.connection || typeof request.enabled !== 'boolean')
        throw new McpSettingsError(
          'INVALID_ARGUMENT',
          hostText('settings.mcp-client-settings.configureFirst'),
        );
      row.connection.enabled = request.enabled;
    } else {
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      if (
        !Array.isArray(request.ids) ||
        request.ids.length !== rows.length ||
        new Set(request.ids).size !== rows.length ||
        request.ids.some((id) => !rowsById.has(id))
      )
        throw new McpSettingsError(
          'INVALID_ARGUMENT',
          hostText('settings.mcp-client-settings.order'),
        );
      rows = request.ids.map((id) => rowsById.get(id)!);
    }
    const plan = this.planPublicConfiguration(rows, request.expectedRevision as string);
    if (request.dryRun === true)
      return { saved: false, validated: true, revision: this.revision() };
    plan.commit();
    return { saved: true, revision: this.revision() };
  }
  private asset(entries: Record<string, unknown>, expectedRevision: string) {
    const content = JSON.stringify({ version: 1, entries }) + '\n';
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
  update(request: unknown, external = false) {
    if (!jsonObject(request) || typeof request.expectedRevision !== 'string')
      throw Error(hostText('settings.mcp-client-settings.invalidUpdate'));
    if (external && (Object.hasOwn(request, 'token') || Object.hasOwn(request, 'environment')))
      throw new McpSettingsError(
        'PRIVATE_SETTING',
        hostText('settings.mcp-client-settings.privateSetting'),
      );
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
    boundedJson(request, Infinity, 8, Infinity);
    if (external) return this.updatePublic(request);
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
      if (
        external &&
        hasSecret(entries[item.id]) &&
        (!old || mcpEndpointIdentity(old.connection) !== mcpEndpointIdentity(connection))
      )
        throw new McpSettingsError(
          'PRIVATE_SETTING',
          hostText('settings.mcp-client-settings.privateSetting'),
        );
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
        Object.entries(env).some(
          ([k, v]) =>
            !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) ||
            typeof v !== 'string' ||
            v.length > 8192 ||
            /[\x00]/.test(v),
        )
      )
        throw Error(hostText('settings.mcp-client-settings.invalidEnvironment'));
      boundedJson(env, Infinity, 2, Infinity);
      if (connection.authentication === 'bearer' && !token)
        throw Error(hostText('settings.mcp-client-settings.bearerRequired'));
      const secretData = {
        binding: mcpEndpointIdentity(connection),
        token: connection.authentication === 'bearer' ? token : undefined,
        env: connection.transport === 'stdio' ? env : {},
      };
      entries[item.id] =
        external && old && Object.hasOwn(old, 'secret')
          ? { connection, secret: old.secret }
          : {
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
      if (external && hasSecret(entries[request.id]))
        throw new McpSettingsError(
          'PRIVATE_SETTING',
          hostText('settings.mcp-client-settings.privateSetting'),
        );
      items = items.filter((v) => v.id !== request.id);
      delete entries[request.id];
    } else if (request.op === 'reorder') {
      const itemsById = new Map(items.map((item) => [item.id, item]));
      if (
        !Array.isArray(request.ids) ||
        request.ids.length !== items.length ||
        new Set(request.ids).size !== items.length ||
        request.ids.some((id) => !itemsById.has(id))
      )
        throw Error(hostText('settings.mcp-client-settings.order'));
      items = request.ids.map((id) => itemsById.get(id)!);
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

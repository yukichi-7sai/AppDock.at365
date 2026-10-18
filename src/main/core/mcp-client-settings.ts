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
import { atomicWrite, type SettingsStore } from './settings';

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
export class McpClientSettings {
  constructor(
    private settings: SettingsStore,
    private file: string,
    private encryption: { encrypt(v: string): string; decrypt(v: string): string },
    private changed: () => void,
  ) {}
  private read(): Record<string, LocalEntry> {
    if (!fs.existsSync(this.file)) return {};
    try {
      if (fs.statSync(this.file).size > 1024 * 1024) throw Error();
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !jsonObject(data.entries) || Object.keys(data.entries).length > 64)
        throw Error();
      for (const [id, v] of Object.entries(data.entries)) {
        if (
          !mcpUuid(id) ||
          !jsonObject(v) ||
          Object.keys(v).some((k) => !['connection', 'secret'].includes(k)) ||
          (v.secret !== undefined && (typeof v.secret !== 'string' || v.secret.length > 131072))
        )
          throw Error();
        parseMcpConnection(v.connection);
      }
      return data.entries;
    } catch {
      throw Error('MCPのPC専用設定を読み取れません。設定ファイルを確認してください。');
    }
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
        error:
          'MCPのPC専用設定を読み取れません。mcp-client.jsonを確認してください。内容を保持して読み取り専用にしています。',
      };
    }
  }
  connection(id: string) {
    return this.read()[id]?.connection;
  }
  identity(id: string) {
    return mcpDigest(this.read()[id] ?? null);
  }
  secrets(id: string): { token?: string; env: Record<string, string> } {
    const entry = this.read()[id];
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
      throw Error('MCPの認証情報を復号できません。接続設定で再入力してください。');
    }
  }
  statuses() {
    return this.roster().map(({ id }) => {
      try {
        const connection = this.connection(id),
          secrets = this.secrets(id);
        return {
          id,
          connection,
          tokenConfigured: !!secrets.token,
          environmentNames: Object.keys(secrets.env),
          state: connection ? (connection.enabled ? 'disconnected' : 'disabled') : 'unconfigured',
        };
      } catch {
        return {
          id,
          tokenConfigured: false,
          environmentNames: [],
          state: 'error',
          error: 'PC専用設定または認証情報を確認してください。',
        };
      }
    });
  }
  private asset(entries: Record<string, LocalEntry>) {
    const content = JSON.stringify({ version: 1, entries }) + '\n';
    if (Object.keys(entries).length > 64 || Buffer.byteLength(content, 'utf8') > 1024 * 1024)
      throw Error(
        'MCPのPC専用設定が保存上限を超えます。不要な接続設定や環境変数を整理してください。',
      );
    const previous = fs.existsSync(this.file) ? fs.readFileSync(this.file) : undefined;
    return {
      commit: () => atomicWrite(this.file, content),
      rollback: () => {
        if (previous) atomicWrite(this.file, previous);
        else fs.rmSync(this.file, { force: true });
      },
    };
  }
  update(request: unknown) {
    if (!jsonObject(request) || typeof request.expectedRevision !== 'string')
      throw Error('MCP接続設定の更新要求が不正です。');
    this.settings.assertRevision(this.settings.revision);
    if (request.expectedRevision !== this.revision())
      throw Error('設定が別の場所で変更されました。キャンセルして開き直してください。');
    const entries = this.read();
    let items = this.roster();
    if (request.op === 'save') {
      const item = parseMcpRoster({ version: 1, items: [request.item] }).items[0];
      const connection = parseMcpConnection(request.connection);
      let previous: { token?: string; env: Record<string, string> } = { env: {} };
      const old = entries[item.id];
      if (old && mcpEndpointIdentity(old.connection) === mcpEndpointIdentity(connection)) {
        try {
          previous = this.secrets(item.id);
        } catch {
          if (request.token === undefined && request.environment === undefined)
            throw Error('認証情報を再入力してください。');
        }
      }
      const token = request.token === undefined ? previous.token : request.token;
      if (
        token !== undefined &&
        (typeof token !== 'string' || token.length > 8192 || /[\x00-\x1f\x7f]/.test(token))
      )
        throw Error('Bearerは改行を含まない8192文字以下で入力してください。');
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
        throw Error('環境変数は32件以内の名前と文字列のJSONです。');
      boundedJson(env, 32768, 2, 100);
      if (connection.authentication === 'bearer' && !token)
        throw Error('Bearerを入力してください。接続先変更後は再入力が必要です。');
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
        throw Error('接続先が見つかりません。');
      items = items.filter((v) => v.id !== request.id);
      delete entries[request.id];
    } else if (request.op === 'reorder') {
      if (
        !Array.isArray(request.ids) ||
        request.ids.length !== items.length ||
        new Set(request.ids).size !== items.length ||
        request.ids.some((id) => !items.some((v) => v.id === id))
      )
        throw Error('並び順が一致しません。');
      items = request.ids.map((id) => items.find((v) => v.id === id)!);
    } else if (request.op === 'enabled') {
      if (
        !mcpUuid(request.id) ||
        !items.some((v) => v.id === request.id) ||
        !entries[request.id] ||
        typeof request.enabled !== 'boolean'
      )
        throw Error('接続先のPC設定を先に保存してください。');
      entries[request.id].connection.enabled = request.enabled;
    } else throw Error('対応していない更新です。');
    const mcpServers = parseMcpRoster({ version: 1, items });
    this.settings.save(
      { ...this.settings.value, mcpServers },
      this.settings.revision,
      this.asset(entries),
    );
    this.changed();
    return { saved: true, revision: this.revision() };
  }
}

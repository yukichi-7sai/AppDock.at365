import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ToolListChangedNotificationSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  boundedJson,
  checkCustomSchema,
  jsonObject,
  type JsonObject,
} from '../../shared/custom-commands';
import {
  mcpText,
  mcpUuid,
  type McpConnection,
  type McpJob,
  type McpResult,
  type McpToolDescriptor,
} from '../../shared/mcp-client';
import { AutomationError } from './appdock-api';
import { compileCustomType } from './custom-commands';
import { McpClientSettings, mcpDigest } from './mcp-client-settings';

export interface McpActor {
  owner: string;
  kind: 'host' | 'applet' | 'mcp';
  external: boolean;
  appletId?: string;
  origin?: { kind: 'mcp' } | { kind: 'applet'; appletId: string };
}
type Session = {
  id: string;
  identity: string;
  client: Client;
  transport: Transport;
  controller: AbortController;
  ready: Promise<void>;
  tools?: McpToolDescriptor[];
  fetchedAt: number;
  toolsEpoch: number;
  loading?: Promise<McpToolDescriptor[]>;
  closed: boolean;
  error?: string;
};
type JobRecord = {
  actor: McpActor;
  job: McpJob;
  controller: AbortController;
  identity: string;
  requestId: string;
  signature: string;
  sent: boolean;
  timer: ReturnType<typeof setTimeout>;
  dispose: () => void;
};
const fail = (code: string, message: string): never => {
  throw new AutomationError(code, message);
};
function remoteValidationSchema(value: unknown): any {
  if (!jsonObject(value)) return value;
  if (
    Object.hasOwn(value, 'x-fastmcp-wrap-result') &&
    typeof value['x-fastmcp-wrap-result'] !== 'boolean'
  )
    throw Error('Invalid FastMCP annotation');
  // FastMCP's wrapping annotation is metadata. Validate its declared result
  // property as usual; never strip properties/default/const values by name.
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'x-fastmcp-wrap-result')
      .map(([key, v]) => [
        key,
        ['properties', '$defs'].includes(key) && jsonObject(v)
          ? Object.fromEntries(
              Object.entries(v).map(([k, child]) => [k, remoteValidationSchema(child)]),
            )
          : ['allOf', 'anyOf', 'oneOf'].includes(key) && Array.isArray(v)
            ? v.map(remoteValidationSchema)
            : ['items', 'additionalProperties', 'not', 'if', 'then', 'else'].includes(key)
              ? remoteValidationSchema(v)
              : v,
      ]),
  );
}
function safeSchema(schema: unknown) {
  boundedJson(schema, 32768, 32, 8192);
  const normalized = remoteValidationSchema(schema);
  checkCustomSchema(normalized);
  return compileCustomType({
    id: 'appdock.mcp-schema',
    title: 'MCP',
    configVersion: 1,
    configSchema: normalized as JsonObject,
    automation: false,
  });
}
const validator = {
  getValidator<T>(schema: any) {
    try {
      return safeSchema(schema) as any;
    } catch {
      return () => ({ valid: false as const, data: undefined, errorMessage: 'Unsupported schema' });
    }
  },
};
function safeError(error: unknown, sent = false): { code: string; message: string } {
  if (error instanceof AutomationError) return { code: error.code, message: error.message };
  const status = (error as any)?.code;
  if (status === 401 || status === 403 || (error as any)?.constructor?.name === 'UnauthorizedError')
    return {
      code: 'AUTH_REQUIRED',
      message: '接続先の認証情報を確認してください。OAuthには対応していません。',
    };
  return sent
    ? {
        code: 'OUTCOME_UNKNOWN',
        message: '接続先の応答を確認できません。操作先の状態を確認してから再実行してください。',
      }
    : {
        code: 'CONNECTION_FAILED',
        message: 'MCP接続を確認してください。接続先・対応方式・起動状態を設定画面で確認できます。',
      };
}
export class McpClientService {
  private sessions = new Map<string, Session>();
  private connectionErrors = new Map<string, string>();
  private jobs = new Map<string, JobRecord>();
  private starts = new Map<string, { signature: string; promise: Promise<McpJob> }>();
  private reaper: ReturnType<typeof setInterval>;
  constructor(
    private options: {
      settings: McpClientSettings;
      authorized(actor: McpActor, execute: boolean): boolean;
      changed?(): void;
      failed?(id: string, error: { code: string; message: string }): void;
      audit?(job: McpJob): void;
      fetcher?: typeof fetch;
      ttlMs?: number;
    },
  ) {
    this.reaper = setInterval(() => this.expire(), Math.min(options.ttlMs ?? 600000, 30000));
    this.reaper.unref();
  }
  private allow(actor: McpActor, execute = false) {
    if (!this.options.authorized(actor, execute))
      fail('API_DISABLED', 'MCPの利用が許可されていません。');
  }
  private configuration(actor: McpActor, id: unknown, tool?: string) {
    this.allow(actor);
    if (!mcpUuid(id) || !this.options.settings.roster().some((v) => v.id === id))
      return fail('NOT_FOUND', 'MCP接続先が見つかりません。');
    let c: McpConnection | undefined;
    try {
      c = this.options.settings.connection(id);
    } catch {
      return fail('CONFIGURATION_REQUIRED', 'MCPのPC専用設定を確認してください。');
    }
    if (actor.external && (!c?.published || (tool && !c.publishedTools.includes(tool))))
      return fail('NOT_FOUND', '公開されたMCP接続先またはツールが見つかりません。');
    if (!c?.enabled)
      return fail('CONNECTION_DISABLED', 'このPCでMCP接続先を設定して有効にしてください。');
    return c;
  }
  private page<T>(items: T[], params: Record<string, unknown>, identity: string) {
    const limit = params.limit === undefined ? 20 : params.limit;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50)
      return fail('INVALID_ARGUMENT', 'limitは1〜50です。');
    const revision = mcpDigest([identity, items]);
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        const value = JSON.parse(Buffer.from(String(params.cursor), 'base64url').toString());
        if (
          value.r !== revision ||
          !Number.isInteger(value.o) ||
          value.o < 0 ||
          value.o > items.length
        )
          throw Error();
        offset = value.o;
      } catch {
        return fail('STALE_CURSOR', '一覧が変更されました。先頭から取得してください。');
      }
    }
    const next = offset + Number(limit);
    return {
      items: structuredClone(items.slice(offset, next)),
      ...(next < items.length
        ? {
            nextCursor: Buffer.from(JSON.stringify({ r: revision, o: next })).toString('base64url'),
          }
        : {}),
    };
  }
  servers(actor: McpActor, params: Record<string, unknown> = {}) {
    this.allow(actor);
    const statuses = this.statuses();
    const items = this.options.settings
      .roster()
      .filter((v) => !actor.external || statuses.find((s) => s.id === v.id)?.connection?.published)
      .map((v) => ({ ...v, state: statuses.find((s) => s.id === v.id)?.state ?? 'unconfigured' }));
    return this.page(items, params, actor.owner + ':' + actor.external);
  }
  statuses() {
    return this.options.settings.statuses().map((s) => {
      const record = this.sessions.get(s.id);
      return {
        ...s,
        ...(s.connection?.enabled && this.connectionErrors.has(s.id)
          ? { state: 'error', error: this.connectionErrors.get(s.id) }
          : {}),
        ...(record
          ? {
              state: record.error ? 'error' : record.tools ? 'connected' : 'connecting',
              ...(record.error ? { error: record.error } : {}),
            }
          : {}),
      };
    });
  }
  private async close(record: Session) {
    if (record.closed) return;
    record.closed = true;
    record.controller.abort();
    if (this.sessions.get(record.id) === record) this.sessions.delete(record.id);
    try {
      await record.client.close();
    } catch {}
    try {
      await record.transport.close();
    } catch {}
    this.options.changed?.();
  }
  private fetcher(url: string, token?: string): typeof fetch {
    const fetcher = this.options.fetcher ?? fetch;
    return (async (input: any, init: any = {}) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (new URL(target).href !== url)
        return fail('UNSUPPORTED_REDIRECT', 'MCP接続先のリダイレクトには対応していません。');
      const headers = new Headers(init.headers);
      if (token) headers.set('Authorization', 'Bearer ' + token);
      else headers.delete('Authorization');
      const response = await fetcher(input, {
        ...init,
        headers,
        redirect: 'error',
        credentials: 'omit',
      });
      if (response.status === 401 || response.status === 403)
        return fail(
          'AUTH_REQUIRED',
          '接続先の認証情報を確認してください。OAuthには対応していません。',
        );
      if (Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
        await response.body?.cancel();
        return fail('RESULT_TOO_LARGE', 'MCP応答が上限を超えました。');
      }
      if (!response.body) return response;
      let bytes = 0;
      const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > 2 * 1024 * 1024) controller.error(new Error('MCP response limit'));
            else controller.enqueue(chunk);
          },
        }),
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }) as typeof fetch;
  }
  private async session(actor: McpActor, id: string) {
    const c = this.configuration(actor, id),
      identity = this.options.settings.identity(id);
    let record = this.sessions.get(id);
    if (record && (record.identity !== identity || record.closed || record.error)) {
      await this.close(record);
      record = undefined;
    }
    if (!record) {
      if (this.sessions.size >= 32) return fail('BUSY', '接続数の上限に達しました。');
      const secret = this.options.settings.secrets(id);
      if (c.authentication === 'bearer' && !secret.token)
        return fail('AUTH_REQUIRED', 'Bearerを再入力してください。');
      const transport: Transport =
        c.transport === 'stdio'
          ? new StdioClientTransport({
              command: c.command,
              args: c.args,
              cwd: c.cwd || undefined,
              env: { ...getDefaultEnvironment(), ...secret.env },
              stderr: 'ignore',
              maxBufferSize: 2 * 1024 * 1024,
            })
          : new StreamableHTTPClientTransport(new URL(c.url), {
              fetch: this.fetcher(c.url, secret.token),
              requestInit: { redirect: 'error' },
              reconnectionOptions: {
                maxRetries: 0,
                initialReconnectionDelay: 1000,
                maxReconnectionDelay: 1000,
                reconnectionDelayGrowFactor: 1,
              },
            });
      const client = new Client(
        { name: 'AppDock MCP client', version: '1' },
        { capabilities: {}, jsonSchemaValidator: validator },
      );
      record = {
        id,
        identity,
        client,
        transport,
        controller: new AbortController(),
        ready: Promise.resolve(),
        fetchedAt: 0,
        toolsEpoch: 0,
        closed: false,
      };
      const current = record;
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        current.fetchedAt = 0;
        current.toolsEpoch++;
        this.options.changed?.();
      });
      client.onerror = () => {}; // Raw protocol errors can contain credentials or tool arguments.
      client.onclose = () => {
        if (!current.closed) {
          current.error = '接続が閉じられました。再取得で接続を確認してください。';
          current.fetchedAt = 0;
          this.options.changed?.();
        }
      };
      this.sessions.set(id, current);
      current.ready = (async () => {
        const timer = setTimeout(() => current.controller.abort(), 15000);
        try {
          await client.connect(transport, { signal: current.controller.signal, timeout: 15000 });
          if (
            current.closed ||
            current.controller.signal.aborted ||
            this.options.settings.identity(id) !== identity
          )
            return fail('CANCELLED', '接続設定が変更されました。');
          if (!client.getServerCapabilities()?.tools)
            return fail('UNSUPPORTED_CAPABILITY', '接続先はtoolsに対応していません。');
          if (/^appdock(?:$|[ ._-])/i.test(client.getServerVersion()?.name ?? ''))
            return fail('HUB_CYCLE', 'AppDock自身・別のAppDockへの中継接続はできません。');
        } catch (error) {
          if (current.closed) throw new AutomationError('CANCELLED', '接続は取り消されました。');
          const safe = safeError(error);
          this.connectionErrors.set(id, safe.message);
          current.error = safe.message;
          if (safe.code !== 'CANCELLED') this.options.failed?.(randomUUID(), safe);
          await this.close(current);
          throw new AutomationError(safe.code, safe.message);
        } finally {
          clearTimeout(timer);
          this.options.changed?.();
        }
      })();
    }
    await record.ready;
    this.configuration(actor, id);
    if (record.closed) return fail('CONNECTION_FAILED', 'MCP接続が閉じられました。');
    return record;
  }
  private async catalog(actor: McpActor, id: string, refresh = false) {
    const record = await this.session(actor, id);
    if (!refresh && record.tools && Date.now() - record.fetchedAt < 30000) return record.tools;
    if (record.loading) return record.loading;
    record.loading = (async () => {
      const tools: McpToolDescriptor[] = [],
        cursors = new Set<string>(),
        names = new Set<string>(),
        epoch = record.toolsEpoch;
      const signal = AbortSignal.any([record.controller.signal, AbortSignal.timeout(15000)]);
      let cursor: string | undefined;
      try {
        for (let page = 0; page < 16; page++) {
          const reply = await record.client.listTools(cursor ? { cursor } : {}, {
            signal,
            timeout: 15000,
          });
          boundedJson(reply, 1024 * 1024, 48, 65536);
          for (const raw of reply.tools) {
            if (tools.length >= 512 || names.has(raw.name) || !/^[\w.-]{1,128}$/.test(raw.name))
              return fail('INVALID_CATALOG', 'ツールの件数・名前・重複を確認してください。');
            boundedJson(raw, 65536, 40, 8192);
            names.add(raw.name);
            if (raw.name.startsWith('appdock_mcp_'))
              return fail('HUB_CYCLE', 'MCPハブの再中継には対応していません。');
            let unsupportedReason: string | undefined;
            try {
              safeSchema(raw.inputSchema);
              if (raw.outputSchema) safeSchema(raw.outputSchema);
              if (raw.execution?.taskSupport === 'required') throw Error();
            } catch {
              unsupportedReason = 'このツールのSchemaまたはMCP Tasksには対応していません。';
            }
            tools.push({
              name: raw.name,
              ...(raw.title === undefined ? {} : { title: raw.title }),
              ...(raw.description === undefined ? {} : { description: raw.description }),
              inputSchema: raw.inputSchema as JsonObject,
              ...(raw.outputSchema ? { outputSchema: raw.outputSchema as JsonObject } : {}),
              ...(raw.annotations ? { annotations: raw.annotations as JsonObject } : {}),
              toolRevision: mcpDigest([record.identity, raw]),
              ...(unsupportedReason ? { unsupportedReason } : {}),
            });
          }
          cursor = reply.nextCursor;
          if (!cursor) break;
          if (cursors.has(cursor) || page === 15)
            return fail('INVALID_CATALOG', 'ツール一覧のページ上限または循環を検出しました。');
          cursors.add(cursor);
        }
        boundedJson(tools, 1024 * 1024, 48, 65536);
        if (
          record.closed ||
          record.toolsEpoch !== epoch ||
          this.options.settings.identity(id) !== record.identity
        )
          return fail('STALE_CATALOG', 'ツール一覧が変更されました。再取得してください。');
        record.tools = tools;
        this.connectionErrors.delete(id);
        record.fetchedAt = Date.now();
        record.error = undefined;
        this.options.changed?.();
        return tools;
      } catch (error) {
        if (record.closed) throw new AutomationError('CANCELLED', '一覧取得は取り消されました。');
        const safe = safeError(error);
        record.error = safe.message;
        this.connectionErrors.set(id, safe.message);
        if (!record.closed && safe.code !== 'STALE_CATALOG')
          this.options.failed?.(randomUUID(), safe);
        this.options.changed?.();
        throw new AutomationError(safe.code, safe.message);
      } finally {
        record.loading = undefined;
      }
    })();
    return record.loading;
  }
  async tools(actor: McpActor, params: Record<string, unknown>) {
    this.configuration(actor, params.serverId);
    const id = params.serverId as string;
    const tools = await this.catalog(actor, id, params.refresh === true);
    const c = this.configuration(actor, id);
    return this.page(
      tools
        .filter((t) => !actor.external || c.publishedTools.includes(t.name))
        .map(({ inputSchema, outputSchema, annotations, ...t }) => t),
      params,
      actor.owner + ':' + id + ':' + this.options.settings.identity(id),
    );
  }
  async tool(actor: McpActor, params: Record<string, unknown>) {
    if (typeof params.name !== 'string')
      return fail('INVALID_ARGUMENT', 'ツール名を指定してください。');
    this.configuration(actor, params.serverId, params.name);
    const tool = (await this.catalog(actor, params.serverId as string)).find(
      (v) => v.name === params.name,
    );
    this.configuration(actor, params.serverId, params.name);
    if (!tool) return fail('NOT_FOUND', 'ツールが見つかりません。');
    return { tool: structuredClone(tool) };
  }
  commandValidation(config: JsonObject): string | null {
    if (
      !mcpUuid(config.serverId) ||
      !this.options.settings.roster().some((s) => s.id === config.serverId)
    )
      return '登録済みのMCP接続先を選択してください。';
    const record = this.sessions.get(config.serverId);
    if (
      !record?.tools ||
      record.closed ||
      record.error ||
      Date.now() - record.fetchedAt >= 30000 ||
      record.identity !== this.options.settings.identity(config.serverId)
    )
      return '接続先のツールを取得してから保存してください。';
    const tool = record.tools.find((t) => t.name === config.toolName);
    if (!tool || tool.toolRevision !== config.toolRevision)
      return 'ツールの詳細を再取得し、現在の引数と仕様を確認してください。';
    if (tool.unsupportedReason) return tool.unsupportedReason;
    return jsonObject(config.arguments) && safeSchema(tool.inputSchema)(config.arguments).valid
      ? null
      : '固定引数がツールのSchemaに一致しません。';
  }
  commandUnavailable(config: JsonObject): string | null {
    try {
      if (
        !mcpUuid(config.serverId) ||
        !this.options.settings.roster().some((s) => s.id === config.serverId)
      )
        return 'MCP接続先が未登録です。';
      const connection = this.options.settings.connection(config.serverId);
      if (!connection?.enabled) return 'このPCのMCP接続先が未設定またはOFFです。';
      if (
        connection.authentication === 'bearer' &&
        !this.options.settings.secrets(config.serverId).token
      )
        return 'MCP接続先のBearerを再入力してください。';
      const record = this.sessions.get(config.serverId);
      if (record?.tools && Date.now() - record.fetchedAt < 30000)
        return this.commandValidation(config);
      if (this.connectionErrors.has(config.serverId))
        return this.connectionErrors.get(config.serverId)!;
      return null; // No current catalog after restart: validate on execution.
    } catch {
      return 'MCP接続先の設定または認証情報を確認してください。';
    }
  }
  start(
    actor: McpActor,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    detachAfterAcceptance = false,
  ): Promise<McpJob> {
    this.allow(actor, true);
    this.expire();
    if (
      !mcpText(params.requestId, 100) ||
      !params.requestId ||
      !mcpText(params.name, 128) ||
      !params.name ||
      !mcpText(params.toolRevision, 100) ||
      !jsonObject(params.arguments) ||
      (params.timeoutMs !== undefined &&
        (!Number.isInteger(params.timeoutMs) ||
          Number(params.timeoutMs) < 1000 ||
          Number(params.timeoutMs) > 600000))
    )
      return Promise.reject(
        new AutomationError('INVALID_ARGUMENT', 'MCP呼出しの引数を確認してください。'),
      );
    boundedJson(params.arguments, 65536, 32, 8192);
    this.configuration(actor, params.serverId, params.name);
    const key = actor.owner + ':' + params.requestId,
      signature = mcpDigest(params);
    const existing = [...this.jobs.values()].find(
      (r) => r.actor.owner === actor.owner && r.requestId === params.requestId,
    );
    if (existing) {
      if (existing.signature !== signature)
        return Promise.reject(
          new AutomationError('REQUEST_CONFLICT', '同じrequestIdに別の入力を指定できません。'),
        );
      return Promise.resolve(this.get(actor, existing.job.jobId));
    }
    const pending = this.starts.get(key);
    if (pending)
      return pending.signature === signature
        ? pending.promise
        : Promise.reject(
            new AutomationError('REQUEST_CONFLICT', '同じrequestIdに別の入力を指定できません。'),
          );
    if (this.starts.size >= 8)
      return Promise.reject(new AutomationError('BUSY', 'MCPの受付数の上限に達しました。'));
    const promise = this.createJob(actor, params, signature, signal, detachAfterAcceptance).finally(
      () => this.starts.delete(key),
    );
    this.starts.set(key, { signature, promise });
    return promise;
  }
  private async createJob(
    actor: McpActor,
    p: Record<string, unknown>,
    signature: string,
    signal?: AbortSignal,
    detachAfterAcceptance = false,
  ) {
    const serverId = p.serverId as string,
      name = p.name as string;
    const tool = (await this.catalog(actor, serverId, true)).find((t) => t.name === name);
    this.allow(actor, true);
    this.configuration(actor, serverId, name);
    if (signal?.aborted) return fail('CANCELLED', '呼出しは取り消されました。');
    if (!tool) return fail('NOT_FOUND', 'ツールが見つかりません。');
    if (tool.unsupportedReason) return fail('UNSUPPORTED_SCHEMA', tool.unsupportedReason);
    if (tool.toolRevision !== p.toolRevision)
      return fail(
        'SCHEMA_CHANGED',
        'ツールまたは接続設定が変わりました。詳細を再取得して設定を確認してください。',
      );
    if (!safeSchema(tool.inputSchema)(p.arguments).valid)
      return fail('INVALID_ARGUMENT', '引数がツールのSchemaに一致しません。');
    const running = [...this.jobs.values()].filter((r) => r.job.state === 'running');
    if (
      running.length >= 4 ||
      running.some((r) => r.job.serverId === serverId) ||
      this.jobs.size >= 64 ||
      [...this.jobs.values()].filter(
        (r) => r.actor.owner === actor.owner && r.job.state === 'running',
      ).length >= 4
    )
      return fail(
        'BUSY',
        'MCPツールを実行中か保持件数が上限です。完了・保持期限を待ってください。',
      );
    const session = this.sessions.get(serverId)!;
    const job: McpJob = {
      jobId: randomUUID(),
      serverId,
      toolName: name,
      state: 'running',
      createdAt: Date.now(),
      effectVerified: false,
    };
    const controller = new AbortController();
    const abort = () =>
      this.finish(record, 'cancelled', {
        code: 'CANCELLED',
        message: '待機を取り消しました。操作先で発生した効果は戻りません。',
      });
    const record: JobRecord = {
      actor: structuredClone(actor),
      job,
      controller,
      identity: session.identity,
      requestId: p.requestId as string,
      signature,
      sent: false,
      timer: setTimeout(
        () =>
          this.finish(record, record.sent ? 'outcome-unknown' : 'failed', {
            code: 'TIMEOUT',
            message: '待ち時間を超えました。操作先を確認してから再実行してください。',
          }),
        Number(p.timeoutMs ?? 60000),
      ),
      dispose: () => signal?.removeEventListener('abort', abort),
    };
    this.jobs.set(job.jobId, record);
    // A saved command returns acceptance immediately. Its handler lifetime must
    // not cancel the independently owned job after returning that acceptance.
    if (!detachAfterAcceptance) signal?.addEventListener('abort', abort, { once: true });
    this.options.changed?.();
    this.options.audit?.(job);
    void (async () => {
      try {
        if (controller.signal.aborted) return;
        record.sent = true;
        // Use the protocol request directly: validate the exact snapshot's output,
        // independent of the SDK's per-page output-schema cache.
        const raw = await session.client.request(
          {
            method: 'tools/call',
            params: { name, arguments: structuredClone(p.arguments as JsonObject) },
          },
          CallToolResultSchema,
          {
            signal: controller.signal,
            timeout: Number(p.timeoutMs ?? 60000),
            onprogress: (v) => {
              if (job.state === 'running' && Number.isFinite(v.progress)) {
                job.progress = {
                  progress: v.progress,
                  ...(Number.isFinite(v.total) ? { total: v.total } : {}),
                };
                this.options.changed?.();
              }
            },
          },
        );
        boundedJson(raw, 1024 * 1024, 48, 65536);
        if (
          raw.isError !== true &&
          tool.outputSchema &&
          (!jsonObject(raw.structuredContent) ||
            !safeSchema(tool.outputSchema)(raw.structuredContent).valid)
        )
          return this.finish(record, 'outcome-unknown', {
            code: 'INVALID_RESULT',
            message: '接続先の結果が出力Schemaに一致しません。操作先を確認してください。',
          });
        const result: McpResult = {
          content: raw.content as JsonObject[],
          ...(raw.structuredContent
            ? { structuredContent: raw.structuredContent as JsonObject }
            : {}),
          ...(raw.isError === undefined ? {} : { isError: raw.isError }),
        };
        this.reconcile();
        if (job.state !== 'running') return;
        job.result = structuredClone(result);
        this.finish(
          record,
          raw.isError ? 'tool-error' : 'succeeded',
          raw.isError
            ? {
                code: 'TOOL_ERROR',
                message: '接続先ツールがエラーを返しました。結果を確認してください。',
              }
            : undefined,
        );
      } catch (error) {
        if (job.state !== 'running') return;
        const safe = safeError(error, record.sent);
        this.finish(record, record.sent ? 'outcome-unknown' : 'failed', safe);
      }
    })();
    return structuredClone(job);
  }
  private finish(record: JobRecord, state: McpJob['state'], error?: McpJob['error']) {
    if (record.job.state !== 'running') return;
    record.job.state = state;
    record.job.finishedAt = Date.now();
    record.job.error = error;
    clearTimeout(record.timer);
    record.dispose();
    record.controller.abort();
    this.options.audit?.(record.job);
    this.options.changed?.();
    if (error && state !== 'cancelled') this.options.failed?.(record.job.jobId, error);
  }
  get(actor: McpActor, id: unknown) {
    this.allow(actor);
    this.expire();
    this.reconcile();
    const record = this.jobs.get(String(id));
    if (!record || (actor.kind !== 'host' && record.actor.owner !== actor.owner))
      return fail('NOT_FOUND', 'ジョブが見つかりません。期限切れ・再起動後は再開できません。');
    this.configuration(actor, record.job.serverId, record.job.toolName);
    return structuredClone(record.job);
  }
  cancel(actor: McpActor, id: unknown) {
    this.allow(actor, true);
    this.get(actor, id);
    const record = this.jobs.get(String(id))!;
    this.finish(record, 'cancelled', {
      code: 'CANCELLED',
      message: '待機を取り消しました。操作先で発生した効果は戻りません。',
    });
    return structuredClone(record.job);
  }
  summaries() {
    this.expire();
    return [...this.jobs.values()]
      .map(({ job }) => {
        const { result, ...summary } = job;
        return structuredClone(summary);
      })
      .slice(-16)
      .reverse();
  }
  private expire() {
    const now = Date.now();
    for (const [id, r] of this.jobs)
      if (r.job.finishedAt && now - r.job.finishedAt > (this.options.ttlMs ?? 600000))
        this.jobs.delete(id);
  }
  reconcile() {
    for (const record of this.sessions.values()) {
      try {
        if (
          !this.options.settings.roster().some((s) => s.id === record.id) ||
          !this.options.settings.connection(record.id)?.enabled ||
          this.options.settings.identity(record.id) !== record.identity
        )
          void this.close(record);
      } catch {
        void this.close(record);
      }
    }
    for (const r of this.jobs.values()) {
      let valid = false;
      try {
        this.configuration(r.actor, r.job.serverId, r.job.toolName);
        valid =
          this.options.authorized(r.actor, true) &&
          this.options.settings.identity(r.job.serverId) === r.identity;
      } catch {}
      if (!valid) {
        delete r.job.result;
        this.finish(r, 'cancelled', {
          code: 'PERMISSION_REVOKED',
          message: '許可・接続設定・呼出し元が変わったため取り消しました。',
        });
      }
    }
  }
  async shutdown() {
    clearInterval(this.reaper);
    for (const r of this.jobs.values())
      this.finish(r, 'cancelled', { code: 'SHUTDOWN', message: 'AppDockを終了しています。' });
    await Promise.allSettled([...this.sessions.values()].map((s) => this.close(s)));
    this.jobs.clear();
  }
}

import { boundedJson, jsonObject, type JsonObject } from './custom-commands';

export interface McpServerEntry {
  id: string;
  name: string;
  description: string;
}
export interface McpServerRoster {
  version: 1;
  items: McpServerEntry[];
}
export interface McpConnection {
  enabled: boolean;
  transport: 'stdio' | 'http';
  command: string;
  args: string[];
  cwd: string;
  url: string;
  authentication: 'none' | 'bearer';
  published: boolean;
  publishedTools: string[];
}
export interface McpLocalStatus {
  id: string;
  connection?: McpConnection;
  tokenConfigured: boolean;
  environmentNames: string[];
  state: string;
  error?: string;
}
export interface McpToolDescriptor {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  annotations?: JsonObject;
  toolRevision: string;
  unsupportedReason?: string;
}
export interface McpResult {
  content: JsonObject[];
  structuredContent?: JsonObject;
  isError?: boolean;
}
export interface McpJob {
  jobId: string;
  serverId: string;
  toolName: string;
  state: 'running' | 'succeeded' | 'tool-error' | 'failed' | 'cancelled' | 'outcome-unknown';
  createdAt: number;
  finishedAt?: number;
  progress?: { progress: number; total?: number };
  error?: { code: string; message: string };
  result?: McpResult;
  effectVerified: false;
}
export const mcpUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const mcpText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
export function parseMcpRoster(value: unknown): McpServerRoster {
  if (value === undefined) return { version: 1, items: [] };
  boundedJson(value, 65536, 4, 512);
  if (
    !jsonObject(value) ||
    value.version !== 1 ||
    !Array.isArray(value.items) ||
    value.items.length > 32 ||
    Object.keys(value).some((k) => !['version', 'items'].includes(k))
  )
    throw Error('MCP接続先名簿はversion 1、32件以内です。');
  const ids = new Set<string>();
  return {
    version: 1,
    items: value.items.map((v) => {
      if (
        !jsonObject(v) ||
        !mcpUuid(v.id) ||
        ids.has(v.id) ||
        !mcpText(v.name, 160) ||
        !v.name.trim() ||
        !mcpText(v.description, 1024) ||
        Object.keys(v).some((k) => !['id', 'name', 'description'].includes(k))
      )
        throw Error('MCP接続先のID・名前・説明を確認してください。');
      ids.add(v.id);
      return { id: v.id, name: v.name.trim(), description: v.description };
    }),
  };
}
export const defaultMcpConnection = (): McpConnection => ({
  enabled: false,
  transport: 'http',
  command: '',
  args: [],
  cwd: '',
  url: '',
  authentication: 'none',
  published: false,
  publishedTools: [],
});
export function parseMcpConnection(value: unknown): McpConnection {
  boundedJson(value, 65536, 6, 1024);
  if (
    !jsonObject(value) ||
    Object.keys(value).some((k) => !Object.hasOwn(defaultMcpConnection(), k)) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.published !== 'boolean' ||
    !['stdio', 'http'].includes(String(value.transport)) ||
    !['none', 'bearer'].includes(String(value.authentication)) ||
    !mcpText(value.command, 4096) ||
    !mcpText(value.cwd, 4096) ||
    !mcpText(value.url, 4096) ||
    !Array.isArray(value.args) ||
    value.args.length > 64 ||
    !value.args.every((v) => mcpText(v, 4096)) ||
    !Array.isArray(value.publishedTools) ||
    value.publishedTools.length > 512 ||
    !value.publishedTools.every((v) => typeof v === 'string' && /^[\w.-]{1,128}$/.test(v)) ||
    new Set(value.publishedTools).size !== value.publishedTools.length
  )
    throw Error('MCP接続設定の形式が不正です。');
  if (value.transport === 'http') {
    let url: URL;
    try {
      url = new URL(value.url);
    } catch {
      throw Error('MCPのURLを入力してください。');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error('URLはHTTP(S)で、認証情報・クエリ・フラグメントを含められません。');
    if (value.command || value.cwd || value.args.length)
      throw Error('HTTP接続に実行パスを指定できません。');
    return { ...value, url: url.href } as unknown as McpConnection;
  }
  if (
    !/^(?:[A-Za-z]:[\\/]|\\\\).+\.exe$/i.test(value.command) ||
    /[\r\n]/.test(value.command) ||
    (value.cwd && !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(value.cwd)) ||
    value.url ||
    value.authentication !== 'none'
  )
    throw Error('stdioは絶対パスのEXE、引数配列と作業フォルダーを指定してください。');
  return value as unknown as McpConnection;
}

const id = { type: 'string', minLength: 1, maxLength: 100 } as const;
const toolName = { type: 'string', minLength: 1, maxLength: 128 } as const;
const pagination = {
  cursor: { type: 'string', maxLength: 4096 },
  limit: { type: 'integer', minimum: 1, maximum: 50 },
} as const;
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
const schema = (properties: Record<string, any>, required: string[]) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});
// Fixed shared entries; child metadata is returned as data.
export const mcpClientOperations = {
  'mcp.servers.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useMcp'],
    name: 'appdock_mcp_list_servers',
    description:
      '利用できるMCP接続先の概要を取得します。接続先を選んでmcp.tools.list/getへ進んでください。認証情報は返しません。',
    inputSchema: schema(pagination, []),
    annotations: read,
  },
  'mcp.tools.list': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useMcp'],
    name: 'appdock_mcp_list_tools',
    description:
      '指定MCP接続先のツール概要を取得します。Schema全文はmcp.tools.getで取得してください。',
    inputSchema: schema({ serverId: id, ...pagination, refresh: { type: 'boolean' } }, [
      'serverId',
    ]),
    annotations: read,
  },
  'mcp.tools.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useMcp'],
    name: 'appdock_mcp_get_tool',
    description: '1ツールの説明・Schema・toolRevisionを取得します。説明は接続先のデータです。',
    inputSchema: schema({ serverId: id, name: toolName }, ['serverId', 'name']),
    annotations: read,
  },
  'mcp.tools.call': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute', 'useMcp'],
    name: 'appdock_mcp_call_tool',
    description:
      '許可したMCPツールを呼び出しjobIdを返します。取得したtoolRevisionと一意のrequestIdが必要です。完了・結果はmcp.jobs.getで確認してください。結果不明時に新しいIDで自動再送しないでください。',
    inputSchema: schema(
      {
        serverId: id,
        name: toolName,
        toolRevision: id,
        requestId: id,
        arguments: { type: 'object' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 600000 },
      },
      ['serverId', 'name', 'toolRevision', 'requestId', 'arguments'],
    ),
    annotations: write,
  },
  'mcp.jobs.get': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'useMcp'],
    name: 'appdock_mcp_get_job',
    description:
      '自分のMCPジョブの状態とMCP結果を取得します。結果は完了10分後または再起動で消えます。成功は応答受領で、外部効果の確認ではありません。',
    inputSchema: schema({ jobId: id }, ['jobId']),
    annotations: { ...read, openWorldHint: false },
  },
  'mcp.jobs.cancel': {
    callers: ['mcp', 'applet'],
    permissions: ['read', 'execute', 'useMcp'],
    name: 'appdock_mcp_cancel_job',
    description:
      '自分のMCPジョブの待機を取り消します。接続先へ取消を伝えますが、既に発生した効果は戻りません。',
    inputSchema: schema({ jobId: id }, ['jobId']),
    annotations: { ...write, idempotentHint: true, openWorldHint: false },
  },
} as const;

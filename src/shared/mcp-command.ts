import type { CustomCommandType } from './custom-commands';
export const mcpCommandType: CustomCommandType = {
  id: 'appdock.mcp.call',
  title: 'MCPツールを実行',
  description:
    '接続先・ツール・固定引数を保存し、実行時にジョブを受け付けます。完了と取消はMCP接続先の実行状況で確認できます。',
  configVersion: 1,
  automation: true,
  configSchema: {
    type: 'object',
    properties: {
      serverId: { type: 'string', minLength: 36, maxLength: 36 },
      toolName: { type: 'string', minLength: 1, maxLength: 128 },
      toolRevision: { type: 'string', minLength: 64, maxLength: 64 },
      arguments: { type: 'object' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 600000 },
    },
    required: ['serverId', 'toolName', 'toolRevision', 'arguments'],
    additionalProperties: false,
  },
  fields: [
    { key: 'serverId', title: 'MCP接続先ID', type: 'string' },
    { key: 'toolName', title: 'ツール名', type: 'string' },
    { key: 'toolRevision', title: '確認したツールの識別情報', type: 'string' },
    { key: 'arguments', title: '固定引数', type: 'json', default: {} },
    { key: 'timeoutMs', title: '応答の制限時間（ミリ秒）', type: 'number', default: 60000 },
  ],
};

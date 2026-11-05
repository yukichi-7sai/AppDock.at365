import type { CustomCommandType } from './custom-commands';
import { hostText } from './i18n';
import { localizedMetadata } from './translation-metadata';
export const mcpCommandType = localizedMetadata<CustomCommandType>(() => ({
  id: 'appdock.mcp.call',
  title: hostText('commands.mcp.title'),
  description: hostText('commands.mcp.description'),
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
    { key: 'serverId', title: hostText('commands.mcp.serverId'), type: 'string' },
    { key: 'toolName', title: hostText('commands.mcp.toolName'), type: 'string' },
    { key: 'toolRevision', title: hostText('commands.mcp.toolRevision'), type: 'string' },
    { key: 'arguments', title: hostText('commands.mcp.arguments'), type: 'json', default: {} },
    { key: 'timeoutMs', title: hostText('commands.mcp.timeout'), type: 'number', default: 60000 },
  ],
}));

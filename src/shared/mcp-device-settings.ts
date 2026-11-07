import { validateJson, customDescription, jsonObject, type JsonObject } from './custom-commands';
import { commandCategory } from './command-category';
import {
  mcpUuid,
  parseMcpConnection,
  parseMcpRoster,
  type McpConnection,
  type McpServerEntry,
} from './mcp-client';
import { hostText } from './i18n';

export interface McpToolBinding {
  version: number;
  endpointFingerprint: string;
  definitionFingerprint: string;
}
export interface McpDeviceServer extends McpServerEntry {
  connection: McpConnection;
  requiresEnvironment: boolean;
}
export interface McpToolCommand {
  id: string;
  title: string;
  description: string;
  category?: string;
  enabled: boolean;
  automation: boolean;
  serverId: string;
  toolName: string;
  arguments: JsonObject;
  timeoutMs: number;
  toolBinding: McpToolBinding | null;
}
export interface McpDeviceSettings {
  version: 1;
  servers: McpDeviceServer[];
  commands: McpToolCommand[];
}
export const mcpSettingsTabTitles = {
  connections: 'settings.mcpClientSettings.connectionsTab',
  commands: 'settings.mcpCommands.title',
  tools: 'settings.mcpClientSettings.toolsTab',
} as const;
export type McpSettingsTab = keyof typeof mcpSettingsTabTitles;
export const emptyMcpDeviceSettings = (): McpDeviceSettings => ({
  version: 1,
  servers: [],
  commands: [],
});
export const mcpToolCommandId = (id: string) => `appdock.mcp.tool.${id}`;
const invalid = (): never => {
  throw Error(hostText('settings.mcp-client-settings.invalidUpdate'));
};
const only = (value: JsonObject, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
export function parseMcpToolCommand(value: unknown): McpToolCommand {
  if (
    !jsonObject(value) ||
    !only(value, [
      'id',
      'title',
      'description',
      'category',
      'enabled',
      'automation',
      'serverId',
      'toolName',
      'arguments',
      'timeoutMs',
      'toolBinding',
    ]) ||
    !mcpUuid(value.id) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    /[\x00-\x1f\x7f]/.test(value.title) ||
    !mcpUuid(value.serverId) ||
    typeof value.toolName !== 'string' ||
    !value.toolName ||
    value.toolName.length > 128 ||
    typeof value.enabled !== 'boolean' ||
    typeof value.automation !== 'boolean' ||
    !jsonObject(value.arguments) ||
    !Number.isInteger(value.timeoutMs) ||
    Number(value.timeoutMs) < 1000 ||
    Number(value.timeoutMs) > 600000
  )
    return invalid();
  const binding = value.toolBinding;
  if (
    binding !== null &&
    (!jsonObject(binding) ||
      !only(binding, ['version', 'endpointFingerprint', 'definitionFingerprint']) ||
      !Number.isSafeInteger(binding.version) ||
      Number(binding.version) < 1 ||
      ![binding.endpointFingerprint, binding.definitionFingerprint].every(
        (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v),
      ))
  )
    return invalid();
  if (!binding && (value.enabled || value.automation)) return invalid();
  validateJson(value.arguments);
  return structuredClone({
    ...value,
    title: value.title.trim(),
    description: customDescription(value.description ?? ''),
    ...(value.category === undefined ? {} : { category: commandCategory(value.category) }),
  }) as unknown as McpToolCommand;
}
export function parseMcpDeviceSettings(value: unknown): McpDeviceSettings {
  if (value === undefined) return emptyMcpDeviceSettings();
  if (
    !jsonObject(value) ||
    !only(value, ['version', 'servers', 'commands']) ||
    value.version !== 1 ||
    !Array.isArray(value.servers) ||
    !Array.isArray(value.commands)
  )
    return invalid();
  validateJson(value);
  const roster = parseMcpRoster({
    version: 1,
    items: value.servers.map((row) =>
      jsonObject(row) ? { id: row.id, name: row.name, description: row.description } : row,
    ),
  }).items;
  const servers = value.servers.map((row, i) => {
    if (
      !jsonObject(row) ||
      !only(row, ['id', 'name', 'description', 'connection', 'requiresEnvironment']) ||
      typeof row.requiresEnvironment !== 'boolean'
    )
      return invalid();
    const connection = parseMcpConnection(row.connection);
    if (connection.transport !== 'stdio' && row.requiresEnvironment) return invalid();
    return { ...roster[i], connection, requiresEnvironment: row.requiresEnvironment };
  });
  const commands = value.commands.map(parseMcpToolCommand);
  if (new Set(commands.map((c) => c.id)).size !== commands.length) return invalid();
  return { version: 1, servers, commands };
}
/** Shared files must never supply device MCP definitions, including on first launch. */
export function withoutDeviceMcp<T>(value: T): T {
  if (!jsonObject(value)) return value;
  if (value.mcpServers !== undefined) parseMcpRoster(value.mcpServers);
  const result = { ...value };
  delete result.mcpClient;
  delete result.mcpServers;
  return result as T;
}

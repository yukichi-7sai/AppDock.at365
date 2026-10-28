import { randomUUID } from 'node:crypto';
import { settingsUiGroup } from '../../shared/settings-mcp-access';
import type { SettingDefinition } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import { defaultMcpConnection, mcpText, parseMcpConnection } from '../../shared/mcp-client';
import { validateMcpSetting } from '../../shared/mcp-setting-fields';
import { settingInputSchema } from '../../shared/settings-commands';
import { McpSettingsError, type McpClientSettings, type PublicMcpRow } from './mcp-client-settings';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';

type Row = Record<string, unknown>;
const endpointKeys = ['transport', 'command', 'args', 'cwd', 'url', 'authentication'];
const safeError = (error: unknown): never => {
  const code = error instanceof McpSettingsError ? error.code : 'INVALID_ARGUMENT';
  throw new SettingsTargetError(
    code === 'PRIVATE_SETTING' ? 'LOCAL_ACTION_REQUIRED' : code,
    error instanceof McpSettingsError
      ? error.message
      : hostText('services.settingsTargets.invalid'),
  );
};

/** The MCP client owns the shared roster and its separate, encrypted device configuration. */
export function mcpClientSettingsTarget(
  owner: McpClientSettings,
  checkRevision: (revision: string) => void,
): SettingsListTarget {
  let snapshot: ReturnType<McpClientSettings['publicConfiguration']>;
  let available = true;
  try {
    snapshot = owner.publicConfiguration();
  } catch {
    available = false;
    snapshot = { rows: owner.roster(), protectedIds: [], states: {}, revision: '' };
  }
  const text = (
    key: string,
    title: string,
    maxLength: number,
    minLength = 0,
  ): SettingDefinition => ({ key, title, type: 'string', minLength, maxLength });
  const select = (key: string, title: string, values: string[]): SettingDefinition => ({
    key,
    title,
    type: 'select',
    options: values.map((value) => ({ value, label: value })),
  });
  const fields: SettingDefinition[] = [
    text('id', hostText('settings.aiSettings.connectionId'), 100),
    text('name', hostText('settings.mcpClientSettings.name'), 160, 1),
    text('description', hostText('settings.mcpClientSettings.description'), 1024),
    ...[
      {
        key: 'enabled',
        title: hostText('settings.mcpClientSettings.allow'),
        type: 'boolean' as const,
      },
      select('transport', hostText('settings.mcpClientSettings.transport'), ['http', 'stdio']),
      text('command', hostText('settings.mcpClientSettings.executable'), 4096),
      {
        key: 'args',
        title: hostText('settings.mcpClientSettings.argsArray'),
        type: 'string-list' as const,
      },
      text('cwd', hostText('settings.mcpClientSettings.workingDirectory'), 4096),
      text('url', hostText('settings.mcpClientSettings.url'), 4096),
      select('authentication', hostText('settings.mcpClientSettings.auth'), ['none', 'bearer']),
      {
        key: 'published',
        title: hostText('settings.mcpClientSettings.publish'),
        type: 'boolean' as const,
      },
      {
        key: 'publishedTools',
        title: hostText('settings.mcpClientSettings.publishedTools'),
        type: 'string-list' as const,
      },
    ].map((field) => ({
      ...field,
      key: 'connection.' + field.key,
      propertyPath: ['connection', field.key],
    })),
  ];
  const definition: SettingDefinition = {
    key: 'servers',
    title: hostText('settings.mcpClientSettings.title'),
    type: 'object-list',
    fields,
    list: { idKey: 'id', titleKey: 'name', columns: ['name', 'description'] },
  };
  const protectedRow = (row: Row) => snapshot.protectedIds.includes(String(row.id));
  const writable = (row: Row, field: SettingDefinition) =>
    available &&
    field.key !== 'id' &&
    (!protectedRow(row) || !endpointKeys.some((key) => field.key === 'connection.' + key));
  return {
    kind: 'list',
    targetId: 'service.mcp.servers',
    ui: settingsUiGroup('mcp-client', 'connections'),
    ownerId: 'appdock',
    title: definition.title,
    category: 'mcp-client',
    available,
    fields,
    definition,
    rows: () => snapshot.rows as unknown as Row[],
    overrides: () => {
      try {
        return { $guard: owner.revision() };
      } catch {
        return undefined;
      }
    },
    schemaContext: () => ({ protectedIds: [...snapshot.protectedIds].sort() }),
    applies: () => 'mcpSettingsChanged',
    writable: (field) => available && field.key !== 'id',
    itemWritable: writable,
    removable: (row) => available && !protectedRow(row),
    inputSchema: (field) =>
      field.key === 'connection.args'
        ? { type: 'array', items: { type: 'string', maxLength: 4096 } }
        : field.key === 'connection.publishedTools'
          ? {
              type: 'array',
              uniqueItems: true,
              items: { type: 'string', pattern: '^[\\w.-]{1,128}$' },
            }
          : settingInputSchema(field),
    validateField: (field, value) => {
      if (field.key === 'connection.args') {
        if (!Array.isArray(value) || !value.every((item) => mcpText(item, 4096))) throw Error();
      } else if (field.key === 'connection.publishedTools') {
        if (
          !Array.isArray(value) ||
          new Set(value).size !== value.length ||
          !value.every((item) => typeof item === 'string' && /^[\w.-]{1,128}$/.test(item))
        )
          throw Error();
      } else validateMcpSetting(field, value, field.options);
    },
    createRow: () => ({
      id: randomUUID(),
      name: hostText('settings.mcpClientSettings.server'),
      description: '',
      connection: defaultMcpConnection(),
    }),
    prepareRow: (row, keys) => {
      row.name = String(row.name).trim();
      if (row.connection !== undefined && keys.some((key) => key.startsWith('connection.'))) {
        try {
          const candidate = {
            ...defaultMcpConnection(),
            ...(row.connection as Row),
          };
          const connection = parseMcpConnection(candidate);
          if (!keys.includes('connection.url')) connection.url = candidate.url;
          row.connection = connection;
        } catch (error) {
          safeError(error);
        }
      }
    },
    plan: (rows, revision) => {
      checkRevision(revision);
      let plan: ReturnType<McpClientSettings['planPublicConfiguration']>;
      try {
        plan = owner.planPublicConfiguration(rows as unknown as PublicMcpRow[], snapshot.revision);
      } catch (error) {
        return safeError(error);
      }
      return {
        changed: plan.changed ? ['servers'] : [],
        before: {},
        values: {},
        applies: { servers: 'mcpSettingsChanged' },
        commit: () => {
          checkRevision(revision);
          try {
            plan.commit();
          } catch (error) {
            safeError(error);
          }
        },
      };
    },
  };
}

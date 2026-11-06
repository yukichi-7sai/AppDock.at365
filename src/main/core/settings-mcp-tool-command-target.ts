import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import type { SettingDefinition } from '../../shared/contracts';
import { settingsUiGroup } from '../../shared/settings-mcp-access';
import { settingInputSchema } from '../../shared/settings-commands';
import { validateMcpSetting } from '../../shared/mcp-setting-fields';
import { jsonObject, boundedJson } from '../../shared/custom-commands';
import type { McpToolCommandService } from './mcp-tool-commands';
import type { McpClientSettings } from './mcp-client-settings';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';

export function mcpToolCommandSettingsTarget(
  owner: McpToolCommandService,
  settings: McpClientSettings,
  checkRevision: (revision: string) => void,
): SettingsListTarget {
  const snapshot = settings.revision();
  const revisionsProvided = new Set<unknown>();
  const readonly = ['id', 'available', 'unavailableReason'];
  const fields: SettingDefinition[] = [
    { key: 'id', title: 'ID', type: 'string' },
    {
      key: 'title',
      title: hostText('settings.customCommandsSettings.name'),
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    {
      key: 'description',
      title: hostText('settings.mcpClientSettings.description'),
      type: 'string',
    },
    { key: 'category', title: hostText('commands.category.label'), type: 'string' },
    { key: 'enabled', title: hostText('settings.customCommandsSettings.enabled'), type: 'boolean' },
    {
      key: 'automation',
      title: hostText('settings.customCommandsSettings.public'),
      type: 'boolean',
    },
    { key: 'serverId', title: hostText('settings.mcpCommandFields.server'), type: 'string' },
    { key: 'toolName', title: hostText('settings.mcpCommandFields.tool'), type: 'string' },
    { key: 'arguments', title: hostText('settings.mcpCommandFields.args'), type: 'json' },
    {
      key: 'timeoutMs',
      title: hostText('settings.mcpCommandFields.timeout'),
      type: 'number',
      minimum: 1000,
      maximum: 600000,
      step: 1,
    },
    { key: 'toolRevision', title: 'toolRevision', type: 'string' },
    {
      key: 'available',
      title: hostText('settings.mcpClientSettings.deviceState'),
      type: 'boolean',
    },
    {
      key: 'unavailableReason',
      title: hostText('settings.mcpCommands.reviewRequired'),
      type: 'string',
    },
  ];
  const definition: SettingDefinition = {
    key: 'commands',
    title: hostText('settings.mcpCommands.title'),
    type: 'object-list',
    fields,
    list: { idKey: 'id', titleKey: 'title', columns: ['title', 'toolName'], enabledKey: 'enabled' },
  };
  return {
    kind: 'list',
    targetId: 'service.mcp.toolCommands',
    ownerId: 'appdock',
    category: 'mcp-client',
    ui: settingsUiGroup('mcp-client', 'commands'),
    title: definition.title,
    available: true,
    fields,
    definition,
    rows: () => {
      const summaries = new Map(owner.summaries().map((row) => [row.id, row]));
      return owner.items().map((row) => {
        const { toolBinding: _binding, ...item } = row;
        const summary = summaries.get(row.id)!;
        return {
          ...item,
          toolRevision: owner.currentToolRevision(row),
          available: summary.available,
          unavailableReason: summary.unavailableReason ?? '',
        };
      });
    },
    overrides: () => ({ $guard: settings.revision() }),
    applies: () => 'mcpSettingsChanged',
    writable: (field) => !readonly.includes(field.key),
    itemWritable: (_row, field) => !readonly.includes(field.key),
    inputSchema: (field) =>
      field.key === 'arguments' ? { type: 'object' } : settingInputSchema(field),
    validateField: (field, value) => {
      if (field.key === 'arguments') {
        if (!jsonObject(value)) throw Error();
        boundedJson(value, Infinity, 40, Infinity);
      } else validateMcpSetting(field, value, field.options);
    },
    createRow: () => ({
      id: randomUUID(),
      title: hostText('settings.mcpCommands.title'),
      description: '',
      enabled: false,
      automation: false,
      serverId: '',
      toolName: '',
      arguments: {},
      timeoutMs: 60000,
    }),
    prepareRow: (row, keys) => {
      if (keys.includes('toolRevision')) revisionsProvided.add(row.id);
    },
    plan: (rows, revision) => {
      checkRevision(revision);
      try {
        const plan = owner.plan(
          rows.map(
            ({ toolRevision, available: _available, unavailableReason: _reason, ...row }) => ({
              ...row,
              ...(revisionsProvided.has(row.id) ? { toolRevision } : {}),
            }),
          ),
          snapshot,
        );
        return {
          changed: plan.changed ? ['commands'] : [],
          before: {},
          values: {},
          applies: { commands: 'mcpSettingsChanged' },
          commit: () => {
            checkRevision(revision);
            plan.commit();
          },
        };
      } catch (error) {
        throw new SettingsTargetError(
          (error as any).code ?? 'INVALID_ARGUMENT',
          (error as Error).message,
        );
      }
    },
  };
}

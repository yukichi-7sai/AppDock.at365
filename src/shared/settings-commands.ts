import { hostText } from './i18n';
import { isSettingAccessible } from './setting-access';
import type { AppletCommand, SettingDefinition } from './contracts';
export { hostSettingDefinitions } from './host-settings';

export function generatedSettingCommands(
  owner: string,
  definitions: SettingDefinition[],
  available: boolean,
): AppletCommand[] {
  return definitions.flatMap((field) =>
    (field.generateCommands ?? []).map((action) => ({
      id: `${owner}.settings.${field.key}.${action}`,
      title: hostText(`commands.setting.${action}Title`, { title: field.title }),
      description: hostText(`commands.setting.${action}Description`, {
        title: field.title,
        detail: field.description ?? '',
      }).trim(),
      category: hostText('commands.category.settings'),
      available,
      automation: isSettingAccessible(field, 'mcp'),
    })),
  );
}

export function validateSettingCommandIds(
  owner: string,
  definitions: SettingDefinition[],
  registered: { id: string; aliases?: string[] }[],
) {
  const reserved = new Set([
    ...(definitions.some((s) => isSettingAccessible(s, 'mcp')) ? [`${owner}.settings.update`] : []),
    ...generatedSettingCommands(owner, definitions, false).map((c) => c.id),
  ]);
  if (
    [...reserved].some((id) => id.length > 180) ||
    registered.some((c) => reserved.has(c.id) || c.aliases?.some((id) => reserved.has(id)))
  )
    throw Error(hostText('services.settingCommands.invalidId'));
}

export function settingInputSchema(field: SettingDefinition): Record<string, unknown> {
  const description = field.description || field.title;
  if (field.type === 'registered-image')
    return {
      description,
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: { file: { type: 'string', minLength: 1 } },
          required: ['file'],
          additionalProperties: false,
        },
      ],
    };
  if (field.type === 'select')
    return { type: 'string', enum: field.options?.map((o) => o.value), description };
  if (field.type === 'number')
    return {
      type: 'number',
      description,
      ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
      ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
    };
  return {
    type: field.type,
    description,
    ...(field.type === 'string'
      ? {
          minLength: field.minLength ?? 0,
          ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        }
      : {}),
  };
}

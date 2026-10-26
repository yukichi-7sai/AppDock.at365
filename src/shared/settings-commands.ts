import { hostText } from './i18n';
import { isSettingAccessible } from './setting-access';
import type { AppletCommand, SettingDefinition } from './contracts';
import { hostSettingDefinitions } from './host-settings';
export { hostSettingDefinitions } from './host-settings';

export function generatedSettingCommands(
  owner: string,
  definitions: SettingDefinition[],
  available: boolean,
): AppletCommand[] {
  return definitions.flatMap((field) =>
    (field.generateCommands ?? []).map((action) => ({
      id: `${owner}.settings.${field.key}.${action}`,
      title: `${field.title}を${{ on: 'ONにする', off: 'OFFにする', toggle: '切り替える' }[action]}`,
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
    throw Error('設定から生成するコマンドIDが長すぎるか、登録コマンドと重複しています。');
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
          properties: { file: { type: 'string', minLength: 1, maxLength: 180 } },
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
      ? { minLength: field.minLength ?? 0, maxLength: field.maxLength ?? 10000 }
      : {}),
  };
}

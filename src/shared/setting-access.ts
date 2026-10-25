import type { SettingDefinition } from './contracts';

export type SettingsCaller = 'mcp' | 'applet';

/** Only declared, supported values are externally accessible. Ownership APIs remain separate. */
export function isSettingAccessible(field: SettingDefinition, caller: SettingsCaller) {
  if (field.secret || field.localOnly || field.automation === false) return false;
  if (
    !['boolean', 'number', 'string', 'select'].includes(field.type) ||
    field.dynamic ||
    field.optionSource
  )
    return false;
  return caller === 'mcp' || field.automation === true;
}

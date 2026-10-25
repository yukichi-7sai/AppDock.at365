import type { SettingDefinition, SettingOption } from './contracts';
import { validateSettingValue } from './setting-definitions';
import { webUrl } from './web-content';

export const mcpSettingPublished = (field: SettingDefinition) =>
  !field.secret && !field.localOnly && field.automation !== false;
export const mcpSettingSupported = (field: SettingDefinition, nested = false) =>
  ['boolean', 'number', 'string', 'select', ...(nested ? ['string-list'] : [])].includes(
    field.type,
  ) &&
  (!nested || !field.dynamic || !!field.optionSource);
const paths = (field: SettingDefinition) => [
  field.propertyPath ?? [field.key],
  ...(field.aliases ?? []).map((key) => [key]),
];
const overlaps = (a: string[], b: string[]) =>
  a.slice(0, Math.min(a.length, b.length)).every((key, index) => key === b[index]);
export const settingFieldsOverlap = (a: SettingDefinition, b: SettingDefinition) =>
  paths(a).some((left) => paths(b).some((right) => overlaps(left, right)));
export function publicListFields(definition: SettingDefinition) {
  const fields = definition.fields ?? [];
  const hidden = fields.filter(
    (field) => !mcpSettingPublished(field) || !mcpSettingSupported(field, true),
  );
  const identity = fields.find((field) => field.key === definition.list?.idKey);
  return fields.filter(
    (field) =>
      mcpSettingPublished(field) &&
      mcpSettingSupported(field, true) &&
      !hidden.some((other) => settingFieldsOverlap(field, other)) &&
      (!identity || field.key === identity.key || !settingFieldsOverlap(field, identity)),
  );
}
export function validateMcpSetting(
  field: SettingDefinition,
  value: unknown,
  options?: SettingOption[],
) {
  validateSettingValue(field, value);
  if (field.type === 'string' && field.format === 'url') webUrl(value);
  if (field.type === 'select' && !options?.some((option) => option.value === value))
    throw Error('Unavailable setting option');
}

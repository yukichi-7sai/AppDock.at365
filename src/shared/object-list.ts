import { hostText } from './i18n';
import type { SettingDefinition } from './contracts';

export function readObjectList(value: unknown): Record<string, unknown>[] {
  const list = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !Array.isArray(list) ||
    list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
  )
    throw new Error(hostText('services.sharedObjectList.itemLimit'));
  return list;
}
export function objectFieldValue(item: Record<string, unknown>, field: SettingDefinition): unknown {
  const stored = field.propertyPath?.reduce<unknown>(
    (value, key) =>
      value && typeof value === 'object' && Object.hasOwn(value, key)
        ? (value as Record<string, unknown>)[key]
        : undefined,
    item,
  );
  const value = field.propertyPath
    ? field.type === 'registered-image' && stored === null
      ? null
      : (stored ?? field.default)
    : Object.hasOwn(item, field.key)
      ? item[field.key]
      : field.default;
  if (field.type === 'string-list') {
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    )
      throw new Error(
        hostText('services.sharedObjectList.directoryList', { name: String(field.title) }),
      );
    const strings = Array.isArray(value) ? [...value] : [];
    for (const alias of field.aliases ?? []) {
      const previous = item[alias];
      if (typeof previous === 'string' && previous.trim() && !strings.includes(previous))
        strings.push(previous);
    }
    return strings;
  }
  if (value === null && field.type !== 'registered-image') return field.default;
  if (field.type === 'select' && field.numericOptions && typeof value === 'number')
    return field.options?.[value]?.value ?? value;
  return value;
}
export function normalizeObject(
  item: Record<string, unknown>,
  fields: SettingDefinition[],
): Record<string, unknown> {
  const result = { ...item };
  for (const field of fields) {
    const value = objectFieldValue(item, field);
    if (value !== undefined) setObjectField(result, field, value);
    for (const alias of field.aliases ?? []) delete result[alias];
  }
  return result;
}
export function setObjectField(
  item: Record<string, unknown>,
  field: SettingDefinition,
  value: unknown,
) {
  const keys = field.propertyPath ?? [field.key];
  let target = item;
  for (const key of keys.slice(0, -1)) {
    target[key] = { ...((target[key] as Record<string, unknown>) ?? {}) };
    target = target[key] as Record<string, unknown>;
  }
  target[keys[keys.length - 1]] = value;
}

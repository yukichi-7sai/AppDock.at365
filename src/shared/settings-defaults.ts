/** JSON objects use defaults recursively; arrays are complete, ordered values. */
export const settingsObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function sameSetting(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, index) => sameSetting(item, b[index]));
  if (settingsObject(a) && settingsObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameSetting(a[key], b[key]))
    );
  }
  return false;
}

export function omitSettingDefaults(value: any, defaults: any): any {
  if (sameSetting(value, defaults)) return undefined;
  if (!settingsObject(value) || !settingsObject(defaults)) return structuredClone(value);
  const result: Record<string, unknown> = {};
  for (const [key, part] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error('設定キーが不正です。');
    const next = Object.hasOwn(defaults, key)
      ? omitSettingDefaults(part, defaults[key])
      : structuredClone(part);
    if (next !== undefined) result[key] = next;
  }
  return Object.keys(result).length ? result : undefined;
}

export function fillSettingDefaults(value: any, defaults: any): any {
  if (value === undefined) return structuredClone(defaults);
  if (!settingsObject(value) || !settingsObject(defaults)) return structuredClone(value);
  const result = structuredClone(defaults);
  for (const [key, part] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error('設定キーが不正です。');
    result[key] = fillSettingDefaults(part, defaults[key]);
  }
  return result;
}

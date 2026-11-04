export interface AccentTone {
  accent: string;
  soft: string;
  autoContrast?: boolean;
}
export interface AccentPreset {
  id: string;
  label: string;
  hidden?: boolean;
  light: AccentTone;
  dark: AccentTone;
}
export interface AccentColorCatalog {
  schemaVersion: 1;
  defaultId: string;
  customLabel: string;
  presets: AccentPreset[];
}
export function isAccentHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
}
/** Accept missing IDs too, so removing a preset never invalidates saved settings. */
export function isAccentColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]*$/.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value)
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const colors = (value: unknown): value is AccentTone =>
  record(value) &&
  isAccentHex(value.accent) &&
  isAccentHex(value.soft) &&
  (value.autoContrast === undefined || typeof value.autoContrast === 'boolean');
const copyTone = (value: AccentTone): AccentTone => ({
  accent: value.accent,
  soft: value.soft,
  ...(value.autoContrast === undefined ? {} : { autoContrast: value.autoContrast }),
});

/** Reject the whole file on invalid data; never partially reorder or repair an editable file. */
export function normalizeAccentColors(
  value: unknown,
  defaults: AccentColorCatalog,
): AccentColorCatalog {
  const fallback = () => structuredClone(defaults);
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !isAccentColor(value.defaultId) ||
    !label(value.customLabel) ||
    !Array.isArray(value.presets) ||
    !value.presets.length
  )
    return fallback();
  const ids = new Set<string>();
  const presets: AccentPreset[] = [];
  for (const item of value.presets) {
    if (
      !record(item) ||
      !isAccentColor(item.id) ||
      item.id === 'custom' ||
      ids.has(item.id) ||
      !label(item.label) ||
      (item.hidden !== undefined && typeof item.hidden !== 'boolean') ||
      !colors(item.light) ||
      !colors(item.dark)
    )
      return fallback();
    ids.add(item.id);
    presets.push({
      id: item.id,
      label: item.label,
      ...(item.hidden === true ? { hidden: true } : {}),
      light: copyTone(item.light),
      dark: copyTone(item.dark),
    });
  }
  if (!presets.some((preset) => preset.id === value.defaultId && !preset.hidden)) return fallback();
  return { schemaVersion: 1, defaultId: value.defaultId, customLabel: value.customLabel, presets };
}

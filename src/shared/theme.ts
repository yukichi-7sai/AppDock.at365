/** Fixed theme colors. Derived colors and accent presets are kept outside this file format. */
export const themeColorNames = [
  'background',
  'rail',
  'sidebar',
  'panel',
  'raised',
  'border',
  'text',
  'muted',
  'faint',
  'info',
  'decoration',
  'error',
  'warning',
  'success',
  'placeholder',
  'scrollbar',
  'shadow',
  'scrim',
] as const;
export type ThemeColors = Record<(typeof themeColorNames)[number], string>;
export interface ThemeDefinition {
  schemaVersion: 1;
  light: ThemeColors;
  dark: ThemeColors;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
/** Unknown keys never become CSS; invalid/missing colors fall back independently. */
export function normalizeTheme(value: unknown, defaults: ThemeDefinition): ThemeDefinition {
  const source = record(value);
  const result: ThemeDefinition = {
    schemaVersion: 1,
    light: { ...defaults.light },
    dark: { ...defaults.dark },
  };
  if (source.schemaVersion !== 1) return result;
  for (const mode of ['light', 'dark'] as const) {
    const colors = record(source[mode]);
    for (const name of themeColorNames) {
      const color = colors[name];
      const pattern =
        name === 'shadow' || name === 'scrim' ? /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i : /^#[a-f\d]{6}$/i;
      if (typeof color === 'string' && pattern.test(color))
        result[mode][name] = color.toLowerCase();
    }
  }
  return result;
}

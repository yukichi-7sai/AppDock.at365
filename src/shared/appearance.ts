import { defaultTheme } from '#theme-defaults';
import { accentColorCatalog } from '#accent-colors';
import { defaultAccentColors } from '#accent-color-defaults';
import type { AccentColorCatalog } from './accent-color';
export { isAccentColor, isAccentHex } from './accent-color';
import type { ThemeColors } from './theme';

/** Canonical accent palettes for every trusted local presentation surface. */
export const allAccentPalettes = accentColorCatalog.presets.map((preset) => ({
  id: preset.id,
  title: preset.label,
  hidden: preset.hidden === true,
  light: [preset.light.accent, preset.light.soft] as const,
  dark: [preset.dark.accent, preset.dark.soft] as const,
  autoContrast: {
    light: preset.light.autoContrast === true,
    dark: preset.dark.autoContrast === true,
  },
}));
export const accentPalettes = allAccentPalettes.filter((preset) => !preset.hidden);
export const accentChoices = [
  ...accentPalettes.map(({ id, title }) => ({ id, title })),
  { id: 'custom', title: accentColorCatalog.customLabel },
];
export type AccentColor = string;
export const defaultAccentColor: AccentColor = accentColorCatalog.defaultId;
const paletteById = new Map(allAccentPalettes.map((preset) => [preset.id, preset]));
export const defaultAccentPalette = paletteById.get(defaultAccentColor)!;
/** Placeholder text remains distinct from entered values on every registered local UI. */
export const placeholderCss = `
:root :is(input, textarea)::placeholder {
  color: var(--appdock-placeholder);
  opacity: 1;
}
`;
/** Shared scrollbars for registered local UI surfaces; neutral colors match the host settings. */
export const scrollbarCss = `
:root {
  --appdock-scrollbar-track: transparent;
}
* {
  scrollbar-width: auto;
  scrollbar-color: auto;
}
*::-webkit-scrollbar {
  width: 12px;
  height: 12px;
  background: var(--appdock-scrollbar-track);
}
*::-webkit-scrollbar-track,
*::-webkit-scrollbar-track-piece,
*::-webkit-scrollbar-corner {
  background: var(--appdock-scrollbar-track);
}
*::-webkit-scrollbar-thumb {
  background: var(--appdock-scrollbar-thumb);
  border: 3px solid var(--appdock-scrollbar-track);
  border-radius: 8px;
  background-clip: padding-box;
}
*::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
`;
export interface CustomAccentColors {
  dark: string;
  light: string;
}
// Keep omitted saved custom colors stable even when the external catalog is reordered or replaced.
const builtInDefault = defaultAccentColors.presets.find(
  (preset) => preset.id === defaultAccentColors.defaultId,
)!;
export const defaultCustomAccent: Readonly<CustomAccentColors> = {
  dark: builtInDefault.light.accent,
  light: builtInDefault.light.soft,
};
export interface AppearanceSnapshot {
  language?: string;
  overlayBackground?: 'blur' | 'transparent' | 'translucent';
  overlayShadow?: boolean;
  notificationBannerShadow?: boolean;
  notificationDesktopShadow?: boolean;
  revision: number;
  palette: AccentColor;
  dark: boolean;
  theme: ThemeColors & { onError: string };
  colors: { accent: string; soft: string; text: string; hover: string };
}
export interface AppearanceApi {
  accentColors(): Promise<AccentColorCatalog>;
  translations(): Promise<Record<string, Record<string, string>>>;
  snapshot(): Promise<AppearanceSnapshot>;
  onChanged(callback: (appearance: AppearanceSnapshot) => void): () => void;
}
declare global {
  interface Window {
    appdockAppearance: AppearanceApi;
  }
}
export function resolveAppearance(
  palette: AccentColor,
  dark: boolean,
  revision = 0,
  custom: CustomAccentColors = defaultCustomAccent,
  theme: ThemeColors = defaultTheme[dark ? 'dark' : 'light'],
): AppearanceSnapshot {
  const resolvedTheme = { ...theme, onError: readableText(theme.error) };
  if (palette === 'custom') {
    // Keep the saved pair intact. Resolve readable tones only for presentation.
    return {
      revision,
      palette,
      dark,
      theme: resolvedTheme,
      colors: correctAccentColors(
        custom[dark ? 'light' : 'dark'],
        custom[dark ? 'dark' : 'light'],
        dark,
        theme,
      ),
    };
  }
  const definition = paletteById.get(palette) ?? defaultAccentPalette;
  const mode = dark ? 'dark' : 'light';
  const [accent, soft] = definition[mode];
  if (definition.autoContrast[mode])
    return {
      revision,
      palette: definition.id,
      dark,
      theme: resolvedTheme,
      colors: correctAccentColors(accent, soft, dark, theme),
    };
  const text = readableText(accent);
  const hover =
    '#' +
    [1, 3, 5]
      .map((offset) => {
        const value = parseInt(accent.slice(offset, offset + 2), 16);
        const target = dark ? 255 : 0;
        return Math.round(value * 0.88 + target * 0.12)
          .toString(16)
          .padStart(2, '0');
      })
      .join('');
  return {
    revision,
    palette: definition.id,
    dark,
    theme: resolvedTheme,
    colors: { accent, soft, text, hover },
  };
}

/** Shared by custom colors and opted-in preset tones; source colors are never changed. */
function correctAccentColors(
  sourceAccent: string,
  sourceSoft: string,
  dark: boolean,
  theme: ThemeColors,
): AppearanceSnapshot['colors'] {
  const soft = toward(sourceSoft, dark ? '#000000' : '#ffffff', (color) =>
    dark ? luminance(color) <= 0.025 : luminance(color) >= 0.8,
  );
  const accent = toward(
    sourceAccent,
    dark ? '#ffffff' : '#000000',
    (color) =>
      contrast(color, soft) >= 4.5 &&
      [theme.background, theme.panel, theme.raised].every((base) => contrast(color, base) >= 4.5),
  );
  const text = readableText(accent);
  const target = text === '#000000' ? '#ffffff' : '#000000';
  const hover = toward(mix(accent, target, 0.12), target, (color) => contrast(color, text) >= 4.5);
  return { accent, soft, text, hover };
}

function readableText(background: string): string {
  return contrast(background, '#000000') >= contrast(background, '#ffffff') ? '#000000' : '#ffffff';
}

function mix(color: string, target: string, amount: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) +
            parseInt(target.slice(offset, offset + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function luminance(hex: string): number {
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function toward(color: string, target: string, readable: (color: string) => boolean): string {
  for (let step = 0; step <= 100; step++) {
    const next = mix(color, target, step / 100);
    if (readable(next)) return next;
  }
  return target;
}

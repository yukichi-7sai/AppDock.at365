/** Canonical accent palettes for every trusted local presentation surface. */
export const accentPalettes = [
  { id: 'mint', title: 'ミント', light: ['#217a65', '#e1f3ec'], dark: ['#7ce1c5', '#243b37'] },
  {
    id: 'alice-blue',
    title: 'アリス',
    light: ['#245f9e', '#f0f8ff'],
    dark: ['#acd5ff', '#20364d'],
  },
  {
    id: 'lavender',
    title: 'ラベンダー',
    light: ['#6d48a6', '#f3edff'],
    dark: ['#c8adf4', '#352c46'],
  },
  { id: 'rose', title: 'マジカル', light: ['#a53666', '#ffedf4'], dark: ['#f2a6c6', '#452b38'] },
  { id: 'amber', title: 'クッキー', light: ['#865600', '#fff5dc'], dark: ['#f2c66a', '#40351f'] },
] as const;
/** Retained for saved settings; no longer offered as a new palette. */
export const legacyAccentPalette = {
  id: 'sky-blue',
  title: 'スカイブルー',
  light: ['#036a91', '#e5f6ff'],
  dark: ['#75d6f5', '#173b48'],
} as const;
export const accentChoices = [
  ...accentPalettes.map(({ id, title }) => ({ id, title })),
  { id: 'custom', title: 'カスタム' },
] as const;
export type AccentColor = (typeof accentPalettes)[number]['id'] | 'sky-blue' | 'custom';
export const defaultAccentColor: AccentColor = 'mint';
/** Shared scrollbars for registered local UI surfaces; neutral colors match the host settings. */
export const scrollbarCss = `
:root {
  --appdock-scrollbar-thumb: #8e93a6;
  --appdock-scrollbar-track: transparent;
}
:root[data-theme='light'] {
  --appdock-scrollbar-thumb: #71798a;
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
export const defaultCustomAccent: Readonly<CustomAccentColors> = {
  dark: accentPalettes[0].light[0],
  light: accentPalettes[0].light[1],
};
export function isAccentHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
}
export function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === 'custom' ||
    value === legacyAccentPalette.id ||
    accentPalettes.some((palette) => palette.id === value)
  );
}
export interface AppearanceSnapshot {
  revision: number;
  palette: AccentColor;
  dark: boolean;
  colors: { accent: string; soft: string; text: string; hover: string };
}
export interface AppearanceApi {
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
): AppearanceSnapshot {
  if (palette === 'custom') {
    // Keep the saved pair intact. Resolve readable tones only for presentation.
    const base = dark ? '#20242f' : '#f0f2f6';
    const soft = toward(custom[dark ? 'dark' : 'light'], dark ? '#101116' : '#ffffff', (color) =>
      dark ? luminance(color) <= 0.025 : luminance(color) >= 0.8,
    );
    const accent = toward(
      custom[dark ? 'light' : 'dark'],
      dark ? '#ffffff' : '#000000',
      (color) => contrast(color, soft) >= 4.5 && contrast(color, base) >= 4.5,
    );
    const text = contrast(accent, '#000000') >= contrast(accent, '#ffffff') ? '#000000' : '#ffffff';
    const hover = toward(
      mix(accent, text === '#000000' ? '#ffffff' : '#000000', 0.12),
      text === '#000000' ? '#ffffff' : '#000000',
      (color) => contrast(color, text) >= 4.5,
    );
    return { revision, palette, dark, colors: { accent, soft, text, hover } };
  }
  const definition =
    palette === legacyAccentPalette.id
      ? legacyAccentPalette
      : (accentPalettes.find((item) => item.id === palette) ?? accentPalettes[0]);
  const [accent, soft] = definition[dark ? 'dark' : 'light'];
  const text = dark ? '#101116' : '#ffffff';
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
  return { revision, palette: definition.id, dark, colors: { accent, soft, text, hover } };
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

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
    id: 'sky-blue',
    title: 'スカイブルー',
    light: ['#036a91', '#e5f6ff'],
    dark: ['#75d6f5', '#173b48'],
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
export type AccentColor = (typeof accentPalettes)[number]['id'];
export const defaultAccentColor: AccentColor = 'mint';
export function isAccentColor(value: unknown): value is AccentColor {
  return accentPalettes.some((palette) => palette.id === value);
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
): AppearanceSnapshot {
  const definition = accentPalettes.find((item) => item.id === palette) ?? accentPalettes[0];
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

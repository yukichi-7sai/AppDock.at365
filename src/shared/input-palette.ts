export const inputPaletteRowHeight = 50;

export function inputPaletteBounds(
  anchor: { x: number; y: number },
  area: { x: number; y: number; width: number; height: number },
  rowCount: number,
) {
  const chromeHeight = 78; // Header, footer, list margins and window border.
  const width = Math.min(370, area.width);
  const bottom = area.y + area.height;
  const below = bottom - anchor.y - 4;
  const above = anchor.y - 16 - area.y;
  const rowsThatFit = Math.floor((Math.max(above, below) - chromeHeight) / inputPaletteRowHeight);
  const rows = Math.max(1, Math.min(8, rowCount, rowsThatFit));
  const height = Math.min(area.height, chromeHeight + rows * inputPaletteRowHeight);
  const y = below >= above ? anchor.y + 4 : anchor.y - 16 - height;
  return {
    x: Math.max(area.x, Math.min(anchor.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, bottom - height)),
    width,
    height,
  };
}

export interface InputPaletteModel {
  session: string;
  selected: number;
  rows: { name: string; preview: string; thumbnail?: string }[];
  title: string;
  keys: string;
  empty: string;
}
export interface InputPaletteApi {
  ready(session: string): void;
  models(callback: (model: InputPaletteModel | null) => void): void;
  choose(session: string, index: number): void;
  selected(callback: (session: string, index: number) => void): void;
}

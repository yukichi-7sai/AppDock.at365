export const inputPaletteRowHeight = 50;
export const defaultInputPaletteRows = 8;
export const defaultInputPaletteWidth = 370;
export const minimumInputPaletteWidth = 260;
export type InputPaletteKind = 'snippets' | 'history';
export type InputPaletteSize = { width: number; height: number };
export type InputPaletteRectangle = InputPaletteSize & { x: number; y: number };
export const inputPaletteChromeHeight = (guide: boolean) => (guide ? 96 : 69);

export function inputPaletteResizedBounds(
  start: InputPaletteRectangle,
  area: InputPaletteRectangle,
  size: InputPaletteSize,
  guide: boolean,
): InputPaletteRectangle {
  // Keep the title, management button, one row and resize grip reachable.
  const minWidth = Math.min(minimumInputPaletteWidth, area.width);
  const minHeight = Math.min(inputPaletteChromeHeight(guide) + inputPaletteRowHeight, area.height);
  const x = Math.max(area.x, Math.min(start.x, area.x + area.width - minWidth));
  const y = Math.max(area.y, Math.min(start.y, area.y + area.height - minHeight));
  return {
    x,
    y,
    width: Math.round(Math.max(minWidth, Math.min(size.width, area.x + area.width - x))),
    height: Math.round(Math.max(minHeight, Math.min(size.height, area.y + area.height - y))),
  };
}

export function inputPaletteSelection(
  key: string,
  selected: number,
  count: number,
  pageSize: number,
) {
  const last = Math.max(0, count - 1);
  const next =
    key === 'home'
      ? 0
      : key === 'end'
        ? last
        : selected +
          (key === 'up'
            ? -1
            : key === 'down'
              ? 1
              : key === 'page-up'
                ? -pageSize
                : key === 'page-down'
                  ? pageSize
                  : 0);
  return Math.max(0, Math.min(last, next));
}

export function inputPaletteBounds(
  anchor: { x: number; y: number },
  area: { x: number; y: number; width: number; height: number },
  rowCount: number,
  displayRows = defaultInputPaletteRows,
  guide = true,
  size?: InputPaletteSize,
  displayWidth = defaultInputPaletteWidth,
) {
  const chromeHeight = inputPaletteChromeHeight(guide);
  const width = Math.min(
    Math.max(minimumInputPaletteWidth, size?.width ?? displayWidth),
    area.width,
  );
  const bottom = area.y + area.height;
  const below = bottom - anchor.y - 4;
  const above = anchor.y - 16 - area.y;
  const rowsThatFit = Math.floor((Math.max(above, below) - chromeHeight) / inputPaletteRowHeight);
  const rows = Math.max(1, Math.min(displayRows, rowCount, rowsThatFit));
  const height = Math.min(
    area.height,
    size
      ? Math.max(chromeHeight + inputPaletteRowHeight, size.height)
      : chromeHeight + rows * inputPaletteRowHeight,
  );
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
  view: number;
  kind: InputPaletteKind;
  selected: number;
  scrollTop: number;
  restoreScroll: boolean;
  rows: { name: string; preview: string; thumbnail?: string; title?: string }[];
  title: string;
  keys: string;
  keyHelp: string;
  manage: string;
  guide: boolean;
  resize: string;
  empty: string;
}
export interface InputPaletteApi {
  resize(
    session: string,
    view: number,
    phase: 'start' | 'move' | 'end',
    x: number,
    y: number,
  ): void;
  ready(session: string, view: number): void;
  models(callback: (model: InputPaletteModel | null) => void): void;
  choose(session: string, view: number, index: number): void;
  manage(session: string, view: number): void;
  scroll(session: string, view: number, top: number): void;
  captureView(callback: (session: string, view: number) => void): void;
  viewState(session: string, view: number, top: number): void;
  selected(callback: (session: string, view: number, index: number) => void): void;
}

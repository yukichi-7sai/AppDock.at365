export interface InputPaletteModel {
  session: string;
  selected: number;
  rows: { name: string; preview: string; thumbnail?: string }[];
  title: string;
  mode: string;
  keys: string;
  empty: string;
}
export interface InputPaletteApi {
  ready(session: string): void;
  models(callback: (model: InputPaletteModel | null) => void): void;
  choose(session: string, index: number): void;
  selected(callback: (session: string, index: number) => void): void;
}

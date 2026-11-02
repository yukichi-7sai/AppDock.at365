/** Public, framework-neutral gallery presentation. No file-system or host operations. */
export const gallerySize = { min: 120, max: 360, step: 20, initial: 260 } as const;
export const libraryGallerySize = { min: 40, max: 360, step: 4, initial: 260 } as const;
export type GallerySize = { min: number; max: number; step: number; initial: number };
export function validGalleryWidth(
  value: unknown,
  range: GallerySize = gallerySize,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max &&
    (value - range.min) % range.step === 0
  );
}
export type GalleryImageState = 'ready' | 'loading' | 'missing' | 'error';
export interface GalleryItem {
  id: string;
  assetId: string;
  title: string;
  description?: string;
  /** Optional plain text preview; never interpreted as HTML or an image URL. */
  textPreview?: string;
  detail: string;
  labels: string[];
  state: GalleryImageState;
  selected?: boolean;
  selectable?: boolean;
  actions: { id: string; title: string; disabled?: boolean }[];
}
export interface GalleryModel {
  items: GalleryItem[];
  cardWidth: number;
  fit: 'contain' | 'cover';
  selection: 'none' | 'single' | 'multiple';
  empty: string;
}
export interface GalleryAnchor {
  id: string;
  offset: number;
}

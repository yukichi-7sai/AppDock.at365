/** Public, framework-neutral gallery presentation. No file-system or host operations. */
export const gallerySize = { min: 180, max: 360, step: 20, initial: 260 } as const;
export function validGalleryWidth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= gallerySize.min &&
    value <= gallerySize.max &&
    (value - gallerySize.min) % gallerySize.step === 0
  );
}
export type GalleryImageState = 'ready' | 'loading' | 'missing' | 'error';
export interface GalleryItem {
  id: string;
  assetId: string;
  title: string;
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

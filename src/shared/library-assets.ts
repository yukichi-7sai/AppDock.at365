import { assetFilename } from './asset-names';

export type LibraryMedia = 'image' | 'sound';
export interface LibraryRef {
  file: string;
}
export interface LibraryEntry {
  ref: LibraryRef;
  bytes: number;
  available: boolean;
  state?: 'ready' | 'missing' | 'error';
  generation?: string;
  /** Optional media measurements are populated on first use. Zero means unavailable. */
  width: number;
  height: number;
  thumbnail: string;
  durationMs?: number;
}
export const libraryKey = (ref: LibraryRef) => ref.file.toLowerCase();
export const libraryBasename = (file: string) => file.split('/').at(-1)!;
export const libraryParent = (file: string) =>
  file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
export const assignedAsset = (file: string) => file.startsWith('@assigned/');
export function libraryFolder(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '' ||
      value.split('/').every((part) => assetFilename(part) && part.toLowerCase() !== '@assigned'))
  );
}
export function libraryPath(value: unknown, media: LibraryMedia): value is string {
  if (typeof value !== 'string') return false;
  const extensions = media === 'image' ? '(png|jpe?g|webp|svg)' : 'wav';
  return assignedAsset(value)
    ? new RegExp('^@assigned/[a-f0-9]{64}\\.' + extensions + '$').test(value)
    : value !== '' && libraryFolder(value) && new RegExp('\\.' + extensions + '$', 'i').test(value);
}
export function libraryReference(value: unknown, media: LibraryMedia): value is LibraryRef {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    libraryPath((value as LibraryRef).file, media)
  );
}
export function soundLibraryReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('@library/') &&
    /^@assigned\/[a-f0-9]{64}\.wav$/.test(value.slice('@library/'.length))
  );
}

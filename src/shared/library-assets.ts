import { assetFilename } from './asset-names';
import { audioExtensionPattern } from './audio-formats';

export type LibraryMedia = 'image' | 'sound' | 'text';
// The colon keeps this identity outside the namespace of user-created group IDs.
export const snippetGroupId = 'builtin:snippets';
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
  textPreview?: string;
  characters?: number;
  lines?: number;
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
  const extensions =
    media === 'image' ? '(png|jpe?g|webp|svg)' : media === 'sound' ? audioExtensionPattern : 'txt';
  if (media === 'text' && assignedAsset(value)) return false;
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
    new RegExp('^@assigned/[a-f0-9]{64}\\.' + audioExtensionPattern + '$').test(
      value.slice('@library/'.length),
    )
  );
}

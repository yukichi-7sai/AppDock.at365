import { assetFilename } from './asset-names';

export const assignedImagePrefix = '@assigned/';
export function imageFolder(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '' ||
      value.split('/').every((part) => assetFilename(part) && part.toLowerCase() !== '@assigned'))
  );
}
export function imagePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.startsWith(assignedImagePrefix))
    return /^@assigned\/[a-f0-9]{64}\.(png|jpe?g|webp|svg)$/.test(value);
  return imageFolder(value) && value !== '' && /\.(png|jpe?g|webp|svg)$/i.test(value);
}
export const imageBasename = (file: string) => file.split('/').at(-1)!;
export const imageParent = (file: string) =>
  file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
export const assignedImage = (file: string) => file.startsWith(assignedImagePrefix);

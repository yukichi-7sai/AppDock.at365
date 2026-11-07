import { imageKey, type ImageGroup, type RegisteredImageRef } from './registered-images';
import { externalLibraryLocation } from './library-sources';

export function matchesLibraryFolder(file: string, folder: string) {
  const source = externalLibraryLocation(file),
    selected = externalLibraryLocation(folder);
  if (source?.id !== selected?.id) return false;
  const relative = source?.relative ?? file,
    target = selected?.relative ?? folder;
  return (
    target === '*' || (target === '' ? !relative.includes('/') : relative.startsWith(target + '/'))
  );
}

/** Shared browsing order and intersection of folder, group and filename filters. */
export function filterImageBrowser(
  images: RegisteredImageRef[],
  groups: ImageGroup[],
  filter: { folder: string; group: string; query: string },
  matchesBody?: (ref: RegisteredImageRef, query: string) => boolean,
): RegisteredImageRef[] {
  const available = new Map(images.map((ref) => [imageKey(ref), ref]));
  const group = groups.find((g) => `group:${g.id}` === filter.group);
  const members = new Set(groups.flatMap((g) => g.images.map(imageKey)));
  const ordered = group
    ? group.images
        .map((ref) => available.get(imageKey(ref)))
        .filter((ref): ref is RegisteredImageRef => !!ref)
    : images;
  const query = filter.query.toLocaleLowerCase();
  return ordered.filter(
    (ref) =>
      matchesLibraryFolder(ref.file, filter.folder) &&
      (filter.group !== 'unfiled' || !members.has(imageKey(ref))) &&
      ((externalLibraryLocation(ref.file)?.relative ?? ref.file)
        .toLocaleLowerCase()
        .includes(query) ||
        !!matchesBody?.(ref, query)),
  );
}

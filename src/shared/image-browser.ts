import { imageKey, type ImageGroup, type RegisteredImageRef } from './registered-images';

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
      (filter.folder === '*' ||
        (filter.folder === ''
          ? !ref.file.includes('/')
          : ref.file.startsWith(filter.folder + '/'))) &&
      (filter.group !== 'unfiled' || !members.has(imageKey(ref))) &&
      (ref.file.toLocaleLowerCase().includes(query) || !!matchesBody?.(ref, query)),
  );
}

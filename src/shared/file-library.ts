import { libraryText } from './library-text';
import { parseImageLibrary, type ImageLibrary } from './registered-images';
import type { LibraryRef } from './library-assets';
import type { LibraryMedia } from './library-assets';

export interface FileLibrary {
  groups: { id: string; name: string; files: LibraryRef[] }[];
}
/** The existing private gallery bridge uses images; persisted file classification uses files. */
export function fileGroupsForBrowser(value: unknown, media: LibraryMedia = 'sound'): ImageLibrary {
  if (value === undefined) return { groups: [] };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => k !== 'groups') ||
    !Array.isArray((value as FileLibrary).groups)
  )
    throw Error(libraryText(media, 'services.sharedRegisteredImages.invalidGroup'));
  return parseImageLibrary(
    {
      groups: (value as FileLibrary).groups.map((g) => {
        if (
          !g ||
          typeof g !== 'object' ||
          Object.keys(g).some((k) => !['id', 'name', 'files'].includes(k))
        )
          throw Error(libraryText(media, 'services.sharedRegisteredImages.invalidGroup'));
        return { id: g.id, name: g.name, images: g.files };
      }),
    },
    media,
  );
}
export function fileLibraryFromBrowser(
  value: ImageLibrary,
  media: LibraryMedia = 'sound',
): FileLibrary {
  return {
    groups: parseImageLibrary(value, media).groups.map(({ images, ...group }) => ({
      ...group,
      files: images,
    })),
  };
}

import { libraryText } from './library-text';
import { parseImageLibrary, type ImageLibrary } from './registered-images';
import type { LibraryRef } from './library-assets';

export interface SoundLibrary {
  groups: { id: string; name: string; files: LibraryRef[] }[];
}
/** The existing private gallery bridge uses images; persisted audio classification uses files. */
export function soundGroupsForBrowser(value: unknown): ImageLibrary {
  if (value === undefined) return { groups: [] };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => k !== 'groups') ||
    !Array.isArray((value as SoundLibrary).groups)
  )
    throw Error(libraryText('sound', 'services.sharedRegisteredImages.invalidGroup'));
  return parseImageLibrary(
    {
      groups: (value as SoundLibrary).groups.map((g) => {
        if (
          !g ||
          typeof g !== 'object' ||
          Object.keys(g).some((k) => !['id', 'name', 'files'].includes(k))
        )
          throw Error(libraryText('sound', 'services.sharedRegisteredImages.invalidGroup'));
        return { id: g.id, name: g.name, images: g.files };
      }),
    },
    'sound',
  );
}
export function soundLibraryFromBrowser(value: ImageLibrary): SoundLibrary {
  return {
    groups: parseImageLibrary(value, 'sound').groups.map(({ images, ...group }) => ({
      ...group,
      files: images,
    })),
  };
}
export const parseSoundLibrary = (value: unknown) =>
  soundLibraryFromBrowser(soundGroupsForBrowser(value));

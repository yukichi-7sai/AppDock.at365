import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryMedia } from '../../shared/library-assets';
import { libraryTextKey } from '../../shared/library-text';
import type { HostTranslator } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
const Media = createContext<LibraryMedia>('image');
export function LibraryMediaProvider({
  media,
  children,
}: {
  media: LibraryMedia;
  children: ReactNode;
}) {
  return <Media.Provider value={media}>{children}</Media.Provider>;
}
export const useLibraryMedia = () => useContext(Media);
export function useLibraryTranslation() {
  const media = useLibraryMedia(),
    translation = useHostTranslation();
  const t: HostTranslator = (key, values) => translation.t(libraryTextKey(media, key), values);
  return { ...translation, t };
}
export function soundDuration(value?: number) {
  if (value === undefined) return 'WAV';
  const seconds = Math.round(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · WAV`;
}

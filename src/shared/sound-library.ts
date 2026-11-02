import { fileGroupsForBrowser, fileLibraryFromBrowser, type FileLibrary } from './file-library';

export type SoundLibrary = FileLibrary;
export const parseSoundLibrary = (value: unknown): SoundLibrary =>
  fileLibraryFromBrowser(fileGroupsForBrowser(value, 'sound'), 'sound');

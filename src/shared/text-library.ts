import { fileGroupsForBrowser, fileLibraryFromBrowser, type FileLibrary } from './file-library';

/** Text originals remain ordinary UTF-8 files; settings contain classification only. */
export type TextLibrary = FileLibrary;
export const parseTextLibrary = (value: unknown): TextLibrary =>
  fileLibraryFromBrowser(fileGroupsForBrowser(value, 'text'), 'text');
export interface LibraryTextDocument {
  body: string;
  generation: string;
}

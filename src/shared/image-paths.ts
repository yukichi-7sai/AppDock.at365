import {
  libraryFolder,
  libraryPath,
  libraryBasename,
  libraryParent,
  assignedAsset,
} from './library-assets';
export const assignedImagePrefix = '@assigned/';
export const imageFolder = libraryFolder;
export const imagePath = (value: unknown): value is string => libraryPath(value, 'image');
export const imageBasename = libraryBasename;
export const imageParent = libraryParent;
export const assignedImage = assignedAsset;

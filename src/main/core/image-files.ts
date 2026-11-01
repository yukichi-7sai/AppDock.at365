import { assetFile, scanAssetTree } from './library-files';
export { safeDirectory } from './library-files';
export const imageFile = (root: string, name: string) => assetFile(root, name, 'image');
export const scanImageTree = (root: string) => scanAssetTree(root, 'image');

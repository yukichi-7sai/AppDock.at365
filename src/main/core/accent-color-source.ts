import path from 'node:path';
import { defaultAccentColors } from './accent-color-defaults';
import { readAccentColorFile } from './accent-color-files';

const root = path.resolve(__dirname, '../../../..');
const packaged = path.basename(root) === 'app.asar';
const profile = process.argv.find(
  (arg) => arg.startsWith('--test-profile=') || arg.startsWith('--smoke-dir='),
);
const distributedFile = packaged
  ? path.resolve(path.dirname(root), '../configs/accent-color.json')
  : path.join(root, 'resources/configs/accent-color.json');
// The test override is isolated from both the shared runtime and the real installation.
export const accentColorFile = profile
  ? path.resolve(profile.slice(profile.indexOf('=') + 1), 'configs/accent-color.json')
  : distributedFile;
const distributed = readAccentColorFile(distributedFile, defaultAccentColors);
export const accentColorCatalog = profile
  ? readAccentColorFile(accentColorFile, distributed)
  : distributed;

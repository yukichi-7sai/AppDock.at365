import path from 'node:path';
import fs from 'node:fs';
import { readTranslationFiles } from './translation-files';

const root = path.resolve(__dirname, '../../../..');
const packaged = path.basename(root) === 'app.asar';
const seed = packaged
  ? path.join(path.dirname(root), 'translations/host.json')
  : path.join(root, 'src/shared/locales/ja/host.json');
const profile = process.argv.find(
  (arg) => arg.startsWith('--test-profile=') || arg.startsWith('--smoke-dir='),
);
const workerDirectory = process.argv.find((arg) => arg.startsWith('--appdock-translations='));
export const translationDirectory = workerDirectory
  ? workerDirectory.slice('--appdock-translations='.length)
  : profile
    ? path.resolve(profile.slice(profile.indexOf('=') + 1), 'translations')
    : packaged
      ? path.resolve(path.dirname(root), '../translations')
      : path.dirname(seed);
export const hostResources = readTranslationFiles(
  translationDirectory,
  seed,
  !workerDirectory,
  packaged
    ? JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
    : undefined,
);
const initialLanguage =
  process.argv
    .find((arg) => arg.startsWith('--appdock-language='))
    ?.slice('--appdock-language='.length) ?? 'ja';
export let readHostLanguage = () => initialLanguage;
export function configureHostLanguage(read: () => string) {
  readHostLanguage = read;
}

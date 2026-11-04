import path from 'node:path';
import { defaultTheme } from './theme-defaults';
import { readThemeFile } from './theme-files';

const root = path.resolve(__dirname, '../../../..');
const packaged = path.basename(root) === 'app.asar';
const profile = process.argv.find(
  (arg) => arg.startsWith('--test-profile=') || arg.startsWith('--smoke-dir='),
);
const distributedFile = packaged
  ? path.resolve(path.dirname(root), '../configs/theme.json')
  : path.join(root, 'resources/configs/theme.json');
// Test-only edits live beside isolated settings, never in the shared test runtime or real install.
export const themeFile = profile
  ? path.resolve(profile.slice(profile.indexOf('=') + 1), 'configs/theme.json')
  : distributedFile;
const distributedTheme = readThemeFile(distributedFile, defaultTheme);
export const themeDefinition = profile ? readThemeFile(themeFile, distributedTheme) : distributedTheme;
export const themeColors = (dark: boolean) => themeDefinition[dark ? 'dark' : 'light'];

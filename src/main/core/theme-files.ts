import fs from 'node:fs';
import { normalizeTheme, type ThemeDefinition } from '../../shared/theme';

export function readThemeFile(file: string, defaults: ThemeDefinition): ThemeDefinition {
  try {
    return normalizeTheme(
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')),
      defaults,
    );
  } catch {
    // A missing, unreadable or malformed editable file must not prevent the UI from opening.
    return normalizeTheme(undefined, defaults);
  }
}

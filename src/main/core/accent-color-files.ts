import fs from 'node:fs';
import { normalizeAccentColors, type AccentColorCatalog } from '../../shared/accent-color';

export function readAccentColorFile(
  file: string,
  defaults: AccentColorCatalog,
): AccentColorCatalog {
  try {
    return normalizeAccentColors(
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')),
      defaults,
    );
  } catch {
    return normalizeAccentColors(undefined, defaults);
  }
}

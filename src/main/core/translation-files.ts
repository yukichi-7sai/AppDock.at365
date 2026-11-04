import fs from 'node:fs';
import path from 'node:path';

type Dictionary = Record<string, string>;
function readJson(file: string): Record<string, unknown> {
  const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid translation file');
  return value;
}

function placeholders(value: string) {
  return [...new Set(value.match(/{{[^{}]+}}/g))].sort().join('\n');
}
function translations(file: string, base: Dictionary): Dictionary {
  return Object.fromEntries(
    Object.entries(readJson(file)).filter(
      ([key, value]) =>
        Object.hasOwn(base, key) &&
        typeof value === 'string' &&
        value.trim() &&
        placeholders(value) === placeholders(base[key]),
    ),
  ) as Dictionary;
}

export function readTranslationFiles(directory: string, seed: string, seedEditable = true) {
  const base = readJson(seed) as Dictionary;
  const resources: Record<string, Dictionary> = { ja: base };
  try {
    const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) return resources;
  } catch {
    return resources;
  }
  const editable = path.join(directory, 'host.json');
  if (path.resolve(editable) !== path.resolve(seed)) {
    try {
      if (seedEditable) {
        fs.mkdirSync(directory, { recursive: true });
        if (!fs.existsSync(editable)) fs.copyFileSync(seed, editable, fs.constants.COPYFILE_EXCL);
      }
      if (fs.lstatSync(editable).isFile()) Object.assign(base, translations(editable, base));
    } catch {
      /* Read-only installs and invalid edits still have the distributed base. */
    }
  }
  let files: fs.Dirent[];
  try {
    files = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return resources;
  }
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const match = /^host_([a-z]{2,3}(?:-[a-z0-9]{2,8})*)\.json$/i.exec(file.name);
    if (!match || !file.isFile()) continue;
    try {
      const [code] = Intl.getCanonicalLocales(match[1]);
      if (Object.hasOwn(resources, code)) continue;
      resources[code] = translations(path.join(directory, file.name), base);
    } catch {
      /* A damaged optional pack must not prevent the other languages from loading. */
    }
  }
  return resources;
}

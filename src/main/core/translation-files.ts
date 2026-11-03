import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

function replaceFile(file: string, contents: Buffer | string) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Older updaters replace resources; refresh external packs before loading the new host. */
function refreshTranslations(directory: string, source: string, version: string) {
  const marker = path.join(directory, '.appdock-version');
  const files = fs
    .readdirSync(source, { withFileTypes: true })
    .filter(
      (file) => file.isFile() && /^host(?:_[a-z]{2,3}(?:-[a-z0-9]{2,8})*)?\.json$/i.test(file.name),
    );
  for (const file of [marker, ...files.map((file) => path.join(directory, file.name))]) {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (stat && !stat.isFile()) throw Error('Invalid translation destination');
  }
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === version) return;
  for (const file of files)
    replaceFile(path.join(directory, file.name), fs.readFileSync(path.join(source, file.name)));
  // Commit only after every distributed pack was replaced; a failed refresh retries next boot.
  replaceFile(marker, version);
}

export function readTranslationFiles(
  directory: string,
  seed: string,
  seedEditable = true,
  version?: string,
) {
  const base = readJson(seed) as Dictionary;
  const resources: Record<string, Dictionary> = { ja: base };
  try {
    const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) return resources;
  } catch {
    return resources;
  }
  if (version && path.resolve(directory) !== path.dirname(path.resolve(seed))) {
    try {
      if (seedEditable) {
        fs.mkdirSync(directory, { recursive: true });
        refreshTranslations(directory, path.dirname(seed), version);
      } else {
        const marker = path.join(directory, '.appdock-version');
        if (!fs.lstatSync(marker).isFile() || fs.readFileSync(marker, 'utf8') !== version)
          throw Error('Translation refresh is incomplete');
      }
    } catch {
      // A read-only install must still display the new distributed text, never stale overrides.
      directory = path.dirname(seed);
    }
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

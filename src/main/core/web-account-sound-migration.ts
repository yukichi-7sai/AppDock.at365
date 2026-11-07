import fs from 'node:fs/promises';
import path from 'node:path';
import { audioExtension } from '../../shared/audio-formats';
import { soundLibraryReference } from '../../shared/library-assets';
import type { WebAccountSound } from '../../shared/web-accounts';
import type { SoundLibraryAccess, SoundLibrarySelection } from './sound-library-service';
import { atomicWrite } from './settings';

export interface SoundMigrationUpdate {
  id: string;
  original: string;
  sound: WebAccountSound;
}

/** Import only: source files remain intact and assignments change after verified copies exist. */
export async function migrateWebAccountSounds(options: {
  owner: string;
  root: string;
  legacyDirectory: string;
  accounts: { id: string; sound?: WebAccountSound }[];
  library: SoundLibraryAccess;
  active(): boolean;
  apply(updates: SoundMigrationUpdate[]): boolean;
  failed(accountId?: string): void;
}) {
  const marker = path.join(options.root, 'sound-library-migration.json');
  let completed = false;
  try {
    const saved = JSON.parse(await fs.readFile(marker, 'utf8'));
    completed = saved.version === 1 && saved.completed === true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.failed();
  }
  const imported = new Map<string, Promise<SoundLibrarySelection>>();
  const importSound = (source: string) => {
    const key = path.resolve(source);
    let task = imported.get(key);
    if (!task) {
      task = (async () => {
        const stat = await fs.lstat(source);
        const actual = await fs.realpath(source);
        if (!stat.isFile() || stat.isSymbolicLink() || actual.toLowerCase() !== key.toLowerCase())
          throw Error('Invalid legacy sound file');
        return options.library.importLegacy(actual, options.owner);
      })();
      imported.set(key, task);
    }
    return task;
  };
  let success = true;
  if (!completed) {
    try {
      const stat = await fs.lstat(options.legacyDirectory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (await fs.realpath(options.legacyDirectory)).toLowerCase() !==
          path.resolve(options.legacyDirectory).toLowerCase()
      )
        throw Error('Invalid legacy sound directory');
      for (const entry of await fs.readdir(options.legacyDirectory, { withFileTypes: true })) {
        if (!audioExtension(entry.name)) continue;
        if (!options.active()) return;
        try {
          if (!entry.isFile() || entry.isSymbolicLink()) throw Error('Invalid legacy sound');
          await importSound(path.join(options.legacyDirectory, entry.name));
        } catch {
          success = false;
          options.failed();
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        success = false;
        options.failed();
      }
    }
  }
  const updates: SoundMigrationUpdate[] = [];
  for (const account of options.accounts) {
    const sound = account.sound;
    if (!sound?.file || Boolean(soundLibraryReference(sound.file))) continue;
    if (!options.active()) return;
    try {
      const source = path.isAbsolute(sound.file)
        ? sound.file
        : path.basename(sound.file) === sound.file && !sound.file.includes('/')
          ? path.join(options.legacyDirectory, sound.file)
          : undefined;
      if (!source) throw Error('Invalid legacy sound reference');
      updates.push({
        id: account.id,
        original: JSON.stringify(sound),
        sound: { enabled: sound.enabled, ...(await importSound(source)) },
      });
    } catch {
      success = false;
      options.failed(account.id);
    }
  }
  if (!options.active()) return;
  // A failed settings transaction keeps the old assignment and leaves migration retryable.
  const applied = options.apply(updates);
  if (success && applied && !completed && options.active())
    atomicWrite(marker, JSON.stringify({ version: 1, completed: true }));
}

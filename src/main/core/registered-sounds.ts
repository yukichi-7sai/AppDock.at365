import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { readSound } from './sounds';
import { audioExtension } from '../../shared/audio-formats';
import { RegisteredSoundLibrary } from './registered-sound-library';
import type { FileWatchAssistance } from './file-watch-assistance';

export function soundFilename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 180 &&
    !/[\\/:*?"<>|\x00-\x1f\x7f]/.test(value) &&
    !/[. ]$/.test(value) &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value) &&
    !!audioExtension(value)
  );
}

export class RegisteredSounds {
  constructor(readonly directory: string) {}
  private async safe() {
    await fs.mkdir(this.directory, { recursive: true });
    const actual = await fs.realpath(this.directory);
    if (
      actual.toLowerCase() !== path.resolve(this.directory).toLowerCase() ||
      (await fs.lstat(this.directory)).isSymbolicLink()
    )
      throw Error(hostText('services.registeredSounds.redirectedDirectory'));
  }
  async list(): Promise<string[]> {
    await this.safe();
    return this.files();
  }
  private async files(): Promise<string[]> {
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && soundFilename(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }
  /** Filename reconciliation only; wave validation stays with selection and playback. */
  watch(accept: (files: string[]) => void, failed: () => void, assistance?: FileWatchAssistance) {
    let closed = false,
      pending = false,
      watchFailed = false;
    let checking: Promise<void> | undefined;
    let watcher: FSWatcher | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      if (closed) return;
      try {
        failed();
      } catch {
        /* Reporting must not create an unhandled watcher error. */
      }
    };
    const watchError = () => {
      if (!watchFailed) {
        watchFailed = true;
        report();
      }
    };
    const request = () => {
      if (closed) return;
      if (checking) {
        pending = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        void check().catch(report);
      }, 100);
    };
    const connect = () => {
      if (watcher || closed) return;
      try {
        const next = watch(this.directory, (_, filename) => {
          if (closed || watcher !== next) return;
          if (!filename || soundFilename(filename.toString())) request();
        });
        next.on('error', () => {
          if (closed || watcher !== next) return;
          next.close();
          watcher = undefined;
          watchError();
        });
        watcher = next;
        watchFailed = false;
      } catch {
        watchError();
      }
    };
    const check = (afterCurrent = false): Promise<void> => {
      if (closed) return Promise.resolve();
      if (checking) return afterCurrent ? checking.then(() => check(true)) : checking;
      clearTimeout(timer);
      checking = (async () => {
        await this.safe();
        if (closed) return;
        connect();
        const files = await this.files();
        if (!closed) accept(files);
      })().finally(() => {
        checking = undefined;
        if (pending && !closed) {
          pending = false;
          void check().catch(report);
        }
      });
      return checking;
    };
    const unregister = assistance?.register(
      'registered-sounds:' + path.resolve(this.directory).toLowerCase(),
      () => check(),
    );
    return {
      check,
      close() {
        if (closed) return;
        closed = true;
        pending = false;
        clearTimeout(timer);
        unregister?.();
        watcher?.close();
        watcher = undefined;
      },
    };
  }
  async resolve(name: unknown) {
    if (!soundFilename(name)) throw Error(hostText('services.registeredSounds.invalidFilename'));
    const canonical = (await this.list()).find((n) => n.toLowerCase() === name.toLowerCase());
    if (!canonical) throw Error(hostText('services.registeredSounds.missing'));
    const file = path.join(this.directory, canonical);
    if ((await fs.lstat(file)).isSymbolicLink())
      throw Error(hostText('services.registeredSounds.link'));
    await readSound(file);
    return file;
  }
  async add(source: string, filename = path.basename(source)) {
    if (!soundFilename(filename)) throw Error(hostText('services.registeredSounds.invalidName'));
    const library = new RegisteredSoundLibrary(this.directory);
    try {
      return (await library.addFile(source, filename)).ref.file;
    } finally {
      library.stop();
    }
  }
}

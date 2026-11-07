import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import {
  parseExternalLibrarySources,
  type ExternalLibrarySource,
  type LibrarySourceAccess,
} from '../../shared/library-sources';
import { safeDirectoryAsync } from './library-files';
import type { DeviceSettingsStore } from './device-settings-store';
import type { RegisteredAssets } from './registered-assets';

/** Registration is device-local; metadata and settings copies stay in AppDock. */
export class ExternalLibrarySources {
  constructor(
    private store: Pick<DeviceSettingsStore, 'readLibrarySources' | 'saveLibrarySources'>,
    private libraries: RegisteredAssets[],
    private writable: () => void,
  ) {}
  configure() {
    const sources = this.store.readLibrarySources();
    for (const library of this.libraries) library.configureSources(sources);
  }
  async add(name: string, input: string, access: LibrarySourceAccess = 'read-only') {
    this.writable();
    if (
      typeof input !== 'string' ||
      typeof name !== 'string' ||
      !path.isAbsolute(input.trim()) ||
      (process.platform === 'win32' &&
        !/^(?:[a-z]:[\\/]|\\\\[^\\/? .]+\\[^\\/? .]+)/i.test(input.trim()))
    )
      throw Error(hostText('library.sources.invalid'));
    const directory = path.resolve(input.trim());
    const previous = this.store.readLibrarySources();
    const contains = (a: string, b: string) => {
      const relative = path.relative(a.toLowerCase(), b.toLowerCase());
      return (
        !relative ||
        (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      );
    };
    if (
      [
        ...this.libraries.map((l) => path.dirname(l.directory)),
        ...previous.map((s) => s.path),
      ].some((existing) => contains(existing, directory) || contains(directory, existing))
    )
      throw Error(hostText('library.sources.overlap'));
    const source: ExternalLibrarySource = {
      id: randomUUID(),
      name: name.trim() || path.basename(directory) || directory,
      path: directory,
      access,
    };
    const next = parseExternalLibrarySources([...previous, source]);
    await safeDirectoryAsync(directory, '');
    this.writable();
    this.store.saveLibrarySources(next, previous);
    this.configure();
  }
  update(source: ExternalLibrarySource, access: LibrarySourceAccess) {
    this.writable();
    const previous = this.store.readLibrarySources();
    if (
      !previous.some(
        (s) =>
          s.id === source.id &&
          s.path === source.path &&
          s.name === source.name &&
          s.access === source.access,
      )
    )
      throw Error(hostText('library.sources.changed'));
    const next = parseExternalLibrarySources(
      previous.map((s) => (s.id === source.id ? { ...s, access } : s)),
    );
    // Revocation remains possible while a network source is disconnected.
    this.store.saveLibrarySources(next, previous);
    this.configure();
  }
  remove(source: ExternalLibrarySource) {
    this.writable();
    const previous = this.store.readLibrarySources();
    if (
      !previous.some(
        (s) =>
          s.id === source.id &&
          s.name === source.name &&
          s.path === source.path &&
          s.access === source.access,
      )
    )
      throw Error(hostText('library.sources.changed'));
    this.store.saveLibrarySources(
      previous.filter((s) => s.id !== source.id),
      previous,
    );
    this.configure();
  }
}

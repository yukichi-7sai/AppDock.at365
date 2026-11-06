import path from 'node:path';
import { soundLibraryReference } from '../../shared/library-assets';
import { hostText } from '../../shared/i18n';
import { AssetLibraryHost } from './asset-library-host';
import { RegisteredSoundLibrary } from './registered-sound-library';
import { LibrarySoundPreview, SoundGallery } from './library-sound-preview';
import type { FileWatchAssistance } from './file-watch-assistance';

export interface SoundLibrarySelection {
  file: string;
  name: string;
}
export interface SoundLibraryAccess {
  pick(current?: string, alive?: () => boolean): Promise<SoundLibrarySelection | null>;
  pickFile(alive?: () => boolean): Promise<string | null>;
  resolve(file: string): Promise<string>;
}

/** Shared library files and immutable copies used by sound settings. */
export class SoundLibraryService implements SoundLibraryAccess {
  readonly files: RegisteredSoundLibrary;
  readonly host: AssetLibraryHost;
  readonly preview: LibrarySoundPreview;
  readonly gallery: SoundGallery;
  constructor(
    directory: string,
    options: ConstructorParameters<typeof AssetLibraryHost>[1],
    changed: () => void,
    failed: () => void,
    assistance?: FileWatchAssistance,
  ) {
    this.files = new RegisteredSoundLibrary(
      directory,
      () => {
        changed();
        queueMicrotask(() => {
          try {
            this.host.reconcileGroups();
          } catch {
            /* Retry when settings become writable. */
          }
        });
      },
      assistance,
    );
    this.host = new AssetLibraryHost(this.files, options);
    this.preview = new LibrarySoundPreview(this.files, changed, failed);
    this.gallery = new SoundGallery(this.files);
  }
  async snapshot() {
    const value = await this.host.snapshot();
    return {
      ...value,
      error: value.error || this.preview.error,
      playback: this.preview.snapshot(),
    };
  }
  async pick(current = '', alive = () => true): Promise<SoundLibrarySelection | null> {
    try {
      const result = await this.host.pick(
        soundLibraryReference(current) ? { file: current.slice('@library/'.length) } : null,
        alive,
      );
      if (result.cancelled || !result.image || !alive()) return null;
      const retained = await this.host.retain(result.image);
      if (!alive()) return null;
      const supplied = result.name;
      const name =
        typeof supplied === 'string' &&
        supplied.length > 0 &&
        supplied.length <= 200 &&
        !/[\u0000-\u001f\u007f]/.test(supplied)
          ? supplied
          : path.basename(result.image.file).slice(0, 200);
      return { file: '@library/' + retained.file, name };
    } finally {
      this.preview.stop('picker');
    }
  }
  async pickFile(alive = () => true) {
    const selected = await this.pick('', alive);
    if (!selected || !alive()) return null;
    const file = await this.resolve(selected.file);
    return alive() ? file : null;
  }
  async resolve(file: string) {
    if (!soundLibraryReference(file)) throw Error(hostText('sounds.invalidWave'));
    const ref = { file: file.slice('@library/'.length) };
    await this.files.readFile(ref);
    return this.files.file(ref.file);
  }
  close() {
    this.preview.stop();
    this.host.cancel();
    this.files.stop();
  }
}

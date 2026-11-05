import type { LibraryRef } from '../../shared/library-assets';
import type { LibraryPlayback } from '../../shared/registered-images';
import { libraryText } from '../../shared/library-text';
import type { RegisteredSoundLibrary } from './registered-sound-library';
import { LibraryReadCancelled } from './registered-assets';
import { audioPlayback } from './audio-service';
import { decodeRegisteredImage } from './registered-image-decoder';

/** Only manual previews are replaced; notification/TTS jobs retain their queue positions. */
export class LibrarySoundPreview {
  private active?: { owner: string; controller: AbortController; status: LibraryPlayback };
  error = '';
  private errorOwner?: string;
  constructor(
    private files: RegisteredSoundLibrary,
    private changed: () => void,
    private failed: () => void,
    private playAudio = audioPlayback.play.bind(audioPlayback),
  ) {}
  snapshot(owner?: string) {
    return this.active && (!owner || owner === this.active.owner)
      ? { ...this.active.status }
      : undefined;
  }
  errorFor(owner: string) {
    return owner === this.errorOwner ? this.error : '';
  }
  async play(ref: LibraryRef, owner: string) {
    this.stop();
    this.error = '';
    this.errorOwner = owner;
    const current = {
      owner,
      controller: new AbortController(),
      status: { file: ref.file, state: 'loading' as LibraryPlayback['state'] },
    };
    this.active = current;
    this.changed();
    const live = () => this.active === current && !current.controller.signal.aborted;
    try {
      const saved = await this.files.read(ref, undefined, { active: live, cachePreview: false });
      if (!live()) return;
      current.status.state = 'waiting';
      this.changed();
      const duration = this.files.entry(ref)?.durationMs ?? 30000;
      void this.playAudio({
        bytes: saved.bytes,
        signal: current.controller.signal,
        playbackTimeoutMs: Math.min(2147483647, Math.max(30000, Math.ceil(duration) + 5000)),
        beforePlay: () => {
          if (live()) {
            current.status.state = 'playing';
            this.changed();
          }
        },
      })
        .catch(() => {
          if (live()) {
            this.error = libraryText('sound', 'sounds.playFailed');
            this.failed();
          }
        })
        .finally(() => {
          if (this.active === current) {
            this.active = undefined;
            this.changed();
          }
        });
    } catch (error) {
      if (!live()) return;
      this.active = undefined;
      this.error = libraryText('sound', 'sounds.playFailed');
      this.changed();
      throw error;
    }
  }
  stop(owner?: string) {
    if (this.active && (!owner || owner === this.active.owner)) {
      this.active.controller.abort();
      this.active = undefined;
      this.changed();
    }
  }
}
const soundIcon = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="#7384ab" stroke-width="5" stroke-linecap="round"><path d="M24 40v16m12-30v44m12-52v60m12-44v28m12-36v44"/></g></svg>',
);
let soundThumbnail: Promise<string> | undefined;
const thumbnail = () =>
  (soundThumbnail ??= decodeRegisteredImage(soundIcon, 512)
    .then((image) => image.thumbnail)
    .catch((error) => {
      soundThumbnail = undefined;
      throw error;
    }));
export class SoundGallery {
  constructor(private files: RegisteredSoundLibrary) {}
  session() {
    let live = true;
    const get = async (ref: LibraryRef, generation?: string) => {
      if (!live) throw new LibraryReadCancelled('Closed sound view');
      await this.files.read(ref, generation, { active: () => live, cachePreview: false });
      const source = await thumbnail();
      if (!live) throw new LibraryReadCancelled('Closed sound view');
      return source;
    };
    return {
      get,
      preview: (ref: LibraryRef) => get(ref),
      dispose: () => {
        live = false;
      },
    };
  }
}

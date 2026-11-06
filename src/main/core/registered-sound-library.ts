import { libraryPath } from '../../shared/library-assets';
import { RegisteredAssets } from './registered-assets';
import { libraryText } from '../../shared/library-text';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { inspectSoundFile } from './sound-file';

export { waveDuration } from './wave-metadata';
import { waveDuration } from './wave-metadata';
export class RegisteredSoundLibrary extends RegisteredAssets {
  constructor(
    directory: string,
    changed: () => void = () => {},
    assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {
    super(
      directory,
      {
        media: 'sound',
        assignedDirectory: 'assigned-sounds',
        maxBytes: Number.MAX_SAFE_INTEGER,
        validateFile: async (file, name) => {
          if (!libraryPath(name, 'sound')) throw Error(libraryText('sound', 'sounds.invalidWave'));
          return {
            width: 0,
            height: 0,
            thumbnail: '',
            circle: '',
            durationMs: (await inspectSoundFile(file, name)) || undefined,
          };
        },
        format: () => 'wav',
        validate: async (bytes, name) => {
          if (!libraryPath(name, 'sound')) throw Error(libraryText('sound', 'sounds.invalidWave'));
          if (
            name.startsWith('@assigned/') &&
            name.slice(10, -path.extname(name).length) !==
              createHash('sha256').update(bytes).digest('hex')
          )
            throw Error(libraryText('sound', 'sounds.invalidWave'));
          return {
            width: 0,
            height: 0,
            thumbnail: '',
            circle: '',
            durationMs: waveDuration(bytes),
          };
        },
      },
      changed,
      assistance,
    );
  }
}

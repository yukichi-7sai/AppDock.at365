import { libraryPath } from '../../shared/library-assets';
import { RegisteredAssets } from './registered-assets';
import { libraryText } from '../../shared/library-text';
import { createHash } from 'node:crypto';

export function waveDuration(bytes: Buffer): number {
  const invalid = () => Error(libraryText('sound', 'sounds.invalidWave'));
  if (
    bytes.length < 44 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE' ||
    bytes.readUInt32LE(4) + 8 > bytes.length
  )
    throw invalid();
  const end = bytes.readUInt32LE(4) + 8;
  let rate = 0,
    align = 0,
    data = 0,
    formatSeen = false;
  for (let offset = 12; offset < end;) {
    if (offset + 8 > end) throw invalid();
    const type = bytes.toString('ascii', offset, offset + 4),
      length = bytes.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + length > end) throw invalid();
    if (type === 'fmt ') {
      if (length < 16 || formatSeen) throw invalid();
      formatSeen = true;
      let format = bytes.readUInt16LE(start);
      const channels = bytes.readUInt16LE(start + 2),
        samples = bytes.readUInt32LE(start + 4);
      rate = bytes.readUInt32LE(start + 8);
      align = bytes.readUInt16LE(start + 12);
      const bits = bytes.readUInt16LE(start + 14);
      if (format === 65534) {
        if (
          length < 40 ||
          bytes.readUInt16LE(start + 16) < 22 ||
          bytes.readUInt16LE(start + 18) > bits ||
          !bytes
            .subarray(start + 28, start + 40)
            .equals(Buffer.from('00001000800000aa00389b71', 'hex'))
        )
          throw invalid();
        format = bytes.readUInt32LE(start + 24);
      }
      if (
        ![1, 3].includes(format) ||
        !(format === 1 ? [8, 16, 24, 32] : [32, 64]).includes(bits) ||
        !channels ||
        !samples ||
        !rate ||
        !align ||
        align !== channels * (bits / 8) ||
        rate !== samples * align
      )
        throw invalid();
    } else if (type === 'data') data += length;
    offset = start + length + (length % 2);
    if (offset > end && start + length !== end) throw invalid();
  }
  if (!formatSeen || !data || data % align) throw invalid();
  return (data / rate) * 1000;
}
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
        maxBytes: 16 * 1024 * 1024,
        format: () => 'wav',
        validate: async (bytes, name) => {
          if (!libraryPath(name, 'sound') || bytes.length > 16 * 1024 * 1024)
            throw Error(libraryText('sound', 'sounds.invalidWave'));
          if (
            name.startsWith('@assigned/') &&
            name.slice(10, -4) !== createHash('sha256').update(bytes).digest('hex')
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

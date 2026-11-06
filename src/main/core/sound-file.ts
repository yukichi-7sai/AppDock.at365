import fs from 'node:fs/promises';
import { audioExtension } from '../../shared/audio-formats';
import { hostText } from '../../shared/i18n';
import { waveDuration } from './wave-metadata';

export function soundHeader(bytes: Buffer, name: string) {
  const ext = audioExtension(name);
  const ascii = (start: number, end: number) => bytes.toString('ascii', start, end);
  const wave = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  const valid =
    ext === 'wav'
      ? wave
      : ext === 'mp3'
        ? ascii(0, 3) === 'ID3' ||
          (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)
        : ext === 'aac'
          ? bytes[0] === 255 && (bytes[1] & 0xf6) === 0xf0
          : ext === 'm4a'
            ? ascii(4, 8) === 'ftyp'
            : ext === 'flac'
              ? ascii(0, 4) === 'fLaC'
              : ['ogg', 'oga', 'opus'].includes(ext ?? '')
                ? ascii(0, 4) === 'OggS'
                : ext === 'webm'
                  ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
                  : false;
  if (!valid) throw Error(hostText('sounds.invalidWave'));
  return ext!;
}

/** RIFF chunks are scanned without reading the PCM payload into memory. */
export async function inspectSoundFile(file: string, name = file): Promise<number> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size) throw Error(hostText('sounds.invalidWave'));
    const read = async (offset: number, length: number) => {
      const bytes = Buffer.alloc(length);
      const result = await handle.read(bytes, 0, length, offset);
      if (result.bytesRead !== length) throw Error(hostText('sounds.invalidWave'));
      return bytes;
    };
    const header = await read(0, Math.min(12, stat.size));
    if (soundHeader(header, name) !== 'wav') {
      // Resolve Electron only for compressed formats; WAV validation also runs in Node tests.
      const { probeAudioFile } = await import('./audio-player.js');
      return await probeAudioFile(file, name);
    }
    const end = header.readUInt32LE(4) + 8;
    if (end > stat.size || end < 12) throw Error(hostText('sounds.invalidWave'));
    let fmt: Buffer | undefined,
      data = 0;
    for (let offset = 12; offset < end;) {
      if (offset + 8 > end) throw Error(hostText('sounds.invalidWave'));
      const chunk = await read(offset, 8),
        length = chunk.readUInt32LE(4),
        start = offset + 8;
      if (start + length > end) throw Error(hostText('sounds.invalidWave'));
      if (chunk.toString('ascii', 0, 4) === 'fmt ') {
        if (fmt || length < 16) throw Error(hostText('sounds.invalidWave'));
        fmt = await read(start, Math.min(length, 40));
      } else if (chunk.toString('ascii', 0, 4) === 'data') data += length;
      offset = start + length + (length % 2);
      if (offset > end && start + length !== end) throw Error(hostText('sounds.invalidWave'));
    }
    if (!fmt || !data) throw Error(hostText('sounds.invalidWave'));
    const align = fmt.readUInt16LE(12);
    if (!align || data % align) throw Error(hostText('sounds.invalidWave'));
    const fmtSize = fmt.length + (fmt.length % 2);
    const sample = Buffer.alloc(12 + 8 + fmtSize + 8 + align);
    sample.write('RIFF');
    sample.writeUInt32LE(sample.length - 8, 4);
    sample.write('WAVEfmt ', 8);
    sample.writeUInt32LE(fmt.length, 16);
    fmt.copy(sample, 20);
    sample.write('data', 20 + fmtSize);
    sample.writeUInt32LE(align, 24 + fmtSize);
    return (waveDuration(sample) * data) / align;
  } finally {
    await handle.close();
  }
}

import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import path from 'node:path';
import { audioPlayback } from './audio-service';
import { NotificationSounds } from './notification-sounds';
import { audioExtension } from '../../shared/audio-formats';
import { inspectSoundFile } from './sound-file';
import { fileHash } from './file-content';
export const notificationSounds = new NotificationSounds({
  read: readSound,
  play: (bytes, signal, beforePlay) =>
    audioPlayback.play({
      ...(Buffer.isBuffer(bytes) ? { bytes } : bytes),
      signal,
      beforePlay,
      playbackTimeoutMs: 30000,
    }),
});
export async function readSound(file: string) {
  if (!path.isAbsolute(file) || !audioExtension(file))
    throw Error(hostText('services.sounds.absoluteWavPath'));
  const hash = await fileHash(file);
  await inspectSoundFile(file);
  if ((await fileHash(file)) !== hash) throw Error(hostText('services.registeredImages.changed'));
  return { file, hash };
}
export async function readWave(file: string): Promise<Buffer> {
  if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.wav')
    throw new Error(hostText('services.sounds.absoluteWavPath'));
  const handle = await fs.open(file, 'r');
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Invalid audio file');
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('Invalid WAV');
  return bytes;
}
/** Short notifications only. Empty selection is silent; no system beep fallback. */
export function queueSound(
  file: string,
  alive: () => boolean,
  failed: () => void,
  signal?: AbortSignal,
): void {
  if (!file) return;
  if (!path.isAbsolute(file) || !audioExtension(file))
    throw new Error(hostText('services.sounds.absoluteWavPath'));
  notificationSounds.enqueue(file, alive, failed, signal);
}

import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import path from 'node:path';
import { audioPlayback } from './audio-service';
import { NotificationSounds } from './notification-sounds';
export const notificationSounds = new NotificationSounds({
  read: readWave,
  play: (bytes, signal, beforePlay) =>
    audioPlayback.play({ bytes, signal, beforePlay, playbackTimeoutMs: 30000 }),
});
export async function readWave(file: string): Promise<Buffer> {
  if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.wav')
    throw new Error(hostText('services.sounds.absoluteWavPath'));
  const handle = await fs.open(file, 'r');
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('WAV too large');
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
  if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.wav')
    throw new Error(hostText('services.sounds.absoluteWavPath'));
  notificationSounds.enqueue(file, alive, failed, signal);
}

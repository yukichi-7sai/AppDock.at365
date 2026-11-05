import { audioPlayback } from './audio-service';
export function playTtsWave(
  bytes: Buffer,
  duration: number,
  signal: AbortSignal,
  beforePlay?: () => void,
): Promise<void> {
  return audioPlayback.play({
    bytes,
    signal,
    beforePlay,
    playbackTimeoutMs: (duration + 30) * 1000,
  });
}

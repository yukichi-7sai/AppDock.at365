import { hostText } from '../../shared/i18n';
import { BrowserWindow } from 'electron';
import type { AudioPlaybackRequest } from './audio-playback';
export async function playAudioWave({
  bytes,
  signal,
  speed = 1,
  playbackTimeoutMs,
  beforePlay,
}: AudioPlaybackRequest & { signal: AbortSignal }): Promise<void> {
  if (signal.aborted) return;
  const player = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  let canceled!: () => void;
  let failed!: (error: Error) => void;
  const interrupted = new Promise<void>((resolve, reject) => {
    canceled = resolve;
    failed = reject;
  });
  const destroy = () => {
    if (!player.isDestroyed()) player.destroy();
  };
  const stop = () => {
    canceled();
    destroy();
  };
  const closed = () => {
    if (signal.aborted) canceled();
    else failed(new Error(hostText('services.audioPlayer.closed')));
  };
  player.once('closed', closed);
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(() => {
    failed(new Error(hostText('services.audioPlayer.timeout')));
    destroy();
  }, playbackTimeoutMs);
  try {
    await Promise.race([
      player.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src data:"><title>AppDock Audio</title>',
          ),
      ),
      interrupted,
    ]);
    if (signal.aborted) return;
    beforePlay?.();
    if (signal.aborted) return;
    await Promise.race([
      player.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const audio = new Audio(${JSON.stringify('data:audio/wav;base64,' + bytes.toString('base64'))});
      document.body.append(audio);
      audio.playbackRate = ${JSON.stringify(speed)}; audio.preservesPitch = true;
      audio.onended = () => resolve(true);
      audio.onerror = () => reject(new Error('Playback failed'));
      audio.play().catch(reject);
    })`),
      interrupted,
    ]);
  } catch {
    if (!signal.aborted) throw new Error(hostText('services.audioPlayer.playbackFailed'));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', stop);
    player.removeListener('closed', closed);
    destroy();
  }
}

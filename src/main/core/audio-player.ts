import { hostText } from '../../shared/i18n';
import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { audioMime } from '../../shared/audio-formats';
import { audioFileResponse, type AudioTransfer } from './audio-file-response';
import { handleHash } from './file-content';
import type { AudioPlaybackRequest } from './audio-playback';

const origin = 'https://appdock-audio.invalid/';
const grants = new Map<string, (request: Request) => Response>();
let ready = false;
const probeLifetime = new AbortController();
function audioSession() {
  const value = session.fromPartition('appdock-local-audio', { cache: false });
  if (!ready) {
    app.once('before-quit', () => probeLifetime.abort());
    value.protocol.handle(
      'https',
      (request) => grants.get(request.url)?.(request) ?? new Response(null, { status: 404 }),
    );
    value.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
    ready = true;
  }
  return value;
}

/** Metadata and playback share the same isolated, file-backed media path. Metadata never plays. */
async function useAudioFile(
  file: string,
  signal: AbortSignal,
  timeoutMs: number,
  preview: boolean,
  beforePlay?: () => void,
  expectedHash?: string,
  name = file,
): Promise<number> {
  if (signal.aborted) return 0;
  if (!path.isAbsolute(file)) throw Error('Absolute audio path required');
  const mime = audioMime(name);
  const handle = await fs.open(file, 'r');
  const streams = new Set<AudioTransfer>();
  const url = origin + randomUUID();
  let player: BrowserWindow | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => {};
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size) throw Error('Invalid audio file');
    if (expectedHash && (await handleHash(handle, () => !signal.aborted)) !== expectedHash)
      throw Error(hostText('services.registeredImages.changed'));
    if (signal.aborted) return 0;
    const isolated = audioSession();
    grants.set(url, (request) =>
      audioFileResponse(request, handle, stat.size, mime, streams, stat),
    );
    player = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        spellcheck: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    const window = player;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const interrupted = new Promise<never>((_resolve, reject) => {
      stop = () => reject(Error('Audio cancelled'));
      window.once('closed', () => reject(Error('Audio window closed')));
      timer = setTimeout(() => reject(Error('Audio timed out')), Math.min(2147483647, timeoutMs));
    });
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    await Promise.race([
      window.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${origin}"><title>${preview ? 'AppDock Audio Metadata' : 'AppDock Audio'}</title>`,
          ),
      ),
      interrupted,
    ]);
    const duration = await Promise.race([
      window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const audio=new Audio(); window.audio=audio; audio.preload='auto';
      audio.onerror=()=>reject(new Error('Unsupported audio'));
      audio.oncanplay=()=>audio.duration>0
        ? resolve(Number.isFinite(audio.duration)?audio.duration*1000:0) : reject(new Error('Invalid duration'));
      audio.src=${JSON.stringify(url)}; document.body.append(audio);
    })`) as Promise<number>,
      interrupted,
    ]);
    if (!preview) {
      if (signal.aborted) return 0;
      beforePlay?.();
      if (signal.aborted) return 0;
      await Promise.race([
        window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        audio.onended=()=>resolve(true); audio.onerror=()=>reject(new Error('Playback failed'));
        audio.play().catch(reject);
      })`),
        interrupted,
      ]);
    }
    return duration;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    grants.delete(url);
    if (player && !player.isDestroyed()) player.destroy();
    for (const stream of streams) stream.cancel();
    await Promise.allSettled([...streams].map((stream) => stream.pending));
    await handle.close();
  }
}

// Serialize silent decoder probes so a large import cannot spawn one renderer per file.
let probes: Promise<unknown> = Promise.resolve();
export function probeAudioFile(file: string, name = file): Promise<number> {
  const run = () => {
    if (probeLifetime.signal.aborted) throw Error('Audio metadata service closed');
    return useAudioFile(file, probeLifetime.signal, 30000, true, undefined, undefined, name);
  };
  const task = probes.then(run, run);
  probes = task.catch(() => {});
  return task;
}

export async function playAudioWave(
  request: AudioPlaybackRequest & { signal: AbortSignal },
): Promise<void> {
  let temporary: string | undefined;
  try {
    if (request.signal.aborted) return;
    let file = request.file;
    if (!file) {
      temporary = await fs.mkdtemp(path.join(app.getPath('temp'), 'appdock-audio-'));
      file = path.join(temporary, 'speech.wav');
      await fs.writeFile(file, request.bytes!);
    }
    await useAudioFile(
      file,
      request.signal,
      request.playbackTimeoutMs,
      false,
      request.beforePlay,
      request.hash,
    );
  } catch {
    if (!request.signal.aborted) throw Error(hostText('services.audioPlayer.playbackFailed'));
  } finally {
    if (temporary) {
      await fs.rm(path.join(temporary, 'speech.wav'), { force: true });
      await fs.rmdir(temporary);
    }
  }
}

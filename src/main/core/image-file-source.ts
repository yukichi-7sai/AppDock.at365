import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { handleHash } from './file-content';
import { audioFileResponse as fileResponse, type AudioTransfer } from './audio-file-response';

/** Revocable URLs for already-validated, open files. No path is supplied by a renderer. */
export class ImageFileSources {
  private grants = new Map<string, (request: Request) => Response>();
  constructor(private origin: string) {}
  response(request: Request) {
    const response = this.grants.get(request.url)?.(request) ?? new Response(null, { status: 404 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  async open(file: string, mime: string, hash?: string, active = () => true) {
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || (hash && (await handleHash(handle, active)) !== hash))
        throw Error('Image changed');
      if (!active()) throw Error('Image request closed');
      const url = this.origin + randomUUID(),
        streams = new Set<AudioTransfer>();
      this.grants.set(url, (request) =>
        fileResponse(request, handle, stat.size, mime, streams, stat),
      );
      let closing: Promise<void> | undefined;
      return {
        url,
        close: () =>
          (closing ??= (async () => {
            this.grants.delete(url);
            for (const stream of streams) stream.cancel();
            await Promise.allSettled([...streams].map((stream) => stream.pending));
            await handle.close();
          })()),
      };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
}
export const originalImageSources = new ImageFileSources('appdock://host/library-original/');

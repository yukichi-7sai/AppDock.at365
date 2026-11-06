import type { FileHandle } from 'node:fs/promises';
export interface AudioTransfer {
  cancel(): void;
  pending?: Promise<void>;
}

/** A single granted file; URLs and filesystem paths never come from the renderer. */
export function audioFileResponse(
  request: Request,
  handle: FileHandle,
  size: number,
  mime: string,
  streams: Set<AudioTransfer>,
  expected?: { size: number; mtimeMs: number; ctimeMs: number },
): Response {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const headers = new Headers({
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  let start = 0,
    end = size - 1,
    status = 200;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    } else start = -1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start > end ||
      start >= size
    ) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  headers.set('Content-Length', String(Math.max(0, end - start + 1)));
  if (request.method === 'HEAD' || !size) return new Response(null, { status, headers });
  let closed = false,
    offset = start;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const finish = () => {
    closed = true;
    request.signal.removeEventListener('abort', transfer.cancel);
  };
  const transfer: AudioTransfer = {
    cancel: () => {
      if (!closed) {
        finish();
        controller.error(Error('Audio read cancelled'));
      }
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    pull() {
      transfer.pending = (async () => {
        if (closed) return;
        try {
          const bytes = Buffer.allocUnsafe(Math.min(64 * 1024, end - offset + 1));
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
          if (expected) {
            const stat = await handle.stat();
            if (
              stat.size !== expected.size ||
              stat.mtimeMs !== expected.mtimeMs ||
              stat.ctimeMs !== expected.ctimeMs
            )
              throw Error('Audio file changed while reading');
          }
          if (closed) return;
          if (!bytesRead) throw Error('Audio file changed while reading');
          offset += bytesRead;
          controller.enqueue(bytes.subarray(0, bytesRead));
          if (offset > end) {
            finish();
            controller.close();
          }
        } catch (error) {
          if (!closed) {
            finish();
            controller.error(error);
          }
        }
      })();
      return transfer.pending;
    },
    cancel() {
      finish();
    },
  });
  streams.add(transfer);
  request.signal.addEventListener('abort', transfer.cancel, { once: true });
  if (request.signal.aborted) transfer.cancel();
  return new Response(body, { status, headers });
}

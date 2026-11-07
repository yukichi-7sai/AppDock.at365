import { httpFetch } from './http-client';

// Only declared HTTPS image origins can be fetched. Cookies stay scoped to
// the owning Chromium session; no redirects outside those origins are allowed.
export function webAvatarURL(raw: unknown, origins: string[]): string {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      origins.includes(url.origin)
      ? url.href
      : '';
  } catch {
    return '';
  }
}
export async function readWebAvatar(response: Response): Promise<Buffer> {
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (
    !response.ok ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime ?? '') ||
    Number(response.headers.get('content-length')) > 65536 ||
    !response.body
  ) {
    await response.body?.cancel();
    throw Error('Invalid account image');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 65536) throw Error('Account image is too large');
      chunks.push(result.value);
    }
    if (!size) throw Error('Empty account image');
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fetchWebAvatar(
  raw: unknown,
  origins: string[],
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<Buffer> {
  let url = webAvatarURL(raw, origins);
  for (let hop = 0; hop < 4; hop++) {
    if (!url) throw Error('Invalid account image origin');
    const response = await httpFetch('web-site-accounts', fetcher, url, {
      credentials: 'include',
      redirect: 'manual',
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('Invalid account image redirect');
      url = webAvatarURL(new URL(location, url).href, origins);
    } else return readWebAvatar(response);
  }
  throw Error('Too many account image redirects');
}

// Electron Session.fetch rejects manual redirects rather than exposing their
// headers. ClientRequest gives us the redirect event before any next request.
export function webAvatarResponse(
  signal: AbortSignal,
  create: () => Electron.ClientRequest,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = create();
    let settled = false;
    const finish = (response?: Response, error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', aborted);
      request.abort();
      if (response) resolve(response);
      else reject(error ?? Error('Account image request failed'));
    };
    const aborted = () => finish(undefined, Error('Account image request aborted'));
    request.on('error', () => finish());
    request.on('redirect', (status, _method, location) =>
      finish(new Response(null, { status, headers: { location } })),
    );
    request.on('response', (incoming) => {
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > 65536) {
          finish(undefined, Error('Account image is too large'));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on('error', () => finish());
      incoming.on('aborted', aborted);
      incoming.on('end', () => {
        if (settled) return;
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers))
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        try {
          finish(
            new Response(new Uint8Array(Buffer.concat(chunks, size)), {
              status: incoming.statusCode,
              headers,
            }),
          );
        } catch {
          finish();
        }
      });
    });
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else request.end();
  });
}

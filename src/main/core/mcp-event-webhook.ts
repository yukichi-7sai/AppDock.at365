import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createHmac } from 'node:crypto';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

export function publicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
export function webhookUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) throw Error('invalid_url');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error('invalid_url');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (!host.includes('.') && !isIP(host)) ||
    (isIP(host) && !publicWebhookAddress(host))
  )
    throw Error('invalid_url');
  return url.href;
}
export function webhookKey(secret: unknown): Buffer {
  if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret))
    throw Error('invalid_secret');
  const encoded = secret.slice(6),
    key = Buffer.from(encoded, 'base64');
  if (key.length < 24 || key.length > 64 || key.toString('base64') !== encoded)
    throw Error('invalid_secret');
  return key;
}
export function webhookSignature(secret: string, id: string, seconds: number, body: string) {
  return (
    'v1,' +
    createHmac('sha256', webhookKey(secret))
      .update(`${id}.${seconds}.${body}`, 'utf8')
      .digest('base64')
  );
}
export interface WebhookResponse {
  status: number;
  body: string;
}
export type WebhookPost = (
  url: string,
  body: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<WebhookResponse>;

/** Resolve at every connection, pin the checked address, retain the TLS hostname, never redirect. */
export const postWebhook: WebhookPost = async (value, body, headers, signal) => {
  const url = new URL(webhookUrl(value));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  signal.throwIfAborted();
  const addresses = await new Promise<
    Awaited<ReturnType<typeof lookup>> | { address: string; family: number }[]
  >((resolve, reject) => {
    const abort = () => reject(Error('timeout'));
    signal.addEventListener('abort', abort, { once: true });
    lookup(host, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  signal.throwIfAborted();
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((entry) => !publicWebhookAddress(entry.address))
  )
    throw Error('blocked_address');
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'POST',
        agent: false,
        signal,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        lookup: (_hostname, options, callback) => {
          // The pinned address is also supplied for Node's automatic family selection.
          if (typeof options === 'object' && options.all) (callback as Function)(null, [selected]);
          else (callback as Function)(null, selected.address, selected.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('aborted', () => reject(Error('aborted')));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
};

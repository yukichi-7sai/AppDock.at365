import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import type { WebAccountSnapshot } from '../../shared/web-accounts';
import { RPC_TIMEOUT_MS } from './rpc';

export type AccountRead = WebAccountSnapshot & {
  acknowledged: string[];
  monitoringResets: string[];
};
export interface AccountDelivery {
  value: AccountRead;
  confirm(): void;
}
export type WebReadQuery = { id?: string; offset?: number; received?: string };
type Page =
  | { id: string; waiting: true }
  | { id: string; value: AccountRead }
  | { id: string; bytes: string; next: number | null };
type Payload = ({ value: AccountRead } | { bytes: Buffer }) & { confirm(): void };
type Transfer = { id: string; ready: Promise<Payload>; progressAt: number; next: number };
type Collect = (live: () => boolean, progress: () => void) => Promise<AccountDelivery>;
// Bound each transfer step without limiting the complete snapshot.
const chunkBytes = 512 * 1024;
const expired = () => Error(hostText('services.webAccounts.readExpired'));
export const pendingRead = Symbol('pending Web account read');

export async function waitForRead<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof pendingRead>((resolve) => {
        timer = setTimeout(() => resolve(pendingRead), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One transfer belongs to one controller and its live worker. A lost page consumes no events. */
export class WebAccountReadChannel {
  private current?: Transfer;
  private delivered?: { id: string; confirm(): void };
  private idle?: ReturnType<typeof setTimeout>;
  private closed = false;

  private begin(collect: Collect) {
    const id = randomUUID();
    const live = () => this.current?.id === id;
    const transfer: Transfer = {
      id,
      next: 0,
      progressAt: performance.now(),
      ready: Promise.resolve().then(async () => {
        if (!live()) throw expired();
        const { value, confirm } = await collect(live, () => {
          transfer.progressAt = performance.now();
        });
        if (!live()) throw expired();
        const json = JSON.stringify(value);
        return Buffer.byteLength(json) <= chunkBytes
          ? { value, confirm }
          : { bytes: Buffer.from(json), confirm };
      }),
    };
    this.current = transfer;
    return transfer;
  }
  async page(query: WebReadQuery, collect: Collect): Promise<Page> {
    if (this.closed || !query || typeof query !== 'object' || Array.isArray(query)) throw expired();
    let transfer = this.current;
    if (query.id === undefined) {
      if (
        Object.keys(query).some((k) => k !== 'received') ||
        (query.received !== undefined && typeof query.received !== 'string')
      )
        throw expired();
      if (this.delivered && this.delivered.id === query.received) this.delivered.confirm();
      this.delivered = undefined;
      transfer = this.begin(collect);
    } else if (
      !transfer ||
      transfer.id !== query.id ||
      Object.keys(query).some((k) => k !== 'id' && k !== 'offset')
    ) {
      throw expired();
    }
    const offset = query.offset === undefined ? 0 : query.offset;
    if (offset !== transfer.next) throw expired();
    clearTimeout(this.idle);
    // Abandoned transfers, including a stuck initialization, must release their snapshot.
    this.idle = setTimeout(() => {
      if (this.current === transfer) this.current = undefined;
    }, 2 * RPC_TIMEOUT_MS);
    this.idle.unref();
    try {
      const payload = await waitForRead(transfer.ready, 2000);
      if (this.current !== transfer) throw expired();
      const id = transfer.id;
      if (payload === pendingRead) {
        if (performance.now() - transfer.progressAt >= RPC_TIMEOUT_MS) throw expired();
        return { id, waiting: true };
      }
      let reply: Page;
      if ('value' in payload) {
        if (offset) throw expired();
        reply = { id, value: payload.value };
      } else {
        if (offset >= payload.bytes.length) throw expired();
        const end = Math.min(offset + chunkBytes, payload.bytes.length);
        reply = {
          id,
          bytes: payload.bytes.toString('base64', offset, end),
          next: end < payload.bytes.length ? end : null,
        };
        if (reply.next !== null) {
          transfer.next = end;
          return reply;
        }
      }
      this.delivered = { id, confirm: payload.confirm };
      this.current = undefined;
      clearTimeout(this.idle);
      return reply;
    } catch (error) {
      if (this.current === transfer) {
        this.current = undefined;
        clearTimeout(this.idle);
      }
      throw error;
    }
  }
  close() {
    this.closed = true;
    this.current = undefined;
    this.delivered = undefined;
    clearTimeout(this.idle);
  }
}

/** A receipt is sent on the next read, only after the preceding result reached the worker. */
export function webAccountReader(request: (query: WebReadQuery) => Promise<Page>) {
  let received: string | undefined;
  let queue = Promise.resolve();
  async function read() {
    let page = await request(received ? { received } : {});
    const id = page.id;
    let offset = 0;
    const chunks: Buffer[] = [];
    while (true) {
      if (page.id !== id) throw expired();
      if ('value' in page) {
        received = id;
        return page.value;
      }
      if ('bytes' in page) {
        const chunk = Buffer.from(page.bytes, 'base64');
        chunks.push(chunk);
        offset += chunk.length;
        if (page.next === null) {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AccountRead;
          received = id;
          return value;
        }
        if (page.next !== offset) throw expired();
      }
      page = await request({ id, offset });
    }
  }
  return () => {
    const result = queue.then(read);
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };
}

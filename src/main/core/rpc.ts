import { hostText } from '../../shared/i18n';
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
const writeChunkBytes = 64 * 1024;
export const RPC_TIMEOUT_MS = 15000;
/** Legacy single-frame results may consume state only after their frame was written. */
export class RpcDelivery {
  constructor(
    readonly value: unknown,
    readonly written: () => void,
  ) {}
}
interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
class JsonLinePeer extends EventEmitter {
  input: Readable;
  output: Writable;
  handler: (method: string, params: any) => Promise<unknown>;
  pending: Map<string, Pending>;
  sequence: number;
  private fragments: string[] = [];
  private writes = Promise.resolve();
  timeout: number;
  closed: boolean;
  constructor(
    input: Readable,
    output: Writable,
    handler: (method: string, params: any) => Promise<unknown>,
    timeout = RPC_TIMEOUT_MS,
    private readonly transformInbound?: (message: any) => any,
  ) {
    super();
    this.input = input;
    this.output = output;
    this.handler = handler;
    this.pending = new Map();
    this.sequence = 0;
    this.timeout = timeout;
    this.closed = false;
    input.setEncoding('utf8');
    input.on('data', (chunk) => this.consume(chunk));
    input.on('end', () => this.close());
    input.on('error', () => this.close());
    output.on('error', () => this.close());
  }
  consume(chunk: string) {
    let start = 0;
    let newline: number;
    while ((newline = chunk.indexOf('\n', start)) !== -1) {
      this.fragments.push(chunk.slice(start, newline));
      const line = this.fragments.join('');
      this.fragments = [];
      start = newline + 1;
      if (line.trim()) this.dispatch(line);
    }
    if (start < chunk.length) this.fragments.push(chunk.slice(start));
  }
  async dispatch(line: string) {
    let msg: any;
    try {
      msg = JSON.parse(line);
      if (!msg || msg.jsonrpc !== '2.0') throw new Error(hostText('services.rpc.versionRequired'));
      if (this.transformInbound) msg = this.transformInbound(msg);
    } catch (e) {
      this.emit('protocolError', e);
      return;
    }
    if (typeof msg.method === 'string') {
      try {
        const result = await this.handler(msg.method, msg.params ?? {});
        if (msg.id !== undefined && !this.closed) {
          if (result instanceof RpcDelivery)
            this.send({ jsonrpc: '2.0', id: msg.id, result: result.value }, () => {
              if (!this.closed) result.written();
            });
          else this.send({ jsonrpc: '2.0', id: msg.id, result: result ?? null });
        }
      } catch (e) {
        if (msg.id !== undefined && !this.closed) {
          try {
            this.send({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32000, message: e instanceof Error ? e.message : String(e) },
            });
          } catch {
            this.close();
          }
        }
      }
    } else {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
    }
  }
  send(msg: unknown, written?: () => void) {
    if (this.closed || this.output.destroyed) throw new Error(hostText('services.rpc.closed'));
    const line = Buffer.from(JSON.stringify(msg) + '\n');
    this.writes = this.writes
      .then(async () => {
        for (let offset = 0; offset < line.length; offset += writeChunkBytes) {
          if (this.closed) return;
          await new Promise<void>((resolve, reject) => {
            this.output.write(line.subarray(offset, offset + writeChunkBytes), (error) =>
              error ? reject(error) : resolve(),
            );
          });
        }
        if (!this.closed) written?.();
      })
      .catch((error) => {
        if (!this.closed) this.fail(error instanceof Error ? error : new Error(String(error)));
      });
  }
  request(method: string, params: unknown = {}, timeout = this.timeout): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `host-${++this.sequence}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(hostText('services.rpc.timeout', { method: String(method) })));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  fail(e: Error) {
    this.emit('protocolError', e);
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.fragments = [];
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(hostText('services.rpc.disconnected')));
    }
    this.pending.clear();
    this.emit('closed');
  }
}
export { JsonLinePeer };

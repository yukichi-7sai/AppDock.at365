import { hostText } from '../../shared/i18n';
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
const MAX_LINE = 1024 * 1024;
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
  buffer: string;
  timeout: number;
  closed: boolean;
  constructor(
    input: Readable,
    output: Writable,
    handler: (method: string, params: any) => Promise<unknown>,
    timeout = 15000,
  ) {
    super();
    this.input = input;
    this.output = output;
    this.handler = handler;
    this.pending = new Map();
    this.sequence = 0;
    this.buffer = '';
    this.timeout = timeout;
    this.closed = false;
    input.setEncoding('utf8');
    input.on('data', (chunk) => this.consume(chunk));
    input.on('end', () => this.close());
    input.on('error', () => this.close());
    output.on('error', () => this.close());
  }
  consume(chunk: string) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_LINE) {
        this.fail(new Error(hostText('services.rpc.sizeLimit')));
        return;
      }
      if (line.trim()) this.dispatch(line);
    }
    if (Buffer.byteLength(this.buffer) > MAX_LINE)
      this.fail(new Error(hostText('services.rpc.sizeLimit')));
  }
  async dispatch(line: string) {
    let msg: any;
    try {
      msg = JSON.parse(line);
      if (!msg || msg.jsonrpc !== '2.0') throw new Error(hostText('services.rpc.versionRequired'));
    } catch (e) {
      this.emit('protocolError', e);
      return;
    }
    if (typeof msg.method === 'string') {
      try {
        const result = await this.handler(msg.method, msg.params ?? {});
        if (msg.id !== undefined && !this.closed)
          this.send({ jsonrpc: '2.0', id: msg.id, result: result ?? null });
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
  send(msg: unknown) {
    if (this.closed || this.output.destroyed) throw new Error(hostText('services.rpc.closed'));
    const line = JSON.stringify(msg) + '\n';
    if (Buffer.byteLength(line) > MAX_LINE) throw new Error(hostText('services.rpc.sizeLimit'));
    this.output.write(line);
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
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(hostText('services.rpc.disconnected')));
    }
    this.pending.clear();
    this.emit('closed');
  }
}
export { JsonLinePeer };

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { hostText } from '../../shared/i18n';
import type { MemoryStorage } from './memory-storage';

interface Source {
  key: string;
  pointer: string;
  version: number;
  file: string;
}
/** A local View may read only image paths published by its own Applet to memory Storage. */
export class PageSourceImages {
  private references = new Map<string, Source>();
  private identities = new Map<string, string>();
  private readers = new Set<Readable>();
  private busy = new Set<string>();
  private epoch = 0;
  constructor(
    private storage: MemoryStorage,
    private active: () => boolean,
    private effects: {
      open(file: string): Promise<void>;
      trash(file: string): Promise<void>;
      removed(file: string): Promise<void>;
    },
  ) {}
  private valid() {
    return this.active();
  }
  private unavailable(): never {
    throw Error(hostText('services.pageSources.unavailable'));
  }
  private async openFile(source: Source) {
    if (!this.valid()) this.unavailable();
    const extension = path.extname(source.file).toLowerCase();
    const actual = await fs.realpath(source.file);
    const handle = await fs.open(actual, 'r');
    try {
      const stat = await handle.stat();
      const header = Buffer.alloc(30);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const mime =
        extension === '.png' &&
        bytesRead >= 24 &&
        header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : ['.jpg', '.jpeg'].includes(extension) &&
              bytesRead >= 3 &&
              header[0] === 255 &&
              header[1] === 216 &&
              header[2] === 255
            ? 'image/jpeg'
            : extension === '.bmp' && bytesRead >= 26 && header.toString('ascii', 0, 2) === 'BM'
              ? 'image/bmp'
              : extension === '.webp' &&
                  bytesRead >= 30 &&
                  header.toString('ascii', 0, 4) === 'RIFF' &&
                  header.toString('ascii', 8, 12) === 'WEBP'
                ? 'image/webp'
                : undefined;
      if (!stat.isFile() || !mime || !this.valid()) this.unavailable();
      return { handle, size: stat.size, mime };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async register(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) this.unavailable();
    const value = input as Record<string, unknown>;
    if (
      Object.keys(value).some((key) => !['key', 'pointer', 'file'].includes(key)) ||
      typeof value.key !== 'string' ||
      typeof value.pointer !== 'string' ||
      typeof value.file !== 'string' ||
      !path.isAbsolute(value.file)
    )
      this.unavailable();
    const reference = this.storage.reference(value.key, value.pointer, value.file);
    if (!reference) this.unavailable();
    const source = { key: value.key, pointer: value.pointer, ...reference };
    const epoch = this.epoch;
    const opened = await this.openFile(source);
    await opened.handle.close();
    if (epoch !== this.epoch || !this.valid()) this.unavailable();
    const identity = `${source.key}:${source.version}:${source.pointer}`;
    const id = this.identities.get(identity) ?? randomBytes(24).toString('base64url');
    this.identities.set(identity, id);
    this.references.set(id, source);
    return { id, url: `appdock://source-images/${id}`, size: opened.size };
  }
  async operate(id: unknown, operation: 'open' | 'trash') {
    if (typeof id !== 'string' || this.busy.has(id)) this.unavailable();
    const source = this.references.get(id);
    if (!source) this.unavailable();
    const epoch = this.epoch;
    this.busy.add(id);
    try {
      const opened = await this.openFile(source);
      await opened.handle.close();
      if (epoch !== this.epoch || this.references.get(id) !== source || !this.valid())
        this.unavailable();
      await this.effects[operation](source.file);
      if (operation === 'trash') {
        for (const [reference, other] of this.references)
          if (other.file.toLowerCase() === source.file.toLowerCase()) this.release([reference]);
        // Deletion has completed. A failed publisher update must never invite retrying it.
        await this.effects.removed(source.file);
      }
      return { completed: true };
    } finally {
      this.busy.delete(id);
    }
  }
  async response(url: string): Promise<Response> {
    let handle: fs.FileHandle | undefined;
    try {
      const parsed = new URL(url);
      const id = parsed.pathname.slice(1),
        source = this.references.get(id);
      if (
        parsed.protocol !== 'appdock:' ||
        parsed.host !== 'source-images' ||
        parsed.search ||
        parsed.hash ||
        !source
      )
        return new Response(null, { status: 404 });
      const epoch = this.epoch;
      const opened = await this.openFile(source);
      handle = opened.handle;
      if (epoch !== this.epoch || this.references.get(id) !== source || !this.valid())
        this.unavailable();
      const reader = handle.createReadStream({ start: 0, autoClose: true });
      handle = undefined;
      this.readers.add(reader);
      reader.once('close', () => this.readers.delete(reader));
      return new Response(Readable.toWeb(reader) as ReadableStream<Uint8Array>, {
        headers: {
          'Content-Type': opened.mime,
          'Content-Length': String(opened.size),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    } finally {
      await handle?.close();
    }
  }
  clear() {
    this.epoch++;
    this.references.clear();
    this.identities.clear();
    for (const reader of this.readers) reader.destroy();
    this.readers.clear();
  }
  release(ids: unknown) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) this.unavailable();
    for (const id of ids) {
      const source = this.references.get(id);
      if (source) this.identities.delete(`${source.key}:${source.version}:${source.pointer}`);
      this.references.delete(id);
    }
  }
  get size() {
    return this.references.size;
  }
}

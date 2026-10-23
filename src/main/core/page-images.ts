import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { imageDirectory } from './panel-images';

export interface PageImageFile {
  key: string;
  file: string;
}
export interface PageImageReference {
  key: string;
  id: string;
  url: string;
}
interface ImageFile {
  file: string;
  mime: string;
  size: number;
  ino: number;
  dev: number;
}

function raster(header: Buffer): { mime: string; width: number; height: number } | undefined {
  if (
    header.length >= 24 &&
    header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    header.toString('ascii', 12, 16) === 'IHDR'
  )
    return { mime: 'image/png', width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  if (header.length >= 4 && header[0] === 0xff && header[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= header.length) {
      if (header[offset++] !== 0xff) return;
      while (header[offset] === 0xff) offset++;
      const marker = header[offset++];
      if (marker === 0xda || marker === 0xd9) return;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > header.length) return;
      const length = header.readUInt16BE(offset);
      if (length < 2 || offset + length > header.length) return;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      )
        return {
          mime: 'image/jpeg',
          width: header.readUInt16BE(offset + 5),
          height: header.readUInt16BE(offset + 3),
        };
      offset += length;
    }
  }
  if (
    header.length >= 30 &&
    header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const kind = header.toString('ascii', 12, 16);
    if (kind === 'VP8X')
      return {
        mime: 'image/webp',
        width: 1 + header.readUIntLE(24, 3),
        height: 1 + header.readUIntLE(27, 3),
      };
    if (kind === 'VP8 ' && header[23] === 0x9d && header[24] === 1 && header[25] === 0x2a)
      return {
        mime: 'image/webp',
        width: header.readUInt16LE(26) & 0x3fff,
        height: header.readUInt16LE(28) & 0x3fff,
      };
    if (kind === 'VP8L' && header[20] === 0x2f) {
      const bits = header.readUInt32LE(21);
      return {
        mime: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
  }
}

/** References belong to one live local View, never to the description panel. */
export class PageImageRegistry {
  private files = new Map<string, ImageFile>();
  private readers = new Set<Readable>();
  private root: string;
  constructor(
    dataRoot: string,
    readonly owner: string,
    private active: () => boolean,
    private ownerCount: () => number = () => this.size,
  ) {
    this.root = imageDirectory(dataRoot, owner);
  }
  get size() {
    return this.files.size;
  }
  private async openFile(file: string) {
    if (!path.isAbsolute(file)) throw Error(hostText('services.pageImages.absoluteCachePath'));
    const base = await fs.realpath(this.root),
      actual = await fs.realpath(file);
    const relative = path.relative(base, actual);
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !/\.(png|jpe?g|webp)$/i.test(actual)
    )
      throw Error(hostText('services.pageImages.imageFormat'));
    const handle = await fs.open(actual, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024)
        throw Error(hostText('services.pageImages.fileSize'));
      const header = Buffer.alloc(Math.min(stat.size, 256 * 1024));
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const format = raster(header.subarray(0, bytesRead));
      const extensionMime = /\.png$/i.test(actual)
        ? 'image/png'
        : /\.webp$/i.test(actual)
          ? 'image/webp'
          : 'image/jpeg';
      if (
        !format ||
        format.mime !== extensionMime ||
        format.width < 1 ||
        format.height < 1 ||
        format.width > 2048 ||
        format.height > 2048
      )
        throw Error(hostText('services.pageImages.dimensions'));
      return {
        handle,
        info: { file: actual, mime: format.mime, size: stat.size, ino: stat.ino, dev: stat.dev },
      };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async register(input: unknown): Promise<{ images: PageImageReference[] }> {
    if (!this.active()) throw Error(hostText('services.pageImages.providerStopped'));
    if (
      !Array.isArray(input) ||
      input.length > 64 ||
      Buffer.byteLength(JSON.stringify({ files: input })) > 256 * 1024
    )
      throw Error(hostText('services.pageImages.batchLimit'));
    const keys = new Set<string>();
    const pending: { key: string; info: ImageFile }[] = [];
    for (const item of input) {
      if (
        !item ||
        typeof item !== 'object' ||
        Object.keys(item).some((key) => !['key', 'file'].includes(key)) ||
        typeof item.key !== 'string' ||
        !/^[a-zA-Z0-9._-]{1,80}$/.test(item.key) ||
        keys.has(item.key) ||
        typeof item.file !== 'string'
      )
        throw Error(hostText('services.pageImages.invalidRegistration'));
      keys.add(item.key);
      const { handle, info } = await this.openFile(item.file);
      await handle.close();
      pending.push({ key: item.key, info });
    }
    if (!this.active()) throw Error(hostText('services.pageImages.providerStopped'));
    // Commit the entire batch after I/O; concurrent batches must share the same quota.
    if (this.size + pending.length > 2000 || this.ownerCount() + pending.length > 8000)
      throw Error(hostText('services.pageImages.registrationLimit'));
    return {
      images: pending.map(({ key, info }) => {
        const id = randomBytes(24).toString('base64url');
        this.files.set(id, info);
        return { key, id, url: `appdock://page-images/${id}` };
      }),
    };
  }
  release(input: unknown) {
    if (
      !Array.isArray(input) ||
      input.length > 64 ||
      input.some((id) => typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))
    )
      throw Error(hostText('services.pageImages.releaseLimit'));
    for (const id of input) this.files.delete(id);
  }
  clear() {
    this.files.clear();
    for (const reader of this.readers) reader.destroy();
    this.readers.clear();
  }
  async response(url: string): Promise<Response> {
    let handle: fs.FileHandle | undefined;
    try {
      const parsed = new URL(url);
      const id = parsed.pathname.slice(1),
        expected = this.files.get(id);
      if (
        !this.active() ||
        parsed.protocol !== 'appdock:' ||
        parsed.host !== 'page-images' ||
        parsed.search ||
        parsed.hash ||
        !expected
      )
        return new Response(null, { status: 404 });
      const opened = await this.openFile(expected.file);
      handle = opened.handle;
      if (
        !this.active() ||
        this.files.get(id) !== expected ||
        opened.info.ino !== expected.ino ||
        opened.info.dev !== expected.dev ||
        opened.info.size !== expected.size
      )
        throw Error('Image reference expired.');
      const reader = handle.createReadStream({ start: 0, autoClose: true });
      handle = undefined;
      this.readers.add(reader);
      reader.once('close', () => this.readers.delete(reader));
      return new Response(Readable.toWeb(reader) as ReadableStream<Uint8Array>, {
        headers: {
          'Content-Type': expected.mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    } finally {
      await handle?.close();
    }
  }
}

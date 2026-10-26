import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  imageFilename,
  imageKey,
  imageReference,
  type RegisteredImageRef,
  type RegisteredImageEntry,
} from '../../shared/registered-images';

export interface DecodedImage {
  width: number;
  height: number;
  thumbnail: string;
  circle: string;
}
export type ImageDecoder = (bytes: Buffer) => DecodedImage | Promise<DecodedImage>;
const maxBytes = 5 * 1024 * 1024;
export function imageFormat(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  throw Error(hostText('services.registeredImages.selectFormat'));
}
export class RegisteredImages {
  private entries = new Map<
    string,
    { entry: RegisteredImageEntry; signature: string; hash: string; circle: string }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private refreshing?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private watcher?: FSWatcher;
  private listeners = new Set<() => void>();
  error?: string;
  constructor(
    readonly directory: string,
    private decode: ImageDecoder,
    private changed: () => void = () => {},
  ) {}
  onChanged(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  private async root(create = false) {
    if (create) await fs.mkdir(this.directory, { recursive: true });
    const real = await fs.realpath(this.directory);
    if (
      real.toLowerCase() !== path.resolve(this.directory).toLowerCase() ||
      (await fs.lstat(this.directory)).isSymbolicLink()
    )
      throw Error(hostText('services.registeredImages.redirectedDirectory'));
  }
  private async validate(bytes: Buffer, name: string) {
    if (!imageFilename(name) || !bytes.length || bytes.length > maxBytes)
      throw Error(hostText('services.registeredImages.sizeFormat'));
    const format = imageFormat(bytes),
      ext = path.extname(name).slice(1).toLowerCase();
    if (!(format === 'jpeg' ? ['jpg', 'jpeg'].includes(ext) : format === ext))
      throw Error(hostText('services.registeredImages.extensionMismatch'));
    // Inspect chunk types, never arbitrary compressed bytes that happen to spell a marker.
    if (format === 'png' || format === 'webp') {
      for (let offset = format === 'png' ? 8 : 12; offset + 8 <= bytes.length;) {
        const length =
          format === 'png' ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
        const type = bytes.toString(
          'ascii',
          offset + (format === 'png' ? 4 : 0),
          offset + (format === 'png' ? 8 : 4),
        );
        if (type === 'acTL' || type === 'ANIM')
          throw Error(hostText('services.registeredImages.staticOnly'));
        const next = offset + (format === 'png' ? length + 12 : length + 8 + (length % 2));
        if (!Number.isSafeInteger(next) || next <= offset || next > bytes.length) break;
        offset = next;
      }
    }
    const image = await this.decode(bytes);
    if (
      !image.width ||
      !image.height ||
      image.width > 8192 ||
      image.height > 8192 ||
      image.width * image.height > 16 * 1024 * 1024
    )
      throw Error(hostText('services.registeredImages.decodeFailed'));
    return image;
  }
  async read(ref: unknown) {
    if (!imageReference(ref)) throw Error(hostText('services.registeredImages.invalidReference'));
    await this.root();
    const files = await fs.readdir(this.directory, { withFileTypes: true });
    const found = files.find((f) => f.name.toLowerCase() === imageKey(ref));
    if (!found?.isFile() || !imageFilename(found.name))
      throw Error(hostText('services.registeredImages.missing'));
    const bytes = await this.fileBytes(found.name);
    await this.validate(bytes, found.name);
    return { ref: { file: found.name }, bytes };
  }
  private async fileBytes(name: string) {
    if (!imageFilename(name)) throw Error(hostText('services.registeredImages.invalidFilename'));
    const file = path.join(this.directory, name);
    const stat = await fs.lstat(file);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size > maxBytes ||
      (await fs.realpath(file)).toLowerCase() !== file.toLowerCase()
    )
      throw Error(hostText('services.registeredImages.unsafeFile'));
    const bytes = await fs.readFile(file);
    if (bytes.length > maxBytes) throw Error(hostText('services.registeredImages.sizeLimit'));
    return bytes;
  }
  async add(bytes: Buffer, filename: string): Promise<RegisteredImageRef> {
    return (await this.addWithResult(bytes, filename)).ref;
  }
  /** Only the confirmed, unchanged original may be recycled; failed settings saves restore it. */
  remove(
    ref: RegisteredImageRef,
    generation: string,
    options: { trash(file: string): Promise<void>; prepare(): () => void },
  ): Promise<void> {
    const run = async () => {
      const original = await this.read(ref);
      if (!generation || createHash('sha256').update(original.bytes).digest('hex') !== generation)
        throw Error(hostText('services.registeredImages.changed'));
      const commit = options.prepare();
      const file = path.join(this.directory, original.ref.file);
      let recycled = false;
      try {
        await options.trash(file);
        recycled = true;
        commit();
      } catch (error) {
        try {
          await this.root();
          try {
            await fs.writeFile(file, original.bytes, { flag: 'wx' });
          } catch (restoreError) {
            if (
              (restoreError as NodeJS.ErrnoException).code !== 'EEXIST' ||
              !(await this.fileBytes(original.ref.file)).equals(original.bytes)
            )
              throw restoreError;
          }
        } catch {
          throw Error(hostText('services.registeredImages.restoreFailed'));
        }
        throw recycled ? error : Error(hostText('services.registeredImages.trashFailed'));
      } finally {
        if (this.refreshing) await this.refreshing;
        await this.refresh();
      }
      this.entries.delete(imageKey(original.ref));
      // A concurrent file-system writer may have restored this filename.
      await this.refresh();
      this.changed();
      for (const callback of this.listeners) callback();
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => {});
    return task;
  }
  async addWithResult(
    bytes: Buffer,
    filename: string,
  ): Promise<{ ref: RegisteredImageRef; reused: boolean }> {
    const run = async () => {
      await this.validate(bytes, filename);
      await this.root(true);
      const files = (await fs.readdir(this.directory)).filter(imageFilename);
      const existing = files.find((n) => n.toLowerCase() === filename.toLowerCase());
      const name = existing ?? filename,
        ref = { file: name };
      const duplicate = async () => {
        const saved = await this.read(ref);
        if (!saved.bytes.equals(bytes))
          throw Error(hostText('services.registeredImages.duplicateName', { name: String(name) }));
        return { ref: saved.ref, reused: true };
      };
      if (existing) return duplicate();
      if (files.length >= 512) throw Error(hostText('services.registeredImages.countLimit'));
      const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
      const handle = await fs.open(temp, 'wx');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        try {
          await fs.link(temp, path.join(this.directory, name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') return await duplicate();
          throw error;
        }
      } finally {
        await handle.close().catch(() => {});
        await fs.unlink(temp).catch(() => {});
      }
      // A scan already in progress may have enumerated the directory before this addition.
      if (this.refreshing) await this.refreshing;
      await this.refresh();
      return { ref, reused: false };
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => {});
    return task;
  }
  import(input: { filename?: string; base64: string }) {
    if (
      !input ||
      typeof input.base64 !== 'string' ||
      input.base64.length > 700000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)
    )
      throw Error(hostText('services.registeredImages.invalidData'));
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 512 * 1024)
      throw Error(hostText('services.registeredImages.programmaticSizeLimit'));
    const format = imageFormat(bytes);
    return this.add(
      bytes,
      input.filename ??
        `web-${createHash('sha256').update(bytes).digest('hex')}.${format === 'jpeg' ? 'jpg' : format}`,
    );
  }
  list() {
    return [...this.entries.values()]
      .map((v) => structuredClone(v.entry))
      .sort((a, b) => a.ref.file.localeCompare(b.ref.file, 'ja'));
  }
  /** Cached selection candidates only; never reads, decodes or returns image content. */
  availableReferences(): RegisteredImageRef[] {
    if (this.error) return [];
    return [...this.entries.values()]
      .filter(({ entry }) => entry.available)
      .map(({ entry }) => ({ file: entry.ref.file }))
      .sort((a, b) => a.file.localeCompare(b.file, 'ja'));
  }
  entry(ref: unknown) {
    if (!imageReference(ref)) return undefined;
    const value = this.entries.get(imageKey(ref));
    return value ? structuredClone(value.entry) : undefined;
  }
  icon(ref: unknown, shape = 'square') {
    if (!imageReference(ref)) return undefined;
    const entry = this.entries.get(imageKey(ref));
    return shape === 'circle' ? entry?.circle : entry?.entry.thumbnail;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.scan().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  private async scan() {
    const signature = () =>
      JSON.stringify([
        this.list(),
        [...this.entries.values()].map((value) => value.hash),
        this.error,
      ]);
    const previous = signature();
    try {
      await this.root();
      const names = (await fs.readdir(this.directory, { withFileTypes: true }))
        .filter((f) => f.isFile() && imageFilename(f.name))
        .slice(0, 512);
      const seen = new Set<string>();
      for (const f of names) {
        const key = f.name.toLowerCase();
        seen.add(key);
        try {
          const stat = await fs.lstat(path.join(this.directory, f.name));
          const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
          const old = this.entries.get(key);
          if (old?.signature === signature && old.entry.available) continue;
          const bytes = await this.fileBytes(f.name),
            ref = { file: f.name };
          const decoded = await this.validate(bytes, f.name);
          this.entries.set(key, {
            signature,
            hash: createHash('sha256').update(bytes).digest('hex'),
            circle: decoded.circle,
            entry: {
              ref,
              bytes: bytes.length,
              width: decoded.width,
              height: decoded.height,
              thumbnail: decoded.thumbnail,
              available: true,
              state: 'ready',
              generation: createHash('sha256').update(bytes).digest('hex'),
            },
          });
        } catch {
          const old = this.entries.get(key);
          if (old) {
            old.entry.available = false;
            old.entry.state = 'error';
          } else
            this.entries.set(key, {
              signature: '',
              hash: '',
              circle: '',
              entry: {
                ref: { file: f.name },
                width: 0,
                height: 0,
                bytes: 0,
                thumbnail: '',
                available: false,
                state: 'error',
              },
            });
        }
      }
      for (const [key, value] of this.entries)
        if (!seen.has(key)) {
          value.entry.available = false;
          value.entry.state = 'missing';
        }
      this.error = undefined;
      if (this.timer && !this.watcher) {
        try {
          this.watcher = watch(this.directory, () => void this.refresh());
          this.watcher.on('error', () => {
            this.watcher?.close();
            this.watcher = undefined;
          });
        } catch {
          /* Polling remains the recovery path when watch is unavailable. */
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.error = hostText('services.registeredImages.readFailed');
      for (const value of this.entries.values()) {
        value.entry.available = false;
        value.entry.state =
          (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error';
      }
    }
    if (previous !== signature()) {
      this.changed();
      for (const callback of this.listeners) callback();
    }
  }
  watch() {
    this.timer ??= setInterval(() => void this.refresh(), 2000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.watcher?.close();
    this.watcher = undefined;
  }
}

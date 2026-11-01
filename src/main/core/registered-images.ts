import { hostText } from '../../shared/i18n';
import { svgSource, validateSvg } from '../../shared/svg-image';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { assignedImage, imageParent } from '../../shared/image-paths';
import { imageFile, safeDirectory, scanImageTree } from './image-files';
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
interface ImageRecord {
  entry: RegisteredImageEntry;
  signature: string;
  hash: string;
  circle: string;
  decoded: boolean;
  pending?: {
    task: Promise<ReadImage>;
    interests: Set<{ active(): boolean; cachePreview: boolean }>;
  };
}
interface ReadImage {
  ref: RegisteredImageRef;
  bytes: Buffer;
  hash: string;
  generation: string;
  thumbnail: string;
}
const maxBytes = 5 * 1024 * 1024;
export function imageFormat(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  const text = bytes.toString('utf8');
  if (svgSource(text)) {
    validateSvg(text);
    return 'svg';
  }
  throw Error(hostText('services.registeredImages.selectFormat'));
}
export class RegisteredImages {
  private entries = new Map<string, ImageRecord>();
  folders: string[] = [''];
  private queue: Promise<unknown> = Promise.resolve();
  private reads: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private refreshing?: Promise<void>;
  private watching = false;
  private unregister?: () => void;
  private watchedDirectory?: string;
  private connectionGeneration = 0;
  private watchError?: string;
  private pendingFull = false;
  private pendingFiles = new Set<string>();
  private watcher?: FSWatcher;
  private listeners = new Set<() => void>();
  private deferredChanges = 0;
  private changedWhileDeferred = false;
  error?: string;
  constructor(
    readonly directory: string,
    private decode: ImageDecoder,
    private changed: () => void = () => {},
    private assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {}
  onChanged(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  async batch<T>(action: () => Promise<T>): Promise<T> {
    this.deferredChanges++;
    try {
      return await action();
    } finally {
      this.deferredChanges--;
      if (!this.deferredChanges && this.changedWhileDeferred) {
        this.changedWhileDeferred = false;
        this.notify();
      }
    }
  }
  private async root(create = false) {
    if (create) safeDirectory(this.directory, '', true);
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
  private notify() {
    if (this.stopped) return;
    if (this.deferredChanges) {
      this.changedWhileDeferred = true;
      return;
    }
    this.changed();
    for (const callback of this.listeners) callback();
  }
  private current(record: ImageRecord) {
    return (
      !this.stopped &&
      this.entries.get(imageKey(record.entry.ref)) === record &&
      record.entry.available
    );
  }
  private publish(record: ImageRecord, image: DecodedImage, hash: string, cachePreview = true) {
    if (!this.current(record)) throw Error(hostText('services.registeredImages.changed'));
    const changed =
      record.hash !== hash ||
      record.entry.width !== image.width ||
      record.entry.height !== image.height ||
      (cachePreview && !record.decoded);
    record.hash = hash;
    if (cachePreview) {
      record.circle = image.circle;
      record.entry.thumbnail = image.thumbnail;
      record.decoded = true;
    }
    Object.assign(record.entry, {
      width: image.width,
      height: image.height,
      available: true,
      state: 'ready',
    });
    if (changed) this.notify();
  }
  private async fileSignature(name: string) {
    const file = imageFile(this.directory, name);
    safeDirectory(
      assignedImage(name) ? path.dirname(file) : this.directory,
      assignedImage(name) ? '' : imageParent(name),
    );
    const stat = await fs.lstat(file);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      !stat.size ||
      stat.size > maxBytes ||
      (await fs.realpath(file)).toLowerCase() !== file.toLowerCase()
    )
      throw Error(hostText('services.registeredImages.unsafeFile'));
    return { signature: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`, bytes: stat.size };
  }
  async read(
    ref: unknown,
    generation?: string,
    options: { active?(): boolean; cachePreview?: boolean } = {},
  ): Promise<ReadImage> {
    if (!imageReference(ref)) throw Error(hostText('services.registeredImages.invalidReference'));
    const interest = {
      active: options.active ?? (() => true),
      cachePreview: options.cachePreview !== false,
    };
    const checkInterest = () => {
      if (!interest.active()) throw Error(hostText('services.registeredImages.changed'));
    };
    checkInterest();
    await this.refresh(false, [ref.file]);
    checkInterest();
    const record = this.entries.get(imageKey(ref));
    if (!record || !this.current(record))
      throw Error(hostText('services.registeredImages.missing'));
    if (generation !== undefined && generation !== record.entry.generation)
      throw Error(hostText('services.registeredImages.changed'));
    const reply = (task: Promise<ReadImage>) =>
      task.then((result) => {
        checkInterest();
        return result;
      });
    if (record.pending && [...record.pending.interests].some((value) => value.active())) {
      record.pending.interests.add(interest);
      return reply(record.pending.task);
    }
    const interests = new Set([interest]);
    const active = () => [...interests].some((value) => value.active());
    const check = () => {
      if (!active() || !this.current(record))
        throw Error(hostText('services.registeredImages.changed'));
    };
    const run = async (): Promise<ReadImage> => {
      check();
      // Let the requesting surface paint its normal fallback before doing pixel work.
      await new Promise<void>((resolve) => setImmediate(resolve));
      check();
      let decoding = false;
      try {
        if (!assignedImage(ref.file)) await this.root();
        if ((await this.fileSignature(record.entry.ref.file)).signature !== record.signature) {
          await this.refresh();
          throw Error(hostText('services.registeredImages.changed'));
        }
        check();
        const bytes = await this.fileBytes(record.entry.ref.file);
        check();
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (record.hash && record.hash !== hash) {
          // Detect replacement even if a writer managed to preserve the stat signature.
          this.replace(record.entry.ref.file, record.signature, bytes.length, record);
          this.notify();
          throw Error(hostText('services.registeredImages.changed'));
        }
        let image: DecodedImage;
        if (record.decoded)
          image = {
            width: record.entry.width,
            height: record.entry.height,
            thumbnail: record.entry.thumbnail,
            circle: record.circle,
          };
        else {
          decoding = true;
          image = await this.validate(bytes, record.entry.ref.file);
          decoding = false;
        }
        if ((await this.fileSignature(record.entry.ref.file)).signature !== record.signature) {
          await this.refresh();
          throw Error(hostText('services.registeredImages.changed'));
        }
        check();
        this.publish(
          record,
          image,
          hash,
          [...interests].some((value) => value.active() && value.cachePreview),
        );
        return {
          ref: { ...record.entry.ref },
          bytes,
          hash,
          generation: record.entry.generation!,
          thumbnail: image.thumbnail,
        };
      } catch (error) {
        if (active() && this.current(record)) {
          record.entry.available = false;
          record.entry.state = 'error';
          if (!decoding) record.signature = '';
          this.notify();
        }
        throw error;
      }
    };
    const task = this.reads.then(run, run).finally(() => {
      if (record.pending?.task === task) record.pending = undefined;
    });
    record.pending = { task, interests };
    this.reads = task.then(
      () => {},
      () => {},
    );
    return reply(task);
  }
  private async fileBytes(name: string) {
    if (!imageFilename(name)) throw Error(hostText('services.registeredImages.invalidFilename'));
    const file = imageFile(this.directory, name);
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
      if (!imageReference(ref)) throw Error(hostText('services.registeredImages.invalidReference'));
      const expectedHash = this.entries.get(imageKey(ref))?.hash;
      const original = await this.read(ref, generation);
      if (!generation || (expectedHash && expectedHash !== original.hash))
        throw Error(hostText('services.registeredImages.changed'));
      const commit = options.prepare();
      const file = imageFile(this.directory, original.ref.file);
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
      this.notify();
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
      if (assignedImage(filename))
        throw Error(hostText('services.registeredImages.invalidFilename'));
      const decoded = await this.validate(bytes, filename);
      await this.root(true);
      const parent = imageParent(filename);
      safeDirectory(this.directory, parent, true);
      const files = (await fs.readdir(path.dirname(imageFile(this.directory, filename))))
        .map((name) => (parent ? parent + '/' + name : name))
        .filter(imageFilename);
      const existing = files.find((n) => n.toLowerCase() === filename.toLowerCase());
      const name = existing ?? filename,
        ref = { file: name };
      const duplicate = async () => {
        const before = await this.fileSignature(name);
        if (!(await this.fileBytes(name)).equals(bytes))
          throw Error(hostText('services.registeredImages.duplicateName', { name: String(name) }));
        if ((await this.fileSignature(name)).signature !== before.signature)
          throw Error(hostText('services.registeredImages.changed'));
        const old = this.entries.get(imageKey(ref));
        const record =
          old?.signature === before.signature
            ? old
            : this.replace(name, before.signature, before.bytes, old);
        this.publish(record, decoded, createHash('sha256').update(bytes).digest('hex'), false);
        return { ref, reused: true };
      };
      if (existing) return duplicate();
      const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
      const handle = await fs.open(temp, 'wx');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        try {
          await fs.link(temp, imageFile(this.directory, name));
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
      const stat = await this.fileSignature(name);
      const record = this.replace(name, stat.signature, stat.bytes);
      if (
        !record ||
        !(await this.fileBytes(name)).equals(bytes) ||
        (await this.fileSignature(name)).signature !== record.signature
      )
        throw Error(hostText('services.registeredImages.changed'));
      this.publish(record, decoded, createHash('sha256').update(bytes).digest('hex'), false);
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
      .filter((v) => !assignedImage(v.entry.ref.file) && v.entry.state !== 'missing')
      .map((v) => structuredClone(v.entry))
      .sort((a, b) => a.ref.file.localeCompare(b.ref.file, 'ja'));
  }
  /** Cached selection candidates only; never reads, decodes or returns image content. */
  availableReferences(): RegisteredImageRef[] {
    if (this.error) return [];
    return [...this.entries.values()]
      .filter(({ entry }) => entry.available && !assignedImage(entry.ref.file))
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
  /** Only the consumer of this opaque asset starts a read, not model construction. */
  asset(ref: unknown, shape = 'square') {
    if (!imageReference(ref)) return undefined;
    const record = this.entries.get(imageKey(ref));
    if (!record) return undefined;
    if (!record.entry.available) return this.icon(ref, shape) || undefined;
    return {
      key: `${imageKey(record.entry.ref)}:${record.entry.generation}:${shape}`,
      monochrome: /\.svg$/i.test(record.entry.ref.file),
      load: async () => {
        if (!this.current(record)) throw Error(hostText('services.registeredImages.changed'));
        if (!record.decoded) await this.read(record.entry.ref, record.entry.generation);
        if (!this.current(record)) throw Error(hostText('services.registeredImages.changed'));
        return this.icon(record.entry.ref, shape) || undefined;
      },
    };
  }
  async preview(ref: unknown) {
    if (!imageReference(ref)) return undefined;
    await this.refresh(false, [ref.file]);
    const asset = this.asset(ref);
    return typeof asset === 'string' ? asset : asset ? asset.load() : undefined;
  }
  contentHash(ref: RegisteredImageRef, generation: string) {
    const record = this.entries.get(imageKey(ref));
    return record && this.current(record) && record.entry.generation === generation && record.hash
      ? record.hash
      : undefined;
  }
  private replace(name: string, signature: string, bytes: number, old?: ImageRecord) {
    const record: ImageRecord = {
      signature,
      hash: '',
      circle: old?.circle ?? '',
      decoded: false,
      entry: {
        ref: { file: name },
        bytes,
        width: old?.entry.width ?? 0,
        height: old?.entry.height ?? 0,
        thumbnail: old?.entry.thumbnail ?? '',
        available: true,
        state: 'ready',
        generation: randomUUID(),
      },
    };
    this.entries.set(name.toLowerCase(), record);
    return record;
  }
  refresh(retry = false, files?: string[]): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (retry && this.refreshing) return this.refreshing.then(() => this.refresh(true));
    if (retry)
      for (const record of this.entries.values())
        if (record.entry.state === 'error') record.signature = '';
    if (this.refreshing)
      return files ? this.refreshing.then(() => this.refresh(false, files)) : this.refreshing;
    return this.beginRefresh(files);
  }
  private requestRefresh(files?: string[]) {
    if (this.stopped) return;
    if (this.refreshing) {
      if (!files) this.pendingFull = true;
      else for (const file of files) this.pendingFiles.add(file);
    } else void this.beginRefresh(files);
  }
  private beginRefresh(files?: string[]): Promise<void> {
    this.refreshing = this.scan(files).finally(() => {
      this.refreshing = undefined;
      const full = this.pendingFull,
        pending = [...this.pendingFiles];
      this.pendingFull = false;
      this.pendingFiles.clear();
      if (!this.stopped && (full || pending.length))
        void this.beginRefresh(full ? undefined : pending);
    });
    return this.refreshing;
  }
  private async connectWatch(
    directory = path.dirname(this.directory),
    recover = true,
  ): Promise<void> {
    const connectionGeneration = ++this.connectionGeneration;
    while (this.watching && !this.stopped) {
      if (this.watcher && this.watchedDirectory === directory) return;
      try {
        if (
          (await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase() ||
          (await fs.lstat(directory)).isSymbolicLink()
        )
          throw Error('Redirected image watch directory');
        if (!this.watching || this.stopped || connectionGeneration !== this.connectionGeneration)
          return;
        const next = watch(
          directory,
          { recursive: directory === this.directory || directory === path.dirname(this.directory) },
          (event, filename) => {
            if (this.watcher !== next || this.stopped) return;
            const name = filename?.toString().replace(/\\/g, '/');
            // Atomic publication generates temporary-file events beside the library.
            // They cannot add a folder or a supported image; scanning the whole tree
            // for each event would make a bulk import quadratic.
            if (name && /(?:^|\/)\.[a-f0-9-]{36}\.tmp$/i.test(name)) return;
            if (directory === path.dirname(this.directory)) {
              const prefix = path.basename(this.directory) + '/';
              const relative = name?.startsWith(prefix)
                ? name.slice(prefix.length)
                : name?.startsWith('assigned-images/')
                  ? '@assigned/' + name.slice('assigned-images/'.length)
                  : undefined;
              // Windows emits directory mtime changes alongside each recursive file event.
              // Directory creation/removal/renaming arrives as "rename" separately.
              if (
                event === 'change' &&
                (name === path.basename(this.directory) || name === 'assigned-images')
              )
                return;
              if (relative && imageFilename(relative)) {
                if (this.folders.includes(relative)) {
                  if (event === 'rename') this.requestRefresh();
                } else
                  void fs.lstat(imageFile(this.directory, relative)).then(
                    (stat) => {
                      if (!stat.isDirectory()) this.requestRefresh([relative]);
                      else if (event === 'rename') this.requestRefresh();
                    },
                    () => this.requestRefresh([relative]),
                  );
              } else if (
                !name ||
                (event === 'rename' &&
                  (name === path.basename(this.directory) ||
                    name.startsWith(prefix) ||
                    name === 'assigned-images'))
              )
                this.requestRefresh();
            } else if (directory !== this.directory) {
              const expected = path.relative(directory, this.directory).split(path.sep)[0];
              if (!name || name.toLowerCase() === expected.toLowerCase()) this.requestRefresh();
            } else if (!name) this.requestRefresh();
            else if (imageFilename(name)) this.requestRefresh([name]);
            else this.requestRefresh();
          },
        );
        this.watcher?.close();
        this.watcher = next;
        this.watchedDirectory = directory;
        this.watchError = undefined;
        next.on('error', () => {
          if (this.watcher !== next || this.stopped) return;
          next.close();
          this.watcher = undefined;
          this.watchedDirectory = undefined;
          this.error = this.watchError = hostText('services.registeredImages.readFailed');
          this.notify();
          const parent = path.dirname(directory);
          if (recover && parent !== directory) void this.connectWatch(parent, false);
        });
        return;
      } catch (error) {
        if (!this.watching || this.stopped || connectionGeneration !== this.connectionGeneration)
          return;
        const parent = path.dirname(directory);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && parent !== directory) {
          directory = parent;
          continue;
        }
        this.watchError = hostText('services.registeredImages.readFailed');
        return;
      }
    }
  }
  private async scan(files?: string[]) {
    const signature = () =>
      JSON.stringify([
        this.folders,
        [...this.entries.values()].map(({ entry, hash, decoded }) => [
          entry.ref.file,
          entry.generation,
          entry.available,
          entry.state,
          hash,
          decoded,
        ]),
        this.error,
      ]);
    const previous = signature();
    try {
      try {
        await this.root();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (this.stopped) return;
      if (this.watching) await this.connectWatch();
      let names: { name: string }[];
      if (files) names = files.map((name) => ({ name }));
      else {
        const tree = await scanImageTree(this.directory).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return { folders: [''], files: [] as string[] };
        });
        this.folders = tree.folders;
        names = tree.files.map((name) => ({ name }));
        const assignedRoot = path.join(path.dirname(this.directory), 'assigned-images');
        try {
          safeDirectory(assignedRoot, '');
          names.push(
            ...(await fs.readdir(assignedRoot))
              .map((n) => '@assigned/' + n)
              .filter(imageFilename)
              .map((name) => ({ name })),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (this.stopped) return;
      const seen = new Set<string>();
      for (const f of names) {
        const key = f.name.toLowerCase();
        seen.add(key);
        try {
          const { signature, bytes } = await this.fileSignature(f.name);
          if (this.stopped) return;
          const old = this.entries.get(key);
          if (
            old?.signature === signature &&
            old.entry.ref.file === f.name &&
            (old.entry.available || old.entry.state === 'error')
          )
            continue;
          this.replace(f.name, signature, bytes, old);
        } catch (error) {
          if (this.stopped) return;
          const old = this.entries.get(key);
          const missing = ['ENOENT', 'ENOTDIR'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          );
          if (old) {
            old.signature = '';
            old.entry.available = false;
            old.entry.state = missing ? 'missing' : 'error';
          } else if (!missing)
            this.entries.set(key, {
              signature: '',
              hash: '',
              circle: '',
              decoded: false,
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
      if (!files)
        for (const [key, value] of this.entries)
          if (!seen.has(key)) {
            value.entry.available = false;
            value.entry.state = 'missing';
          }
      this.error = this.watchError;
    } catch (error) {
      if (this.stopped) return;
      if (this.watching) await this.connectWatch();
      if (this.stopped) return;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.error = hostText('services.registeredImages.readFailed');
      for (const value of this.entries.values()) {
        value.signature = '';
        value.entry.available = false;
        value.entry.state =
          (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error';
      }
    }
    if (previous !== signature()) this.notify();
  }
  watch() {
    if (!this.watching && !this.stopped) {
      this.watching = true;
      this.unregister = this.assistance?.register(
        'registered-images:' + path.resolve(this.directory).toLowerCase(),
        () => this.refresh(),
      );
    }
    return this.refresh();
  }
  stop() {
    this.stopped = true;
    this.watching = false;
    this.unregister?.();
    this.unregister = undefined;
    this.pendingFull = false;
    this.pendingFiles.clear();
    this.watcher?.close();
    this.watcher = undefined;
  }
}

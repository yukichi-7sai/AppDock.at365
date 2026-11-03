import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  assignedAsset as assignedImage,
  libraryParent as imageParent,
  libraryKey as imageKey,
  libraryPath,
  libraryReference,
  type LibraryMedia,
  type LibraryRef as RegisteredImageRef,
  type LibraryEntry as RegisteredImageEntry,
} from '../../shared/library-assets';
import { assetFile, safeDirectory, scanAssetTree } from './library-files';
import { orderedReads } from './ordered-io';
import { libraryText } from '../../shared/library-text';
import { atomicWrite, SettingsConflictError } from './settings';
export interface AssetPolicy {
  media: LibraryMedia;
  assignedDirectory: string;
  maxBytes: number;
  allowEmpty?: boolean;
  format(bytes: Buffer): string;
  validate(bytes: Buffer, name: string): Promise<DecodedAsset>;
}
export interface DecodedAsset {
  width: number;
  height: number;
  thumbnail: string;
  circle: string;
  durationMs?: number;
  textPreview?: string;
  characters?: number;
  lines?: number;
}
export type AssetDecoder = (bytes: Buffer) => DecodedAsset | Promise<DecodedAsset>;
interface AssetRecord {
  entry: RegisteredImageEntry;
  signature: string;
  hash: string;
  circle: string;
  decoded: boolean;
  pending?: {
    task: Promise<ReadAsset>;
    interests: Set<{ active(): boolean; cachePreview: boolean }>;
  };
}
interface ReadAsset {
  ref: RegisteredImageRef;
  bytes: Buffer;
  hash: string;
  generation: string;
  thumbnail: string;
}
/** A requesting view no longer needs the bytes. The file itself may still be current. */
export class LibraryReadCancelled extends Error {}
export class RegisteredAssets {
  private entries = new Map<string, AssetRecord>();
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
    readonly policy: AssetPolicy,
    private changed: () => void = () => {},
    private assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {}
  validName = (value: unknown): value is string => libraryPath(value, this.policy.media);
  reference = (value: unknown): value is RegisteredImageRef =>
    libraryReference(value, this.policy.media);
  file(name: string) {
    return assetFile(this.directory, name, this.policy.media);
  }
  private text = (key: string, values?: Record<string, string | number>) =>
    libraryText(this.policy.media, key, values);
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
      throw Error(this.text('services.registeredImages.redirectedDirectory'));
  }
  private validate(bytes: Buffer, name: string) {
    return this.policy.validate(bytes, name);
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
  private current(record: AssetRecord) {
    return (
      !this.stopped &&
      this.entries.get(imageKey(record.entry.ref)) === record &&
      record.entry.available
    );
  }
  private publish(record: AssetRecord, image: DecodedAsset, hash: string, cachePreview = true) {
    if (!this.current(record)) throw Error(this.text('services.registeredImages.changed'));
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
      ...(image.durationMs === undefined ? {} : { durationMs: image.durationMs }),
      ...(image.textPreview === undefined
        ? {}
        : { textPreview: image.textPreview, characters: image.characters, lines: image.lines }),
      available: true,
      state: 'ready',
    });
    if (changed) this.notify();
  }
  private async fileSignature(name: string, checkedParents?: Set<string>) {
    const file = this.file(name);
    const parent = path.dirname(file);
    if (!checkedParents?.has(parent)) {
      safeDirectory(
        assignedImage(name) ? parent : this.directory,
        assignedImage(name) ? '' : imageParent(name),
      );
      checkedParents?.add(parent);
    }
    const stat = await fs.lstat(file);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      (!stat.size && !this.policy.allowEmpty) ||
      stat.size > this.policy.maxBytes ||
      (await fs.realpath(file)).toLowerCase() !== file.toLowerCase()
    )
      throw Error(this.text('services.registeredImages.unsafeFile'));
    return { signature: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`, bytes: stat.size };
  }
  async read(
    ref: unknown,
    generation?: string,
    options: { active?(): boolean; cachePreview?: boolean } = {},
  ): Promise<ReadAsset> {
    if (!this.reference(ref)) throw Error(this.text('services.registeredImages.invalidReference'));
    const interest = {
      active: options.active ?? (() => true),
      cachePreview: options.cachePreview !== false,
    };
    const checkInterest = () => {
      if (!interest.active())
        throw new LibraryReadCancelled(this.text('services.registeredImages.changed'));
    };
    checkInterest();
    await this.refresh(false, [ref.file]);
    checkInterest();
    const record = this.entries.get(imageKey(ref));
    if (!record || !this.current(record))
      throw Error(this.text('services.registeredImages.missing'));
    if (generation !== undefined && generation !== record.entry.generation)
      throw Error(this.text('services.registeredImages.changed'));
    const reply = (task: Promise<ReadAsset>) =>
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
      if (!active()) throw new LibraryReadCancelled(this.text('services.registeredImages.changed'));
      if (!this.current(record)) throw Error(this.text('services.registeredImages.changed'));
    };
    const run = async (): Promise<ReadAsset> => {
      check();
      // Let the requesting surface paint its normal fallback before doing pixel work.
      await new Promise<void>((resolve) => setImmediate(resolve));
      check();
      let decoding = false;
      try {
        if (!assignedImage(ref.file)) await this.root();
        if ((await this.fileSignature(record.entry.ref.file)).signature !== record.signature) {
          await this.refresh();
          throw Error(this.text('services.registeredImages.changed'));
        }
        check();
        const bytes = await this.fileBytes(record.entry.ref.file);
        check();
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (record.hash && record.hash !== hash) {
          // Detect replacement even if a writer managed to preserve the stat signature.
          this.replace(record.entry.ref.file, record.signature, bytes.length, record);
          this.notify();
          throw Error(this.text('services.registeredImages.changed'));
        }
        let image: DecodedAsset;
        if (record.decoded)
          image = {
            width: record.entry.width,
            height: record.entry.height,
            thumbnail: record.entry.thumbnail,
            circle: record.circle,
            durationMs: record.entry.durationMs,
            textPreview: record.entry.textPreview,
            characters: record.entry.characters,
            lines: record.entry.lines,
          };
        else {
          decoding = true;
          image = await this.validate(bytes, record.entry.ref.file);
          decoding = false;
        }
        if ((await this.fileSignature(record.entry.ref.file)).signature !== record.signature) {
          await this.refresh();
          throw Error(this.text('services.registeredImages.changed'));
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
    if (!this.validName(name)) throw Error(this.text('services.registeredImages.invalidFilename'));
    const file = this.file(name);
    const stat = await fs.lstat(file);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size > this.policy.maxBytes ||
      (await fs.realpath(file)).toLowerCase() !== file.toLowerCase()
    )
      throw Error(this.text('services.registeredImages.unsafeFile'));
    const bytes = await fs.readFile(file);
    if (bytes.length > this.policy.maxBytes)
      throw Error(this.text('services.registeredImages.sizeLimit'));
    return bytes;
  }
  async add(bytes: Buffer, filename: string): Promise<RegisteredImageRef> {
    return (await this.addWithResult(bytes, filename)).ref;
  }
  /** Replace the confirmed generation only; external edits are rechecked at atomic commit. */
  updateContent(ref: RegisteredImageRef, generation: string, bytes: Buffer, writable: () => void) {
    const run = async () => {
      if (this.policy.media !== 'text' || !this.reference(ref) || !generation)
        throw Error(this.text('services.registeredImages.invalidReference'));
      writable();
      await this.validate(bytes, ref.file);
      const original = await this.read(ref, generation);
      writable();
      safeDirectory(this.directory, imageParent(ref.file));
      await this.fileSignature(ref.file);
      writable();
      if (original.bytes.equals(bytes)) return original;
      try {
        atomicWrite(this.file(ref.file), bytes, { previous: original.bytes });
      } catch (error) {
        if (error instanceof SettingsConflictError)
          throw Error(this.text('services.registeredImages.changed'));
        throw error;
      }
      // read() refreshes this specific path and verifies the bytes actually present after the save.
      return this.read(ref);
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => {});
    return task;
  }
  /** Only the confirmed, unchanged original may be recycled; failed settings saves restore it. */
  remove(
    ref: RegisteredImageRef,
    generation: string,
    options: { trash(file: string): Promise<void>; prepare(): () => void },
  ): Promise<void> {
    const run = async () => {
      if (!this.reference(ref))
        throw Error(this.text('services.registeredImages.invalidReference'));
      const expectedHash = this.entries.get(imageKey(ref))?.hash;
      const original = await this.read(ref, generation);
      if (!generation || (expectedHash && expectedHash !== original.hash))
        throw Error(this.text('services.registeredImages.changed'));
      const commit = options.prepare();
      const file = this.file(original.ref.file);
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
          throw Error(this.text('services.registeredImages.restoreFailed'));
        }
        throw recycled ? error : Error(this.text('services.registeredImages.trashFailed'));
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
    const { ref, reused } = await this.addVerified(bytes, filename);
    return { ref, reused };
  }
  async addVerified(
    bytes: Buffer,
    filename: string,
  ): Promise<{ ref: RegisteredImageRef; reused: boolean; generation: string }> {
    const run = async () => {
      if (assignedImage(filename))
        throw Error(this.text('services.registeredImages.invalidFilename'));
      const decoded = await this.validate(bytes, filename);
      await this.root(true);
      const parent = imageParent(filename);
      safeDirectory(this.directory, parent, true);
      const files = (await fs.readdir(path.dirname(this.file(filename))))
        .map((name) => (parent ? parent + '/' + name : name))
        .filter((name) => this.validName(name));
      const existing = files.find((n) => n.toLowerCase() === filename.toLowerCase());
      const name = existing ?? filename,
        ref = { file: name };
      const duplicate = async () => {
        const before = await this.fileSignature(name);
        if (!(await this.fileBytes(name)).equals(bytes))
          throw Error(this.text('services.registeredImages.duplicateName', { name: String(name) }));
        if ((await this.fileSignature(name)).signature !== before.signature)
          throw Error(this.text('services.registeredImages.changed'));
        const old = this.entries.get(imageKey(ref));
        const record =
          old?.signature === before.signature
            ? old
            : this.replace(name, before.signature, before.bytes, old);
        this.publish(record, decoded, createHash('sha256').update(bytes).digest('hex'), false);
        return { ref, reused: true, generation: record.entry.generation! };
      };
      if (existing) return duplicate();
      const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
      const handle = await fs.open(temp, 'wx');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        try {
          await fs.link(temp, this.file(name));
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
        throw Error(this.text('services.registeredImages.changed'));
      this.publish(record, decoded, createHash('sha256').update(bytes).digest('hex'), false);
      return { ref, reused: false, generation: record.entry.generation! };
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
      throw Error(this.text('services.registeredImages.invalidData'));
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 512 * 1024)
      throw Error(this.text('services.registeredImages.programmaticSizeLimit'));
    const format = this.policy.format(bytes);
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
    if (!this.reference(ref)) return undefined;
    const value = this.entries.get(imageKey(ref));
    return value ? structuredClone(value.entry) : undefined;
  }
  icon(ref: unknown, shape = 'square') {
    if (!this.reference(ref)) return undefined;
    const entry = this.entries.get(imageKey(ref));
    return shape === 'circle' ? entry?.circle : entry?.entry.thumbnail;
  }
  /** Only the consumer of this opaque asset starts a read, not model construction. */
  asset(ref: unknown, shape = 'square') {
    if (!this.reference(ref)) return undefined;
    const record = this.entries.get(imageKey(ref));
    if (!record) return undefined;
    if (!record.entry.available) return this.icon(ref, shape) || undefined;
    return {
      key: `${imageKey(record.entry.ref)}:${record.entry.generation}:${shape}`,
      monochrome: /\.svg$/i.test(record.entry.ref.file),
      load: async () => {
        if (!this.current(record)) throw Error(this.text('services.registeredImages.changed'));
        if (!record.decoded) await this.read(record.entry.ref, record.entry.generation);
        if (!this.current(record)) throw Error(this.text('services.registeredImages.changed'));
        return this.icon(record.entry.ref, shape) || undefined;
      },
    };
  }
  async preview(ref: unknown) {
    if (!this.reference(ref)) return undefined;
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
  private replace(name: string, signature: string, bytes: number, old?: AssetRecord) {
    const record: AssetRecord = {
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
                : name?.startsWith(this.policy.assignedDirectory + '/')
                  ? '@assigned/' + name.slice((this.policy.assignedDirectory + '/').length)
                  : undefined;
              // Windows emits directory mtime changes alongside each recursive file event.
              // Directory creation/removal/renaming arrives as "rename" separately.
              if (
                event === 'change' &&
                (name === path.basename(this.directory) || name === this.policy.assignedDirectory)
              )
                return;
              if (relative && this.validName(relative)) {
                if (this.folders.includes(relative)) {
                  if (event === 'rename') this.requestRefresh();
                } else
                  void fs.lstat(this.file(relative)).then(
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
                    name === this.policy.assignedDirectory))
              )
                this.requestRefresh();
            } else if (directory !== this.directory) {
              const expected = path.relative(directory, this.directory).split(path.sep)[0];
              if (!name || name.toLowerCase() === expected.toLowerCase()) this.requestRefresh();
            } else if (!name) this.requestRefresh();
            else if (this.validName(name)) this.requestRefresh([name]);
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
          this.error = this.watchError = this.text('services.registeredImages.readFailed');
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
        this.watchError = this.text('services.registeredImages.readFailed');
        return;
      }
    }
  }
  private async scan(files?: string[]) {
    const previousError = this.error;
    let changed = false;
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
        const tree = await scanAssetTree(this.directory, this.policy.media).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return { folders: [''], files: [] as string[] };
        });
        if (
          this.folders.length !== tree.folders.length ||
          this.folders.some((folder, i) => folder !== tree.folders[i])
        ) {
          this.folders = tree.folders;
          changed = true;
        }
        names = tree.files.map((name) => ({ name }));
        const assignedRoot = path.join(path.dirname(this.directory), this.policy.assignedDirectory);
        try {
          safeDirectory(assignedRoot, '');
          names.push(
            ...(await fs.readdir(assignedRoot))
              .map((n) => '@assigned/' + n)
              .filter((name) => this.validName(name))
              .map((name) => ({ name })),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (this.stopped) return;
      const seen = new Set<string>();
      const checkedParents = new Set<string>();
      let index = 0;
      // Only metadata is prefetched. Every file still has its own lstat and realpath check.
      for await (const result of orderedReads(names, 8, (f) =>
        this.fileSignature(f.name, checkedParents),
      )) {
        if (this.stopped) return;
        const f = names[index++];
        const key = f.name.toLowerCase();
        seen.add(key);
        try {
          if (result.status === 'rejected') throw result.reason;
          const { signature, bytes } = result.value;
          const old = this.entries.get(key);
          if (
            old?.signature === signature &&
            old.entry.ref.file === f.name &&
            (old.entry.available || old.entry.state === 'error')
          )
            continue;
          this.replace(f.name, signature, bytes, old);
          changed = true;
        } catch (error) {
          if (this.stopped) return;
          const old = this.entries.get(key);
          const missing = ['ENOENT', 'ENOTDIR'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          );
          if (old) {
            const state = missing ? 'missing' : 'error';
            if (old.entry.available || old.entry.state !== state) changed = true;
            old.signature = '';
            old.entry.available = false;
            old.entry.state = state;
          } else if (!missing) {
            changed = true;
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
      }
      if (!files)
        for (const [key, value] of this.entries)
          if (!seen.has(key)) {
            if (value.entry.available || value.entry.state !== 'missing') changed = true;
            value.entry.available = false;
            value.entry.state = 'missing';
          }
      this.error = this.watchError;
    } catch (error) {
      if (this.stopped) return;
      if (this.watching) await this.connectWatch();
      if (this.stopped) return;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.error = this.text('services.registeredImages.readFailed');
      for (const value of this.entries.values()) {
        const state = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error';
        if (value.entry.available || value.entry.state !== state) changed = true;
        value.signature = '';
        value.entry.available = false;
        value.entry.state = state;
      }
    }
    if (changed || this.error !== previousError) this.notify();
  }
  watch() {
    if (!this.watching && !this.stopped) {
      this.watching = true;
      this.unregister = this.assistance?.register(
        (this.policy.media === 'image'
          ? 'registered-images:'
          : `registered-${this.policy.media}-library:`) +
          path.resolve(this.directory).toLowerCase(),
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

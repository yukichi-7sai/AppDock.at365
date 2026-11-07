import { clipboard, ClipboardItem, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { orderedReads } from './ordered-io';
import { externalLibraryLocation } from '../../shared/library-sources';
import { audioExtensions } from '../../shared/audio-formats';
import { AssignedAssets } from './assigned-assets';
import { imageBasename, imageFolder, imageParent } from '../../shared/image-paths';
import { safeDirectory } from './library-files';
import { createHash, randomUUID } from 'node:crypto';
import { RegisteredAssets } from './registered-assets';
import { ownsImage } from './image-ownership';
import { libraryText } from '../../shared/library-text';
import type { SettingsStore } from './settings';
import {
  imageKey,
  type ImageLibraryEdit,
  type ImageLibrarySnapshot,
  type RegisteredImageRef,
  type ImagePickResult,
} from '../../shared/registered-images';
import type { ExtensionManifest } from '../../shared/contracts';
import { imageDirectory } from './applet-image-cache';
import { ImageLibrarySettings } from './image-library-settings';

import { decodeRegisteredImage, registeredImageClipboardPng } from './registered-image-decoder';
import { decodeRegisteredImageFile } from './image-file-decoder';
import { fileHash, sameFileHash } from './file-content';
import { copyImageFiles } from './image-file-clipboard';
import { renameImageFiles } from './image-file-rename';
import type {
  ImageLibraryFileAction,
  LibraryDeletionTarget,
} from '../../shared/image-library-page';
import type { RegisteredImageEntry } from '../../shared/registered-images';
export { decodeRegisteredImage } from './registered-image-decoder';

let activePicker: AssetLibraryHost | undefined;

export class AssetLibraryHost {
  readonly configuration: ImageLibrarySettings;
  private filesBusy = false;
  private folderPeers: AssetLibraryHost[] = [this];
  setFolderPeers(libraries: AssetLibraryHost[]) {
    this.folderPeers = libraries;
  }
  private generated = new Map<string, Set<string>>();
  private pickerAlive?: () => boolean;
  private pending?: {
    id: string;
    current: RegisteredImageRef | null;
    resolve(result: ImagePickResult): void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(
    readonly images: RegisteredAssets,
    private options: {
      settings: Pick<SettingsStore, 'value' | 'revision' | 'save'>;
      window(): BrowserWindow | null;
      writable(): void;
      show(): void;
      cover?(): Promise<() => void>;
      referenced?(ref: RegisteredImageRef): boolean;
    },
  ) {
    this.configuration = new ImageLibrarySettings(options.settings, options.writable, this.media);
  }
  get media() {
    return this.images.policy.media;
  }
  private text = (key: string, values?: Record<string, string | number>) =>
    libraryText(this.media, key, values);
  assertWritable() {
    this.options.writable();
  }
  async import(input: { filename?: string; base64: string }) {
    this.options.writable();
    return this.retain(await this.images.import(input));
  }
  async retain(ref: RegisteredImageRef) {
    if (this.media === 'text') throw Error('Text settings copies are not supported');
    this.options.writable();
    if (this.images.policy.validateFile) {
      const saved = await this.images.readFile(ref);
      const result = await new AssignedAssets(this.images.directory, this.media).retainFile(
        ref,
        saved.hash,
        this.options.writable,
        externalLibraryLocation(ref.file) ? saved.file : undefined,
      );
      await this.images.refresh(false, [result.file]);
      return result;
    }
    const saved = await this.images.read(ref);
    this.options.writable();
    const result = externalLibraryLocation(ref.file)
      ? await new AssignedAssets(this.images.directory, this.media).retainFile(
          ref,
          createHash('sha256').update(saved.bytes).digest('hex'),
          this.options.writable,
          this.images.file(ref.file),
        )
      : new AssignedAssets(this.images.directory, this.media).retain(ref, saved.bytes);
    await this.images.refresh(false, [result.file]);
    return result;
  }
  reconcileGroups() {
    if (this.images.error || this.filesBusy) return;
    try {
      this.options.writable();
    } catch {
      return;
    }
    const candidates = new Map<string, RegisteredImageRef[]>();
    for (const ref of this.images.availableReferences()) {
      const name = imageBasename(ref.file).toLowerCase();
      candidates.set(name, [...(candidates.get(name) ?? []), ref]);
    }
    const current = this.configuration.snapshot();
    const next = structuredClone(current);
    for (const group of next.groups) {
      group.images = group.images
        .map((ref) => {
          if (externalLibraryLocation(ref.file)) return ref;
          const entry = this.images.entry(ref);
          if (entry && entry.state !== 'missing') return ref;
          const matches = candidates
            .get(imageBasename(ref.file).toLowerCase())
            ?.filter((candidate) => !externalLibraryLocation(candidate.file));
          return matches?.length === 1 ? matches[0] : ref;
        })
        .filter(
          (ref, index, values) => values.findIndex((r) => imageKey(r) === imageKey(ref)) === index,
        );
    }
    if (JSON.stringify(current) !== JSON.stringify(next))
      this.configuration.plan(next, this.configuration.revision).commit();
  }
  async folderOperation(
    operation: string,
    folder: string,
    destination?: string,
    images: RegisteredImageRef[] = [],
    entries?: RegisteredImageEntry[],
  ) {
    this.options.writable();
    this.images.assertWritable(folder);
    if (destination !== undefined) this.images.assertWritable(destination);
    for (const ref of images) this.images.assertWritable(ref.file);
    if (!imageFolder(folder) || (destination !== undefined && !imageFolder(destination)))
      throw Error(this.text('images.folderInvalid'));
    const targetFolder = this.images.folderTarget(folder);
    const targetDestination =
      destination === undefined ? undefined : this.images.folderTarget(destination);
    if (targetDestination && targetDestination.root !== targetFolder.root)
      throw Error(this.text('images.folderInvalid'));
    const root = targetFolder.root;
    const localFolder = targetFolder.relative;
    const localDestination = targetDestination?.relative;
    const check = () => {
      this.options.writable();
      this.images.assertWritable(folder);
      if (destination !== undefined) this.images.assertWritable(destination);
    };
    safeDirectory(root, '', !targetFolder.external);
    try {
      if (operation === 'create') {
        if (!localDestination) throw Error(this.text('images.folderInvalid'));
        safeDirectory(root, imageParent(localDestination));
        check();
        await fs.mkdir(path.join(root, ...localDestination.split('/')));
      } else if (operation === 'rename') {
        if (
          !localFolder ||
          !localDestination ||
          localDestination.toLowerCase().startsWith(localFolder.toLowerCase() + '/')
        )
          throw Error(this.text('images.folderInvalid'));
        const source = safeDirectory(root, localFolder);
        const target = path.join(
          safeDirectory(root, imageParent(localDestination)),
          imageBasename(localDestination),
        );
        if (
          await fs.lstat(target).then(
            () => true,
            (e) => {
              if (e.code === 'ENOENT') return false;
              throw e;
            },
          )
        )
          throw Error(this.text('images.destinationExists'));
        check();
        safeDirectory(root, localFolder);
        safeDirectory(root, imageParent(localDestination));
        if (targetFolder.external)
          await this.renameExternalFolder(folder, destination!, source, target, check);
        else await fs.rename(source, target);
      } else if (operation === 'delete') {
        if (!localFolder) throw Error(this.text('images.folderInvalid'));
        check();
        await fs.rmdir(safeDirectory(root, localFolder));
      } else if (operation === 'move-images') {
        safeDirectory(root, localFolder);
        const confirmed =
          entries ??
          images.map((ref) => {
            const entry = this.images.entry(ref);
            if (!entry) throw Error(this.text('images.changed'));
            return entry;
          });
        await this.rename(
          confirmed,
          confirmed.map((entry) => imageBasename(entry.ref.file)),
          folder,
        );
      } else throw Error(this.text('images.folderInvalid'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOTEMPTY')
        throw Error(this.text('images.folderNotEmpty'));
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw Error(this.text('images.destinationExists'));
      throw error;
    } finally {
      await this.images.refreshRoots([folder]);
      this.reconcileGroups();
    }
  }
  /** External directories can contain all media; classifications commit in one settings revision. */
  private async renameExternalFolder(
    folder: string,
    destination: string,
    source: string,
    target: string,
    check: () => void,
  ) {
    const peers = this.folderPeers;
    if (peers.some((peer) => peer.filesBusy))
      throw Error(this.text('services.imageLibraryPage.busy'));
    const prefix = folder.toLowerCase() + '/';
    const inFolder = (ref: RegisteredImageRef) => ref.file.toLowerCase().startsWith(prefix);
    const validate = () => {
      check();
      for (const peer of peers) {
        peer.options.writable();
        if (peer.images.list().some((entry) => inFolder(entry.ref) && peer.inUse(entry.ref)))
          throw Error(this.text('services.imageLibraryHost.inUse'));
      }
    };
    validate();
    const store = this.options.settings;
    const revision = store.revision;
    const next = structuredClone(store.value);
    for (const peer of peers) {
      const rewrite = (value: unknown): unknown => {
        if (peer.images.reference(value))
          return inFolder(value) ? { file: destination + value.file.slice(folder.length) } : value;
        if (Array.isArray(value)) return value.map(rewrite);
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, rewrite(item)]),
          );
        return value;
      };
      const key = `${peer.media}Library` as 'imageLibrary' | 'soundLibrary' | 'textLibrary';
      Object.assign(next, { [key]: rewrite(next[key]) });
    }
    peers.forEach((peer) => {
      peer.filesBusy = true;
    });
    let renamed = false;
    try {
      await fs.rename(source, target);
      renamed = true;
      validate();
      if (store.revision !== revision)
        throw Error(this.text('services.imageLibraryHost.conflictRestored'));
      if (JSON.stringify(next) !== JSON.stringify(store.value)) store.save(next, revision);
    } catch (error) {
      if (renamed) {
        try {
          const root = this.images.folderTarget(destination);
          safeDirectory(root.root, root.relative);
          await fs.rename(target, source);
        } catch {
          throw Error(this.text('images.renameRestoreFailed'));
        }
      }
      throw error;
    } finally {
      try {
        await Promise.all(peers.map((peer) => peer.images.refreshRoots([folder])));
      } finally {
        peers.forEach((peer) => {
          peer.filesBusy = false;
        });
      }
    }
  }
  async snapshot(): Promise<ImageLibrarySnapshot> {
    await this.images.refresh();
    this.reconcileGroups();
    return {
      images: this.images.list(),
      folders: this.images.folders,
      sources: this.images.sources,
      groups: this.configuration.snapshot().groups,
      revision: this.options.settings.revision,
      error: this.images.error,
    };
  }
  async register() {
    this.options.writable();
    const parent = this.options.window();
    if (!parent || parent.isDestroyed())
      throw Error(this.text('services.imageLibraryHost.notReady'));
    const selected = await dialog.showOpenDialog(parent, {
      title: this.text('services.imageLibraryHost.registerTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: this.text('services.imageLibraryHost.imageFilter'),
          extensions:
            this.media === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'svg'] : audioExtensions,
        },
      ],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const source = selected.filePaths[0],
      stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > this.images.policy.maxBytes)
      throw Error(this.text('services.imageLibraryHost.sizeLimit'));
    this.options.writable();
    if (this.images.policy.validateFile)
      return (await this.images.addFile(source, path.basename(source), this.options.writable)).ref;
    return this.images.add(await fs.readFile(source), path.basename(source));
  }
  async edit(operation: ImageLibraryEdit, orderGroups?: readonly { id: string; name: string }[]) {
    this.configuration.edit(operation, orderGroups);
  }
  inUse(ref: RegisteredImageRef) {
    const contains = (value: unknown): boolean => {
      if (this.images.reference(value)) return imageKey(value) === imageKey(ref);
      return !!value && typeof value === 'object' && Object.values(value).some(contains);
    };
    return (
      Object.entries(this.options.settings.value).some(
        ([key, value]) => key !== `${this.media}Library` && contains(value),
      ) || !!this.options.referenced?.(ref)
    );
  }
  deletionTargets(entries: readonly RegisteredImageEntry[]): LibraryDeletionTarget[] {
    return entries.map(({ ref }) => {
      const file = path.resolve(this.images.file(ref.file));
      return { ref: { ...ref }, path: file, mode: file.startsWith('\\\\') ? 'permanent' : 'trash' };
    });
  }
  private checkDeletionTarget(entry: RegisteredImageEntry, target?: LibraryDeletionTarget) {
    if (!target) return;
    const current = this.deletionTargets([entry])[0];
    if (
      imageKey(current.ref) !== imageKey(target.ref) ||
      current.path !== target.path ||
      current.mode !== target.mode
    )
      throw Error(this.text('library.deleteTargetChanged'));
  }
  async remove(entry: RegisteredImageEntry, target?: LibraryDeletionTarget) {
    this.checkDeletionTarget(entry, target);
    await this.images.remove(entry.ref, entry.generation ?? '', {
      trash: (file) => {
        this.checkDeletionTarget(entry, target);
        if (target && path.resolve(file) !== target.path)
          throw Error(this.text('library.deleteTargetChanged'));
        return target?.mode === 'permanent' ? fs.unlink(file) : shell.trashItem(file);
      },
      failureMessage:
        target?.mode === 'permanent' ? this.text('library.permanentDeleteFailed') : undefined,
      restoreFailureMessage:
        target?.mode === 'permanent'
          ? this.text('library.permanentDeleteRestoreFailed')
          : undefined,
      prepare: () => {
        const store = this.options.settings;
        this.options.writable();
        if (this.inUse(entry.ref)) throw Error(this.text('services.imageLibraryHost.inUse'));
        const revision = store.revision;
        return () => {
          this.options.writable();
          if (store.revision !== revision || this.inUse(entry.ref))
            throw Error(this.text('services.imageLibraryHost.conflictRestored'));
          const next = this.configuration.snapshot();
          for (const group of next.groups)
            group.images = group.images.filter((r) => imageKey(r) !== imageKey(entry.ref));
          this.configuration.plan(next, revision).commit();
        };
      },
    });
  }
  async removeMany(entries: RegisteredImageEntry[], targets?: readonly LibraryDeletionTarget[]) {
    if (!entries.length) throw Error(this.text('images.selectImages'));
    if (targets && targets.length !== entries.length)
      throw Error(this.text('library.deleteTargetChanged'));
    // Preflight the whole host-owned confirmation before removing the first original.
    for (const [index, entry] of entries.entries()) {
      this.checkDeletionTarget(entry, targets?.[index]);
      this.images.assertWritable(entry.ref.file);
      if (this.inUse(entry.ref)) throw Error(this.text('services.imageLibraryHost.inUse'));
      await this.images.readFile(entry.ref, entry.generation ?? '');
    }
    let removed = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        await this.remove(entry, targets?.[index]);
        removed++;
      }
    } catch (e) {
      if (removed)
        throw Error(
          this.text('images.deletePartial', { count: removed, error: (e as Error).message }),
        );
      throw e;
    }
  }
  async rename(entries: RegisteredImageEntry[], names: string[], destinationFolder?: string) {
    for (const entry of entries) this.images.assertWritable(entry.ref.file);
    if (destinationFolder !== undefined) this.images.assertWritable(destinationFolder);
    if (this.filesBusy) throw Error(this.text('services.imageLibraryPage.busy'));
    this.filesBusy = true;
    try {
      return await renameImageFiles(
        this.images,
        entries,
        names,
        (mapping) => {
          this.options.writable();
          const check = () => {
            if (entries.some((entry) => this.inUse(entry.ref)))
              throw Error(this.text('services.imageLibraryHost.inUse'));
          };
          check();
          const next = this.configuration.snapshot();
          for (const group of next.groups)
            group.images = group.images.map((ref) => mapping.get(imageKey(ref)) ?? ref);
          const plan = this.configuration.plan(next, this.configuration.revision);
          return () => plan.commit(check);
        },
        destinationFolder,
      );
    } finally {
      this.filesBusy = false;
    }
  }
  async openFolder(folder: string) {
    let directory: string;
    try {
      directory = await this.images.folderDirectory(folder);
    } catch (e) {
      if (folder || (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      this.options.writable();
      directory = safeDirectory(this.images.directory, '', true);
    }
    const error = await shell.openPath(directory);
    if (error) throw Error(this.text('images.openFolderFailed'));
  }
  async fileAction(operation: ImageLibraryFileAction, entries: RegisteredImageEntry[]) {
    if (!entries.length) throw Error(this.text('images.selectImages'));
    if (!['copy-files', 'copy-paths', 'copy-image', 'copy-text', 'reveal'].includes(operation))
      throw Error('Invalid image operation');
    if (operation === 'copy-text') {
      if (this.media !== 'text') throw Error('Unsupported library action');
      const bodies: string[] = [];
      for (const entry of entries) {
        const read = await this.images.read(entry.ref, entry.generation ?? '');
        bodies.push(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes));
      }
      for (const entry of entries) await this.images.read(entry.ref, entry.generation ?? '');
      await clipboard.writeText(bodies.join('\r\n'));
      return;
    }
    if (operation === 'copy-image' && (this.media !== 'image' || entries.length !== 1))
      throw Error(this.text('images.copyImageSingle'));
    const files: string[] = [];
    for (const entry of entries) {
      if (operation !== 'copy-paths') await this.images.readFile(entry.ref, entry.generation ?? '');
      files.push(this.images.file(entry.ref.file));
    }
    if (operation === 'copy-paths') await clipboard.writeText(files.join('\r\n'));
    else if (operation === 'copy-files') await copyImageFiles(files);
    else if (operation === 'reveal') {
      // One Explorer window for each containing folder, even for large selections.
      const folders = new Set<string>();
      for (const file of files) {
        const folder = path.dirname(file).toLowerCase();
        if (!folders.has(folder)) {
          folders.add(folder);
          shell.showItemInFolder(file);
        }
      }
    } else {
      const saved = await this.images.readFile(entries[0].ref, entries[0].generation ?? '', {
        cachePreview: false,
      });
      const png = this.images.policy.validateFile
        ? Buffer.from(
            (
              await decodeRegisteredImageFile(saved.file, 0, saved.ref.file, undefined, saved.hash)
            ).thumbnail.split(',')[1],
            'base64',
          )
        : await registeredImageClipboardPng(saved.bytes!);
      await this.images.readFile(entries[0].ref, entries[0].generation ?? '', {
        cachePreview: false,
      });
      await clipboard.write([
        new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
      ]);
    }
  }
  private readImport(source: string, ahead: true): Promise<Buffer | undefined>;
  private readImport(source: string): Promise<Buffer>;
  private async readImport(source: string, ahead = false): Promise<Buffer | undefined> {
    this.options.writable();
    const handle = await fs.open(source, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > this.images.policy.maxBytes)
        throw Error(this.text('services.imageLibraryHost.sizeLimit'));
      // Larger sources are read on their own turn; a growing source cannot inflate read-ahead.
      if (ahead && stat.size > 512 * 1024) return;
      const bytes = Buffer.allocUnsafe(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length === stat.size) return bytes.subarray(0, length);
      if (!ahead) throw Error(this.text('services.registeredImages.changed'));
    } finally {
      await handle.close();
    }
  }
  async registerMany(folder = '') {
    this.images.assertWritable(folder);
    if (!imageFolder(folder)) throw Error(this.text('images.folderInvalid'));
    this.options.writable();
    const parent = this.options.window();
    if (!parent || parent.isDestroyed())
      throw Error(this.text('services.imageLibraryHost.notReady'));
    const selected = await dialog.showOpenDialog(parent, {
      title: this.text('services.imageLibraryHost.addTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: this.text('services.imageLibraryHost.imageFilter'),
          extensions:
            this.media === 'image'
              ? ['png', 'jpg', 'jpeg', 'webp', 'svg']
              : this.media === 'sound'
                ? audioExtensions
                : ['txt'],
        },
      ],
    });
    const results: {
      name: string;
      image?: RegisteredImageRef;
      reused?: boolean;
      error?: string;
    }[] = [];
    if (selected.canceled) return results;
    let index = 0;
    for await (const prepared of orderedReads(selected.filePaths, 2, (source) =>
      this.images.policy.validateFile ? Promise.resolve(undefined) : this.readImport(source, true),
    )) {
      const source = selected.filePaths[index++];
      const name = path.basename(source);
      try {
        this.options.writable();
        if (prepared.status === 'rejected') throw prepared.reason;
        const { ref: image, reused } = this.images.policy.validateFile
          ? await this.images.addFile(
              source,
              folder ? `${folder}/${name}` : name,
              this.options.writable,
            )
          : await this.images.addWithResult(
              prepared.value ?? (await this.readImport(source)),
              folder ? `${folder}/${name}` : name,
            );
        results.push({ name, image, reused });
      } catch (e) {
        results.push({
          name,
          error:
            e instanceof Error && !(e as NodeJS.ErrnoException).code
              ? e.message
              : this.text('services.imageLibraryHost.registrationFailed'),
        });
      }
    }
    return results;
  }
  pendingRequest() {
    return this.pending ? { id: this.pending.id, current: this.pending.current } : null;
  }
  async pick(current: unknown = null, alive?: () => boolean): Promise<ImagePickResult> {
    if (current !== null && !this.images.reference(current))
      throw Error(this.text('services.imageLibraryHost.invalidReference'));
    if (activePicker) throw Error(this.text('services.imageLibraryHost.pickerOpen'));
    activePicker = this;
    this.pickerAlive = alive;
    let restore: (() => void) | undefined;
    try {
      restore = await this.options.cover?.();
      this.options.show();
      if (alive && !alive()) return { cancelled: true };
      const window = this.options.window();
      if (!window || window.isDestroyed())
        throw Error(this.text('services.imageLibraryHost.pickerNotReady'));
      return await new Promise<ImagePickResult>((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(() => this.complete(id, { cancelled: true }), 10 * 60 * 1000);
        this.pending = { id, current: current as RegisteredImageRef | null, resolve, timer };
        window.webContents.send(
          this.media === 'image' ? 'dock:imagePick' : 'dock:soundPick',
          this.pendingRequest(),
        );
      });
    } finally {
      if (activePicker === this) activePicker = undefined;
      this.pickerAlive = undefined;
      restore?.();
    }
  }
  complete(id: string, result: ImagePickResult) {
    if (!this.pending || this.pending.id !== id)
      throw Error(this.text('services.imageLibraryHost.requestEnded'));
    if (
      !result ||
      typeof result.cancelled !== 'boolean' ||
      (!result.cancelled && result.image !== null && !this.images.reference(result.image))
    )
      throw Error(this.text('services.imageLibraryHost.invalidSelection'));
    const pending = this.pending;
    this.pending = undefined;
    const window = this.options.window();
    if (window && !window.isDestroyed())
      window.webContents.send(this.media === 'image' ? 'dock:imagePick' : 'dock:soundPick', null);
    clearTimeout(pending.timer);
    pending.resolve(result);
  }
  cancel() {
    if (this.pending) this.complete(this.pending.id, { cancelled: true });
  }
  reconcile(active: Set<string>) {
    if (this.pickerAlive && !this.pickerAlive()) this.cancel();
    for (const owner of this.generated.keys()) if (!active.has(owner)) void this.release(owner);
  }
  async release(owner: string) {
    const files = this.generated.get(owner);
    this.generated.delete(owner);
    for (const file of files ?? []) await fs.unlink(file).catch(() => {});
  }
  async copyToCache(
    manifest: ExtensionManifest,
    values: Record<string, unknown>,
    ref: unknown,
    dataRoot: string,
    variant: unknown = 'original',
    generation = '',
  ) {
    if (
      !this.images.reference(ref) ||
      this.media !== 'image' ||
      !ownsImage(manifest, values, ref) ||
      !['original', 'thumbnail'].includes(String(variant))
    )
      throw Error(this.text('services.imageLibraryHost.ownImageOnly'));
    const saved = await this.images.readFile(ref, undefined, { cachePreview: false });
    const directory = imageDirectory(dataRoot, manifest.id);
    if ((await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase())
      throw Error(this.text('services.imageLibraryHost.redirectedCache'));
    const output =
      variant === 'thumbnail'
        ? Buffer.from(
            (this.images.policy.validateFile
              ? await decodeRegisteredImageFile(
                  saved.file,
                  64,
                  saved.ref.file,
                  undefined,
                  saved.hash,
                )
              : await decodeRegisteredImage(saved.bytes!)
            ).thumbnail.split(',')[1],
            'base64',
          )
        : undefined;
    const hash = output ? createHash('sha256').update(output).digest('hex') : saved.hash;
    const owner = `${manifest.id}:${generation}`;
    const prefix = createHash('sha256').update(owner).digest('hex').slice(0, 16);
    const file = path.join(
      directory,
      `registered-${prefix}-${hash}${variant === 'thumbnail' ? '.png' : path.extname(ref.file)}`,
    );
    const temp = path.join(directory, `.${randomUUID()}.tmp`);
    try {
      if (output) await fs.writeFile(temp, output, { flag: 'wx' });
      else await fs.copyFile(saved.file, temp, fs.constants.COPYFILE_EXCL);
      if ((await fileHash(temp)) !== hash || !(await sameFileHash(saved.file, saved.hash)))
        throw Error(this.text('services.registeredImages.changed'));
      try {
        await fs.link(temp, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await sameFileHash(file, hash)))
          throw error;
      }
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    const files = this.generated.get(owner) ?? new Set<string>();
    files.add(file);
    this.generated.set(owner, files);
    return file;
  }
}

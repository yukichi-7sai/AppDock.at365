import { hostText } from '../../shared/i18n';
import { dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RegisteredImages } from './registered-images';
import type { SettingsStore } from './settings';
import {
  editImageLibrary,
  imageReference,
  imageKey,
  type ImageLibraryEdit,
  type ImageLibrarySnapshot,
  type RegisteredImageRef,
  type ImagePickResult,
} from '../../shared/registered-images';
import type { ExtensionManifest, SettingDefinition } from '../../shared/contracts';
import { objectFieldValue } from '../../shared/object-list';
import { imageDirectory } from './panel-images';

import { decodeRegisteredImage } from './registered-image-decoder';
export { decodeRegisteredImage } from './registered-image-decoder';

export function ownsImage(
  manifest: ExtensionManifest,
  values: Record<string, unknown>,
  ref: RegisteredImageRef,
) {
  const matches = (definition: SettingDefinition, value: unknown): boolean => {
    if (definition.type === 'registered-image')
      return imageReference(value) && imageKey(value) === imageKey(ref);
    if (definition.type !== 'object-list' || !Array.isArray(value)) return false;
    return value.some(
      (row) =>
        row &&
        typeof row === 'object' &&
        (definition.fields ?? []).some((field) => matches(field, objectFieldValue(row, field))),
    );
  };
  return (manifest.settings ?? []).some((d) =>
    matches(d, values[d.key] === undefined ? d.default : values[d.key]),
  );
}
export class ImageLibraryHost {
  private picking = false;
  private generated = new Map<string, Set<string>>();
  private pickerAlive?: () => boolean;
  private pending?: {
    id: string;
    current: RegisteredImageRef | null;
    resolve(result: ImagePickResult): void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(
    readonly images: RegisteredImages,
    private options: {
      settings: Pick<SettingsStore, 'value' | 'revision' | 'save'>;
      window(): BrowserWindow | null;
      writable(): void;
      show(): void;
      cover?(): Promise<() => void>;
      referenced?(ref: RegisteredImageRef): boolean;
    },
  ) {}
  async snapshot(): Promise<ImageLibrarySnapshot> {
    await this.images.refresh();
    return {
      images: this.images.list(),
      groups: this.options.settings.value.imageLibrary?.groups ?? [],
      revision: this.options.settings.revision,
      error: this.images.error,
    };
  }
  async register() {
    this.options.writable();
    const parent = this.options.window();
    if (!parent || parent.isDestroyed())
      throw Error(hostText('services.imageLibraryHost.notReady'));
    const selected = await dialog.showOpenDialog(parent, {
      title: hostText('services.imageLibraryHost.registerTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: hostText('services.imageLibraryHost.imageFilter'),
          extensions: ['png', 'jpg', 'jpeg', 'webp'],
        },
      ],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const source = selected.filePaths[0],
      stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024)
      throw Error(hostText('services.imageLibraryHost.sizeLimit'));
    this.options.writable();
    return this.images.add(await fs.readFile(source), path.basename(source));
  }
  async edit(operation: ImageLibraryEdit) {
    this.options.writable();
    const store = this.options.settings;
    store.save(
      { ...store.value, imageLibrary: editImageLibrary(store.value.imageLibrary, operation) },
      store.revision,
    );
  }
  inUse(ref: RegisteredImageRef) {
    const contains = (value: unknown): boolean => {
      if (imageReference(value)) return imageKey(value) === imageKey(ref);
      return !!value && typeof value === 'object' && Object.values(value).some(contains);
    };
    return (
      Object.entries(this.options.settings.value).some(
        ([key, value]) => key !== 'imageLibrary' && contains(value),
      ) || !!this.options.referenced?.(ref)
    );
  }
  async remove(entry: import('../../shared/registered-images').RegisteredImageEntry) {
    await this.images.remove(entry.ref, entry.generation ?? '', {
      trash: (file) => shell.trashItem(file),
      prepare: () => {
        const store = this.options.settings;
        this.options.writable();
        if (this.inUse(entry.ref)) throw Error(hostText('services.imageLibraryHost.inUse'));
        const revision = store.revision;
        return () => {
          this.options.writable();
          if (store.revision !== revision || this.inUse(entry.ref))
            throw Error(hostText('services.imageLibraryHost.conflictRestored'));
          if (
            store.value.imageLibrary?.groups.some((g) =>
              g.images.some((r) => imageKey(r) === imageKey(entry.ref)),
            )
          )
            store.save(
              {
                ...store.value,
                imageLibrary: {
                  groups: store.value.imageLibrary.groups.map((g) => ({
                    ...g,
                    images: g.images.filter((r) => imageKey(r) !== imageKey(entry.ref)),
                  })),
                },
              },
              revision,
            );
        };
      },
    });
  }
  async registerMany() {
    this.options.writable();
    const parent = this.options.window();
    if (!parent || parent.isDestroyed())
      throw Error(hostText('services.imageLibraryHost.notReady'));
    const selected = await dialog.showOpenDialog(parent, {
      title: hostText('services.imageLibraryHost.addTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: hostText('services.imageLibraryHost.imageFilter'),
          extensions: ['png', 'jpg', 'jpeg', 'webp'],
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
    for (const source of selected.filePaths) {
      const name = path.basename(source);
      try {
        this.options.writable();
        const stat = await fs.stat(source);
        if (!stat.isFile() || stat.size > 5 * 1024 * 1024)
          throw Error(hostText('services.imageLibraryHost.sizeLimit'));
        const { ref: image, reused } = await this.images.addWithResult(
          await fs.readFile(source),
          name,
        );
        results.push({ name, image, reused });
      } catch (e) {
        results.push({
          name,
          error:
            e instanceof Error && !(e as NodeJS.ErrnoException).code
              ? e.message
              : hostText('services.imageLibraryHost.registrationFailed'),
        });
      }
    }
    return results;
  }
  pendingRequest() {
    return this.pending ? { id: this.pending.id, current: this.pending.current } : null;
  }
  async pick(current: unknown = null, alive?: () => boolean): Promise<ImagePickResult> {
    if (current !== null && !imageReference(current))
      throw Error(hostText('services.imageLibraryHost.invalidReference'));
    if (this.picking) throw Error(hostText('services.imageLibraryHost.pickerOpen'));
    this.picking = true;
    this.pickerAlive = alive;
    let restore: (() => void) | undefined;
    try {
      restore = await this.options.cover?.();
      this.options.show();
      if (alive && !alive()) return { cancelled: true };
      const window = this.options.window();
      if (!window || window.isDestroyed())
        throw Error(hostText('services.imageLibraryHost.pickerNotReady'));
      return await new Promise<ImagePickResult>((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(() => this.complete(id, { cancelled: true }), 10 * 60 * 1000);
        this.pending = { id, current: current as RegisteredImageRef | null, resolve, timer };
        window.webContents.send('dock:imagePick', this.pendingRequest());
      });
    } finally {
      this.picking = false;
      this.pickerAlive = undefined;
      restore?.();
    }
  }
  complete(id: string, result: ImagePickResult) {
    if (!this.pending || this.pending.id !== id)
      throw Error(hostText('services.imageLibraryHost.requestEnded'));
    if (
      !result ||
      typeof result.cancelled !== 'boolean' ||
      (!result.cancelled && result.image !== null && !imageReference(result.image))
    )
      throw Error(hostText('services.imageLibraryHost.invalidSelection'));
    const pending = this.pending;
    this.pending = undefined;
    const window = this.options.window();
    if (window && !window.isDestroyed()) window.webContents.send('dock:imagePick', null);
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
      !imageReference(ref) ||
      !ownsImage(manifest, values, ref) ||
      !['original', 'thumbnail'].includes(String(variant))
    )
      throw Error(hostText('services.imageLibraryHost.ownImageOnly'));
    const { bytes } = await this.images.read(ref);
    const directory = imageDirectory(dataRoot, manifest.id);
    if ((await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase())
      throw Error(hostText('services.imageLibraryHost.redirectedCache'));
    const output =
      variant === 'thumbnail'
        ? Buffer.from((await decodeRegisteredImage(bytes)).thumbnail.split(',')[1], 'base64')
        : bytes;
    const owner = `${manifest.id}:${generation}`;
    const prefix = createHash('sha256').update(owner).digest('hex').slice(0, 16);
    const file = path.join(
      directory,
      `registered-${prefix}-${createHash('sha256').update(output).digest('hex')}${variant === 'thumbnail' ? '.png' : path.extname(ref.file)}`,
    );
    try {
      await fs.writeFile(file, output, { flag: 'wx' });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
        (await fs.lstat(file)).isSymbolicLink() ||
        !(await fs.readFile(file)).equals(output)
      )
        throw error;
    }
    const files = this.generated.get(owner) ?? new Set<string>();
    files.add(file);
    this.generated.set(owner, files);
    return file;
  }
}

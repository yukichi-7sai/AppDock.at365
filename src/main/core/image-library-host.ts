import { dialog, type BrowserWindow } from 'electron';
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
    if (!parent || parent.isDestroyed()) throw Error('画像の選択画面は準備中です。');
    const selected = await dialog.showOpenDialog(parent, {
      title: 'ライブラリーに画像を登録',
      properties: ['openFile'],
      filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const source = selected.filePaths[0],
      stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024)
      throw Error('画像は5MiB以下で指定してください。');
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
  pendingRequest() {
    return this.pending ? { id: this.pending.id, current: this.pending.current } : null;
  }
  async pick(current: unknown = null, alive?: () => boolean): Promise<ImagePickResult> {
    if (current !== null && !imageReference(current)) throw Error('画像の参照を確認してください。');
    if (this.picking) throw Error('開いている画像選択を終えてください。');
    this.picking = true;
    this.pickerAlive = alive;
    let restore: (() => void) | undefined;
    try {
      restore = await this.options.cover?.();
      this.options.show();
      if (alive && !alive()) return { cancelled: true };
      const window = this.options.window();
      if (!window || window.isDestroyed()) throw Error('画像選択は準備中です。');
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
    if (!this.pending || this.pending.id !== id) throw Error('画像選択の要求が終了しています。');
    if (
      !result ||
      typeof result.cancelled !== 'boolean' ||
      (!result.cancelled && result.image !== null && !imageReference(result.image))
    )
      throw Error('画像の選択結果を確認してください。');
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
      throw Error('自Appletの画像設定で参照している画像を指定してください。');
    const { bytes } = await this.images.read(ref);
    const directory = imageDirectory(dataRoot, manifest.id);
    if ((await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase())
      throw Error('画像キャッシュの保存先が転送されています。');
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

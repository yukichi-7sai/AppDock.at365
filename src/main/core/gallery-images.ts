import { hostText } from '../../shared/i18n';
import type { RegisteredImages } from './registered-images';
import { imageKey, type RegisteredImageRef } from '../../shared/registered-images';
import { decodeRegisteredImage } from './registered-image-decoder';

export interface GalleryImageSession {
  get(ref: RegisteredImageRef, generation: string, edge: number): Promise<string>;
  preview(ref: RegisteredImageRef, original?: boolean): Promise<string>;
  dispose(): void;
}
type Owner = {
  live: boolean;
  keys: Set<string>;
  preview?: { key: string; task: Promise<string> };
};
type CachedImage = { source: string; cost: number; owners: Set<Owner> };
type PendingImage = { task: Promise<string>; owners: Set<Owner> };

/** Shared derivatives live only while a requesting surface remains open. */
export class GalleryImages {
  private cache = new Map<string, CachedImage>();
  private pending = new Map<string, PendingImage>();
  private queue: Promise<void> = Promise.resolve();
  private bytes = 0;
  constructor(
    private images: RegisteredImages,
    private decode = decodeRegisteredImage,
  ) {}
  session(): GalleryImageSession {
    const owner: Owner = { live: true, keys: new Set() };
    const check = () => {
      if (!owner.live) throw Error(hostText('services.galleryImages.changed'));
    };
    return {
      get: async (ref, generation, edge) => {
        check();
        const source = await this.getOwned(owner, ref, generation, edge);
        check();
        return source;
      },
      preview: async (ref, original = false) => {
        check();
        await this.images.refresh();
        check();
        const entry = this.images.entry(ref);
        if (!entry?.available || !entry.generation)
          throw Error(hostText('services.galleryImages.changed'));
        const key = `${imageKey(ref)}:${entry.generation}:${original}`;
        if (owner.preview?.key === key) return owner.preview.task;
        const request = { key, task: undefined! as Promise<string> };
        owner.preview = request;
        request.task = (async () => {
          const saved = await this.images.read(ref, entry.generation, {
            cachePreview: false,
            active: () => owner.live && owner.preview === request,
          });
          check();
          if (!original) return saved.thumbnail;
          const extension = saved.ref.file.split('.').at(-1)!.toLowerCase();
          return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${saved.bytes.toString('base64')}`;
        })().catch((error) => {
          if (owner.preview === request) owner.preview = undefined;
          throw error;
        });
        return request.task;
      },
      dispose: () => {
        owner.live = false;
        owner.preview = undefined;
        for (const key of owner.keys) {
          const cached = this.cache.get(key);
          if (cached) {
            cached.owners.delete(owner);
            if (!cached.owners.size) this.remove(key);
          }
        }
        owner.keys.clear();
        for (const [key, job] of this.pending) {
          job.owners.delete(owner);
          if (!job.owners.size) this.pending.delete(key);
        }
      },
    };
  }
  /** One-shot callers do not leave cached pixels after their response. */
  async get(ref: RegisteredImageRef, generation: string, edge: number) {
    const session = this.session();
    try {
      return await session.get(ref, generation, edge);
    } finally {
      session.dispose();
    }
  }
  private remove(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return;
    this.bytes -= cached.cost;
    for (const owner of cached.owners) owner.keys.delete(key);
    this.cache.delete(key);
  }
  private retain(key: string, cached: CachedImage, owners: Iterable<Owner>) {
    for (const owner of owners)
      if (owner.live) {
        cached.owners.add(owner);
        owner.keys.add(key);
      }
  }
  private getOwned(owner: Owner, ref: RegisteredImageRef, generation: string, edge: number) {
    if (![512, 1024, 2048].includes(edge))
      return Promise.reject(Error(hostText('services.galleryImages.invalidSize')));
    const key = `${imageKey(ref)}:${generation}:${edge}`;
    const hash = this.images.contentHash(ref, generation);
    const contentKey = hash ? `${hash}:${edge}` : undefined;
    const cached = contentKey ? this.cache.get(contentKey) : undefined;
    if (cached) {
      this.retain(contentKey!, cached, [owner]);
      this.cache.delete(contentKey!);
      this.cache.set(contentKey!, cached);
      return Promise.resolve(cached.source);
    }
    const pending = this.pending.get(key);
    if (pending) {
      pending.owners.add(owner);
      return pending.task;
    }
    const owners = new Set([owner]);
    const active = () => [...owners].some((value) => value.live);
    const check = () => {
      if (!active()) throw Error(hostText('services.galleryImages.changed'));
    };
    const task = this.queue
      .then(async () => {
        check();
        const {
          bytes,
          hash,
          generation: currentGeneration,
        } = await this.images.read(ref, generation, {
          cachePreview: false,
          active,
        });
        check();
        if (currentGeneration !== generation)
          throw Error(hostText('services.galleryImages.changed'));
        const contentKey = `${hash}:${edge}`;
        const existing = this.cache.get(contentKey);
        if (existing) {
          this.retain(contentKey, existing, owners);
          return existing.source;
        }
        const image = await this.decode(bytes, edge);
        check();
        const current = this.images.entry(ref);
        if (!current?.available || current.generation !== generation)
          throw Error(hostText('services.galleryImages.changed'));
        const scale = Math.min(1, edge / Math.max(image.width, image.height));
        const cost =
          image.thumbnail.length * 2 +
          Math.ceil(image.width * scale) * Math.ceil(image.height * scale) * 4;
        while (this.bytes + cost > 64 * 1024 * 1024 && this.cache.size)
          this.remove(this.cache.keys().next().value!);
        if (cost <= 64 * 1024 * 1024) {
          const cached = { source: image.thumbnail, cost, owners: new Set<Owner>() };
          this.retain(contentKey, cached, owners);
          this.cache.set(contentKey, cached);
          this.bytes += cost;
        }
        return image.thumbnail;
      })
      .finally(() => {
        if (this.pending.get(key)?.task === task) this.pending.delete(key);
      });
    this.pending.set(key, { task, owners });
    // Never retain the last fulfilled image through the decoder queue.
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}

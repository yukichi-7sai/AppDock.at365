import { hostText } from '../../shared/i18n';
import { createHash } from 'node:crypto';
import type { RegisteredImages } from './registered-images';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { decodeRegisteredImage } from './registered-image-decoder';

/** Single decoder queue with content-addressed derivatives and a bounded memory budget. */
export class GalleryImages {
  private cache = new Map<string, { source: string; cost: number }>();
  private pending = new Map<string, Promise<string>>();
  private queue: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  constructor(private images: RegisteredImages) {}
  get(ref: RegisteredImageRef, generation: string, edge: number) {
    if (![512, 1024, 2048].includes(edge))
      return Promise.reject(Error(hostText('services.galleryImages.invalidSize')));
    const key = `${generation}:${edge}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached.source);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = this.queue
      .then(async () => {
        const { bytes } = await this.images.read(ref);
        if (createHash('sha256').update(bytes).digest('hex') !== generation)
          throw Error(hostText('services.galleryImages.changed'));
        const image = await decodeRegisteredImage(bytes, edge);
        const scale = Math.min(1, edge / Math.max(image.width, image.height));
        const cost =
          image.thumbnail.length * 2 +
          Math.ceil(image.width * scale) * Math.ceil(image.height * scale) * 4;
        while (this.bytes + cost > 64 * 1024 * 1024 && this.cache.size) {
          const oldest = this.cache.keys().next().value!;
          this.bytes -= this.cache.get(oldest)!.cost;
          this.cache.delete(oldest);
        }
        if (cost <= 64 * 1024 * 1024) {
          this.cache.set(key, { source: image.thumbnail, cost });
          this.bytes += cost;
        }
        return image.thumbnail;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    this.queue = task.catch(() => {});
    return task;
  }
}

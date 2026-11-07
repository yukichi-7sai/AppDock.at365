import { aiObject } from '../../shared/ai';
import { assetFilename } from '../../shared/asset-names';
import { libraryFolder, type LibraryRef } from '../../shared/library-assets';
import type { ImageRegistrationDestination } from '../../shared/image-ai';
import { imageFail } from './image-ai-adapter';
import type { RegisteredImages } from './registered-images';
import type { ImageLibraryHost } from './image-library-host';
import type { AssetRegistrationIntent } from './registered-assets';

export interface RegistrationImage {
  id: string;
  mimeType: string;
  byteLength: number;
  bytes?: Buffer;
  ref?: LibraryRef;
  generation?: string;
  grouped?: boolean;
  intent?: AssetRegistrationIntent;
  checkpoint?(): void;
}
export interface ImageRegistrar {
  verify?(image: RegistrationImage): Promise<boolean>;
  remove?(image: RegistrationImage): Promise<void>;
  restore?(image: RegistrationImage): Promise<void>;
  validate(value: unknown): ImageRegistrationDestination;
  save(
    image: RegistrationImage,
    destination: ImageRegistrationDestination,
    writable: () => void,
  ): Promise<void>;
}

/** Saves each generated payload once; group failures never cause a second file to be created. */
export class ImageRegistration implements ImageRegistrar {
  constructor(
    private files: RegisteredImages,
    private host: ImageLibraryHost,
  ) {}
  async verify(image: RegistrationImage) {
    if (!image.ref || !image.intent) return false;
    try {
      await this.restore(image);
      return true;
    } catch {
      return false;
    }
  }
  async remove(image: RegistrationImage) {
    if (!image.ref) return;
    const entry = this.files.entry(image.ref);
    if (!entry?.available) return;
    await this.restore(image);
    await this.host.removeMany([{ ...entry, generation: image.generation! }]);
  }
  async restore(image: RegistrationImage) {
    if (!image.intent) return;
    const saved = await this.files.recoverRegistration(image.intent);
    image.ref = saved.ref;
    image.generation = saved.generation;
  }
  validate(value: unknown): ImageRegistrationDestination {
    if (
      !aiObject(value) ||
      Object.keys(value).some((key) => !['folder', 'name', 'group'].includes(key)) ||
      !libraryFolder(value.folder) ||
      !this.files.canWrite(value.folder) ||
      (value.folder && !this.files.folders.includes(value.folder)) ||
      (value.name !== undefined &&
        (typeof value.name !== 'string' ||
          !value.name.trim() ||
          !assetFilename(value.name + '.webp'))) ||
      (value.group !== undefined &&
        (typeof value.group !== 'string' ||
          !this.host.configuration.snapshot().groups.some((group) => group.id === value.group)))
    )
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    this.host.assertWritable();
    return structuredClone(value) as unknown as ImageRegistrationDestination;
  }
  async save(
    image: RegistrationImage,
    destination: ImageRegistrationDestination,
    writable: () => void,
  ) {
    const check = () => {
      writable();
      this.host.assertWritable();
    };
    check();
    if (image.ref && image.intent) await this.restore(image);
    if (!image.ref) {
      this.validate(destination);
      if (!image.bytes) return imageFail('IMAGE_AI_RESULT_EXPIRED', 'expired');
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
        image.mimeType
      ];
      if (!extension) return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
      const filename =
        (destination.folder ? destination.folder + '/' : '') +
        (destination.name ?? 'generated-' + image.id) +
        '.' +
        extension;
      const saved = await this.files.addVerified(image.bytes, filename, {
        unique: true,
        writable: check,
        journal: image.checkpoint
          ? {
              intent: image.intent,
              prepare: (intent) => {
                image.intent = intent;
                image.checkpoint!();
              },
            }
          : undefined,
      });
      image.ref = saved.ref;
      image.generation = saved.generation;
      image.checkpoint?.();
    }
    if (destination.group && !image.grouped) {
      check();
      // Refuse stale references before applying membership to a replaced file.
      await this.files.read(image.ref, image.generation);
      check();
      const before = this.host.configuration
        .snapshot()
        .groups.filter((group) =>
          group.images.some((ref) => ref.file.toLowerCase() === image.ref!.file.toLowerCase()),
        )
        .map((group) => group.id);
      await this.host.edit({
        kind: 'membership',
        image: image.ref,
        before,
        ids: [...new Set([...before, destination.group])],
      });
    }
    image.grouped = true;
    image.checkpoint?.();
  }
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileHash, fileHashSync, sameFileHash } from './file-content';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { assignedImage, imageParent } from '../../shared/image-paths';
import { assetFile, safeDirectory } from './library-files';
import { libraryReference, type LibraryMedia } from '../../shared/library-assets';
import { validateSvg } from '../../shared/svg-image';
import { libraryText } from '../../shared/library-text';

/** Immutable copies, shared by content. They are never pruned from a partial settings view. */
export class AssignedAssets {
  readonly directory: string;
  constructor(
    readonly library: string,
    readonly media: LibraryMedia = 'image',
  ) {
    this.directory = path.join(
      path.dirname(library),
      media === 'image' ? 'assigned-images' : 'assigned-sounds',
    );
  }
  retain(ref: RegisteredImageRef, verifiedBytes?: Buffer): RegisteredImageRef {
    if (!libraryReference(ref, this.media)) throw Error('Invalid image reference');
    if (assignedImage(ref.file)) return ref;
    safeDirectory(this.library, imageParent(ref.file));
    const source = assetFile(this.library, ref.file, this.media);
    const before = fs.lstatSync(source);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      !before.size ||
      fs.realpathSync(source).toLowerCase() !== source.toLowerCase()
    )
      throw Error('Unsafe image source');
    const hash = fileHashSync(source);
    if (/\.svg$/i.test(ref.file)) validateSvg(fs.readFileSync(source, 'utf8'));
    const after = fs.lstatSync(source);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      (verifiedBytes && createHash('sha256').update(verifiedBytes).digest('hex') !== hash)
    )
      throw Error('Image changed before saving');
    const name = `${hash}${path.extname(ref.file).toLowerCase()}`;
    safeDirectory(this.directory, '', true);
    const file = path.join(this.directory, name);
    const verifyExisting = () => {
      const stat = fs.lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        fs.realpathSync(file).toLowerCase() !== file.toLowerCase() ||
        fileHashSync(file) !== hash
      )
        throw Error('Stored image differs from its content ID');
    };
    if (fs.existsSync(file)) verifyExisting();
    else {
      const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
      try {
        fs.copyFileSync(source, temp, fs.constants.COPYFILE_EXCL);
        if (fileHashSync(temp) !== hash || fileHashSync(source) !== hash)
          throw Error('Image changed before saving');
        try {
          fs.linkSync(temp, file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          verifyExisting();
        }
      } finally {
        fs.rmSync(temp, { force: true });
      }
    }
    return { file: `@assigned/${name}` };
  }
  async retainFile(ref: RegisteredImageRef, hash: string, writable: () => void) {
    if (!libraryReference(ref, this.media))
      throw Error(libraryText(this.media, 'services.registeredImages.invalidReference'));
    if (assignedImage(ref.file)) return ref;
    safeDirectory(this.library, imageParent(ref.file));
    const source = assetFile(this.library, ref.file, this.media);
    if (!(await sameFileHash(source, hash)))
      throw Error(libraryText(this.media, 'services.registeredImages.changed'));
    safeDirectory(this.directory, '', true);
    const name = hash + path.extname(ref.file).toLowerCase();
    const target = path.join(this.directory, name),
      temp = path.join(this.directory, `.${randomUUID()}.tmp`);
    try {
      await fsp.copyFile(source, temp, fs.constants.COPYFILE_EXCL);
      if ((await fileHash(temp)) !== hash || !(await sameFileHash(source, hash)))
        throw Error(libraryText(this.media, 'services.registeredImages.changed'));
      writable();
      try {
        await fsp.link(temp, target);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
          !(await sameFileHash(target, hash))
        )
          throw error;
      }
      return { file: `@assigned/${name}` };
    } finally {
      await fsp.unlink(temp).catch(() => {});
    }
  }
}

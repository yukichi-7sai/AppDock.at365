import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileHash, sameFileHash } from './file-content';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { assignedImage, imageParent } from '../../shared/image-paths';
import { assetFile, safeDirectory } from './library-files';
import { libraryReference, type LibraryMedia } from '../../shared/library-assets';
import { validateSvg } from '../../shared/svg-image';

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
      (this.media === 'image' && before.size > 5 * 1024 * 1024) ||
      fs.realpathSync(source).toLowerCase() !== source.toLowerCase()
    )
      throw Error('Unsafe image source');
    const bytes = fs.readFileSync(source);
    if (/\.svg$/i.test(ref.file)) validateSvg(bytes.toString('utf8'));
    const after = fs.lstatSync(source);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      (verifiedBytes && !verifiedBytes.equals(bytes))
    )
      throw Error('Image changed before saving');
    const name = `${createHash('sha256').update(bytes).digest('hex')}${path.extname(ref.file).toLowerCase()}`;
    safeDirectory(this.directory, '', true);
    const file = path.join(this.directory, name);
    const verifyExisting = () => {
      const stat = fs.lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        fs.realpathSync(file).toLowerCase() !== file.toLowerCase() ||
        !fs.readFileSync(file).equals(bytes)
      )
        throw Error('Stored image differs from its content ID');
    };
    if (fs.existsSync(file)) verifyExisting();
    else {
      const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
      const fd = fs.openSync(temp, 'wx');
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        try {
          fs.linkSync(temp, file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          verifyExisting();
        }
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          /* already closed */
        }
        fs.unlinkSync(temp);
      }
    }
    return { file: `@assigned/${name}` };
  }
  async retainFile(ref: RegisteredImageRef, hash: string, writable: () => void) {
    if (!libraryReference(ref, this.media)) throw Error('Invalid sound reference');
    if (assignedImage(ref.file)) return ref;
    safeDirectory(this.library, imageParent(ref.file));
    const source = assetFile(this.library, ref.file, this.media);
    if (!(await sameFileHash(source, hash))) throw Error('Sound changed before saving');
    safeDirectory(this.directory, '', true);
    const name = hash + path.extname(ref.file).toLowerCase();
    const target = path.join(this.directory, name),
      temp = path.join(this.directory, `.${randomUUID()}.tmp`);
    try {
      await fsp.copyFile(source, temp, fs.constants.COPYFILE_EXCL);
      if ((await fileHash(temp)) !== hash || !(await sameFileHash(source, hash)))
        throw Error('Sound changed before saving');
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

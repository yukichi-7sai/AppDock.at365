import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ExtensionManifest, SettingDefinition, Settings } from '../../shared/contracts';
import { imageReference, type RegisteredImageRef } from '../../shared/registered-images';
import { assignedImage, imageParent } from '../../shared/image-paths';
import { imageFile, safeDirectory } from './image-files';
import { validateSvg } from '../../shared/svg-image';
import { setObjectField } from '../../shared/object-list';

/** Immutable copies, shared by content. They are never pruned from a partial settings view. */
export class AssignedImages {
  readonly directory: string;
  constructor(readonly library: string) {
    this.directory = path.join(path.dirname(library), 'assigned-images');
  }
  retain(ref: RegisteredImageRef, verifiedBytes?: Buffer): RegisteredImageRef {
    if (!imageReference(ref)) throw Error('Invalid image reference');
    if (assignedImage(ref.file)) return ref;
    safeDirectory(this.library, imageParent(ref.file));
    const source = imageFile(this.library, ref.file);
    const before = fs.lstatSync(source);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      !before.size ||
      before.size > 5 * 1024 * 1024 ||
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
  prepare(next: Settings, previous: Settings, manifests: ExtensionManifest[]): Settings {
    const retain = (value: unknown, old: unknown) =>
      imageReference(value) && JSON.stringify(value) !== JSON.stringify(old)
        ? this.retain(value)
        : value;
    // Ribbon structures own their image fields. Other arbitrary JSON is not an image setting.
    const ribbon = (value: any, old: any): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++)
          ribbon(
            value[i],
            value[i]?.id ? old?.find?.((item: any) => item.id === value[i].id) : old?.[i],
          );
      } else
        for (const key of Object.keys(value)) {
          if (key === 'image') value[key] = retain(value[key], old?.[key]);
          else ribbon(value[key], old?.[key]);
        }
    };
    ribbon(next.ribbon, previous.ribbon);
    const fields = (definitions: SettingDefinition[], value: any, old: any) => {
      if (!value || typeof value !== 'object') return;
      for (const definition of definitions) {
        const stored = (input: any) =>
          (definition.propertyPath ?? [definition.key]).reduce(
            (entry, key) =>
              entry && typeof entry === 'object' && Object.hasOwn(entry, key)
                ? entry[key]
                : undefined,
            input,
          );
        const current = stored(value),
          previous = stored(old);
        if (definition.type === 'registered-image' && current !== undefined)
          setObjectField(value, definition, retain(current, previous));
        if (definition.type === 'object-list' && Array.isArray(current))
          for (const [i, row] of current.entries())
            fields(
              definition.fields ?? [],
              row,
              row?.id ? previous?.find?.((entry: any) => entry.id === row.id) : previous?.[i],
            );
      }
    };
    for (const manifest of manifests)
      fields(
        manifest.settings ?? [],
        next.extensions[manifest.id]?.settings,
        previous.extensions[manifest.id]?.settings,
      );
    return next;
  }
}

import { libraryText } from '../../shared/library-text';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assignedImage, imageBasename, imageParent } from '../../shared/image-paths';
import {
  imageKey,
  type RegisteredImageEntry,
  type RegisteredImageRef,
} from '../../shared/registered-images';
import { safeDirectory } from './library-files';
import type { RegisteredAssets } from './registered-assets';

/** Exclusive links support swaps and case-only renames without ever replacing a destination. */
export async function renameLibraryFiles(
  images: RegisteredAssets,
  entries: RegisteredImageEntry[],
  names: string[],
  prepare: (mapping: Map<string, RegisteredImageRef>) => () => void,
  destinationFolder?: string,
) {
  const text = (key: string, values?: Record<string, string | number>) =>
    libraryText(images.policy.media, key, values);
  if (
    !entries.length ||
    names.length !== entries.length ||
    new Set(entries.map((e) => imageKey(e.ref))).size !== entries.length
  )
    throw Error(text('images.renameInvalid'));
  const tasks = entries.map((entry, i) => {
    const name = names[i],
      parent = destinationFolder ?? imageParent(entry.ref.file);
    if (
      typeof name !== 'string' ||
      name !== imageBasename(name) ||
      !images.validName(name) ||
      assignedImage(entry.ref.file) ||
      path.extname(name).toLowerCase() !== path.extname(entry.ref.file).toLowerCase()
    )
      throw Error(text('images.renameInvalid'));
    const ref = { file: parent ? parent + '/' + name : name };
    return {
      entry,
      ref,
      source: images.file(entry.ref.file),
      target: images.file(ref.file),
      stage: path.join(safeDirectory(images.directory, parent), `.appdock-rename-${randomUUID()}`),
      bytes: Buffer.alloc(0) as Buffer,
      staged: false,
      removed: false,
      created: false,
    };
  });
  if (new Set(tasks.map((t) => imageKey(t.ref))).size !== tasks.length)
    throw Error(text('images.renameDuplicate'));
  const mapping = new Map(tasks.map((t) => [imageKey(t.entry.ref), t.ref]));
  const changed = tasks.filter((t) => t.entry.ref.file !== t.ref.file);
  const sources = new Set(changed.map((t) => imageKey(t.entry.ref)));
  for (const task of tasks) {
    if (!task.entry.generation) throw Error(text('services.registeredImages.changed'));
    task.bytes = (await images.read(task.entry.ref, task.entry.generation)).bytes;
    if (changed.includes(task) && !sources.has(imageKey(task.ref))) {
      const exists = await fs.lstat(task.target).then(
        () => true,
        (e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return false;
          throw e;
        },
      );
      if (exists) throw Error(text('images.renameDuplicate'));
    }
  }
  const commit = prepare(mapping);
  const same = async (file: string, bytes: Buffer) => {
    const stat = await fs.lstat(file);
    return stat.isFile() && !stat.isSymbolicLink() && (await fs.readFile(file)).equals(bytes);
  };
  let completed = false;
  try {
    for (const task of changed) {
      await fs.link(task.source, task.stage);
      task.staged = true;
    }
    for (const task of changed) {
      const [source, stage] = await Promise.all([fs.lstat(task.source), fs.lstat(task.stage)]);
      if (
        source.ino !== stage.ino ||
        source.dev !== stage.dev ||
        !(await same(task.source, task.bytes))
      )
        throw Error(text('services.registeredImages.changed'));
      await fs.unlink(task.source);
      task.removed = true;
    }
    for (const task of changed) {
      await fs.link(task.stage, task.target);
      task.created = true;
    }
    for (const task of changed)
      if (!(await same(task.target, task.bytes)))
        throw Error(text('services.registeredImages.changed'));
    commit();
    completed = true;
    return tasks.map((t) => t.ref);
  } catch (error) {
    let restored = true;
    for (const task of [...changed].reverse()) {
      if (task.created) {
        try {
          const [current, stage] = await Promise.all([fs.lstat(task.target), fs.lstat(task.stage)]);
          if (
            current.ino !== stage.ino ||
            current.dev !== stage.dev ||
            !(await same(task.target, task.bytes))
          )
            throw Error('changed');
          await fs.unlink(task.target);
        } catch {
          restored = false;
        }
      }
    }
    for (const task of changed) {
      if (task.removed) {
        try {
          await fs.writeFile(task.source, task.bytes, { flag: 'wx' });
        } catch {
          if (!(await same(task.source, task.bytes).catch(() => false))) restored = false;
        }
      }
    }
    if (!restored) throw Error(text('images.renameRestoreFailed'));
    throw error;
  } finally {
    // Stages are our exclusive recovery links; don't remove a link whose contents changed.
    for (const task of changed) {
      if (task.staged && (completed || (await same(task.stage, task.bytes).catch(() => false))))
        await fs.unlink(task.stage).catch(() => {});
    }
    await images.refresh(true);
  }
}

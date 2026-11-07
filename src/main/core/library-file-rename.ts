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
import { sameFileHash } from './file-content';

/** Exclusive links support swaps and case-only renames without ever replacing a destination. */
export async function renameLibraryFiles(
  images: RegisteredAssets,
  entries: RegisteredImageEntry[],
  names: string[],
  prepare: (mapping: Map<string, RegisteredImageRef>) => () => void,
  destinationFolder?: string,
) {
  for (const entry of entries) images.assertWritable(entry.ref.file);
  if (destinationFolder !== undefined) images.assertWritable(destinationFolder);
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
      stage: path.join(
        safeDirectory(images.folderTarget(parent).root, images.folderTarget(parent).relative),
        `.appdock-rename-${randomUUID()}`,
      ),
      bytes: Buffer.alloc(0) as Buffer,
      hash: '',
      backup: images.policy.validateFile
        ? path.join(path.dirname(images.file(entry.ref.file)), `.appdock-recovery-${randomUUID()}`)
        : undefined,
      staged: false,
      removed: false,
      created: false,
      copied: false,
      identity: '',
    };
  });
  if (new Set(tasks.map((t) => imageKey(t.ref))).size !== tasks.length)
    throw Error(text('images.renameDuplicate'));
  const mapping = new Map(tasks.map((t) => [imageKey(t.entry.ref), t.ref]));
  const changed = tasks.filter((t) => t.entry.ref.file !== t.ref.file);
  const sources = new Set(changed.map((t) => imageKey(t.entry.ref)));
  for (const task of tasks) {
    if (!task.entry.generation) throw Error(text('services.registeredImages.changed'));
    const saved = await images.readFile(task.entry.ref, task.entry.generation, {
      cachePreview: false,
    });
    task.hash = saved.hash;
    task.bytes = saved.bytes ?? Buffer.alloc(0);
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
  const check = () => {
    for (const task of tasks) {
      if (
        images.file(task.entry.ref.file) !== task.source ||
        images.file(task.ref.file) !== task.target
      )
        throw Error(text('services.registeredImages.changed'));
      images.assertWritable(task.entry.ref.file);
      images.assertWritable(task.ref.file);
      for (const folder of [imageParent(task.entry.ref.file), imageParent(task.ref.file)]) {
        const target = images.folderTarget(folder);
        safeDirectory(target.root, target.relative);
      }
    }
  };
  const same = (file: string, task: (typeof tasks)[number]) => sameFileHash(file, task.hash);
  let completed = false;
  let restored = true;
  try {
    for (const task of changed)
      if (task.backup) {
        check();
        await fs.copyFile(task.source, task.backup, fs.constants.COPYFILE_EXCL);
        if (!(await same(task.backup, task)))
          throw Error(text('services.registeredImages.changed'));
      }
    for (const task of changed) {
      check();
      const original = await fs.lstat(task.source, { bigint: true });
      task.identity = `${original.dev}:${original.ino}`;
      try {
        await fs.link(task.source, task.stage);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        check();
        await fs.copyFile(task.source, task.stage, fs.constants.COPYFILE_EXCL);
        task.copied = true;
      }
      task.staged = true;
    }
    for (const task of changed) {
      const [source, stage] = await Promise.all([
        fs.lstat(task.source, { bigint: true }),
        fs.lstat(task.stage, { bigint: true }),
      ]);
      if (
        `${source.dev}:${source.ino}` !== task.identity ||
        (!task.copied && (source.ino !== stage.ino || source.dev !== stage.dev)) ||
        !(await same(task.source, task)) ||
        !(await same(task.stage, task))
      )
        throw Error(text('services.registeredImages.changed'));
      check();
      await fs.unlink(task.source);
      task.removed = true;
    }
    for (const task of changed) {
      check();
      await fs.link(task.stage, task.target);
      task.created = true;
    }
    for (const task of changed)
      if (!(await same(task.target, task))) throw Error(text('services.registeredImages.changed'));
    check();
    commit();
    completed = true;
    return tasks.map((t) => t.ref);
  } catch (error) {
    for (const task of [...changed].reverse()) {
      if (task.created) {
        try {
          const [current, stage] = await Promise.all([fs.lstat(task.target), fs.lstat(task.stage)]);
          if (
            current.ino !== stage.ino ||
            current.dev !== stage.dev ||
            !(await same(task.target, task))
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
          if (task.backup) {
            if (!(await same(task.backup, task))) throw Error('Recovery file changed');
            await fs.copyFile(task.backup, task.source, fs.constants.COPYFILE_EXCL);
          } else await fs.writeFile(task.source, task.bytes, { flag: 'wx' });
        } catch {
          if (!(await same(task.source, task).catch(() => false))) restored = false;
        }
      }
    }
    if (!restored) throw Error(text('images.renameRestoreFailed'));
    throw error;
  } finally {
    // Stages are our exclusive recovery links; don't remove a link whose contents changed.
    for (const task of changed) {
      if (task.staged && (completed || (await same(task.stage, task).catch(() => false))))
        await fs.unlink(task.stage).catch(() => {});
      if (task.backup && (completed || restored)) await fs.unlink(task.backup).catch(() => {});
    }
    await images.refreshRoots(tasks.flatMap((task) => [task.entry.ref.file, task.ref.file]));
  }
}

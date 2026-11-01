import fs from 'node:fs';
import { hostText } from '../../shared/i18n';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { assignedImage, imageFolder, imagePath } from '../../shared/image-paths';

export function imageFile(root: string, name: string) {
  if (!imagePath(name)) throw Error('Invalid image path');
  return assignedImage(name)
    ? path.join(path.dirname(root), 'assigned-images', name.slice('@assigned/'.length))
    : path.join(root, ...name.split('/'));
}
export function safeDirectory(root: string, relative: string, create = false) {
  if (!imageFolder(relative)) throw Error('Invalid image folder');
  const parts = relative ? relative.split('/') : [];
  let current = path.resolve(root);
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    if (create && !fs.existsSync(current)) {
      let ancestor = path.dirname(current);
      while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
        ancestor = path.dirname(ancestor);
      if (
        fs.lstatSync(ancestor).isSymbolicLink() ||
        fs.realpathSync(ancestor).toLowerCase() !== ancestor.toLowerCase()
      )
        throw Error(hostText('services.registeredImages.redirectedDirectory'));
      fs.mkdirSync(current, { recursive: !part });
    }
    const stat = fs.lstatSync(current);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(current).toLowerCase() !== current.toLowerCase()
    )
      throw Error(hostText('services.registeredImages.redirectedDirectory'));
  }
  return current;
}
export async function scanImageTree(root: string) {
  const files: string[] = [],
    folders: string[] = [''];
  async function visit(folder: string) {
    const directory = safeDirectory(root, folder);
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const name = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && imageFolder(name)) {
        folders.push(name);
        await visit(name);
      } else if (entry.isFile() && imagePath(name) && !assignedImage(name)) files.push(name);
    }
  }
  await visit('');
  return { files, folders: folders.sort((a, b) => a.localeCompare(b, 'ja')) };
}

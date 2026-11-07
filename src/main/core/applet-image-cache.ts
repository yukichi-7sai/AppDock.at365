import fs from 'node:fs';
import path from 'node:path';

/** Shared local image cache used by Applet page registration. */
export function imageDirectory(root: string, id: string) {
  const folder = path.join(root, 'cache', 'panel-images', id);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

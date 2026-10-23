import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Panel } from '../../shared/contracts';

export function imageDirectory(root: string, id: string) {
  const folder = path.join(root, 'cache', 'panel-images', id);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}
export function registerLocalImages(panel: Panel, root: string, id: string): Panel {
  const images = panel.images?.map((item) => {
    if (!item.imageFile) return item;
    const file = fs.realpathSync(item.imageFile);
    const base = fs.realpathSync(imageDirectory(root, id));
    const relative = path.relative(base, file);
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !/\.(png|jpe?g|webp)$/i.test(file) ||
      !fs.statSync(file).isFile()
    )
      throw new Error(hostText('services.panelImages.cachePath'));
    return {
      ...item,
      imageFile: file,
      image: `appdock://host/panel-images/${id}/${createHash('sha256').update(file).digest('hex')}`,
    };
  });
  return { ...panel, ...(images ? { images } : {}) };
}

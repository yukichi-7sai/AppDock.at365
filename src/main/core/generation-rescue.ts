import fs from 'node:fs';
import path from 'node:path';
import { dialog } from 'electron';
import { hostText } from '../../shared/i18n';

/** Explicit user-selected rescue copy. Never removes or overwrites the retained original. */
export async function rescueGeneration(results: { id: string; mimeType: string; bytes: Buffer }[]) {
  const choice = await dialog.showOpenDialog({
    title: hostText('generationJobs.export'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (choice.canceled || !choice.filePaths[0]) return false;
  for (const result of results) {
    if (!/^[a-f0-9-]{36}$/.test(result.id) || !Buffer.isBuffer(result.bytes))
      throw Error(hostText('generationJobs.storageFailed'));
    const extension =
      (
        {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
          'audio/wav': 'wav',
        } as Record<string, string>
      )[result.mimeType] ?? 'bin';
    let file = path.join(choice.filePaths[0], `generated-${result.id}.${extension}`),
      serial = 1;
    while (fs.existsSync(file))
      file = path.join(choice.filePaths[0], `generated-${result.id}-${serial++}.${extension}`);
    const fd = fs.openSync(file, 'wx');
    try {
      fs.writeFileSync(fd, result.bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  return true;
}

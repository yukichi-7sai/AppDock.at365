import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

const maximumBytes = 4 * 1024 * 1024;

parentPort!.on('message', ({ id, file }: { id: number; file: string }) => {
  try {
    // Open, read and close in this thread. A synchronous save on the main thread
    // must not prevent the reader from releasing a Windows replacement lock.
    const fd = fs.openSync(file, 'r');
    let text: string;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > maximumBytes)
        throw Object.assign(Error('Invalid observed file'), { code: 'EFBIG' });
      // Bound the read even if a different process grows the file after fstat.
      const bytes = Buffer.alloc(Math.min(stat.size + 1, maximumBytes + 1));
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length > maximumBytes || length === bytes.length)
        throw Object.assign(Error('Observed file changed while reading'), { code: 'EFBIG' });
      text = bytes.toString('utf8', 0, length);
    } finally {
      fs.closeSync(fd);
    }
    parentPort!.postMessage({ id, text });
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    parentPort!.postMessage({ id, error: { message: e.message, code: e.code } });
  }
});

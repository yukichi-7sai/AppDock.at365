import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

parentPort!.on('message', ({ id, file }: { id: number; file: string }) => {
  try {
    // Open, read and close in this thread. A synchronous save on the main thread
    // must not prevent the reader from releasing a Windows replacement lock.
    const fd = fs.openSync(file, 'r');
    let text: string;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw Error('Invalid observed file');
      // Read a snapshot plus one byte to detect concurrent growth. The observer
      // rechecks identity and metadata before publishing the complete value.
      const bytes = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(
          fd,
          bytes,
          length,
          Math.min(64 * 1024, bytes.length - length),
          null,
        );
        if (!count) break;
        length += count;
      }
      if (length === bytes.length) throw Error('Observed file changed while reading');
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

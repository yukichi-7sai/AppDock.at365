import fs from 'node:fs';

/** Windows readers can briefly deny replacement. Retry only the already-flushed file,
 * checking for intervening writers before each attempt. After 150 ms of backoff,
 * return the failure to the caller instead of freezing the main thread indefinitely.
 * This is not a lifetime limit for the data; the caller retains recovery data. */
export function atomicReplaceSync(source: string, target: string, check: () => void) {
  for (let attempt = 0; ; attempt++) {
    check();
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        attempt >= 3 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')
      )
        throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';

/** Read twice before applying a sync write; polling also covers missed events and resume. */
export function observeFile(
  file: string,
  accept: (text: string) => void,
  failed: (error: Error) => void,
) {
  let closed = false,
    candidate: string | undefined,
    applied: string | undefined;
  let lastError = '',
    timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (closed) return;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
        throw Error(hostText('services.fileObserver.invalidFile'));
      const text = fs.readFileSync(file, 'utf8');
      if (text !== candidate) {
        candidate = text;
        clearTimeout(timer);
        timer = setTimeout(check, 180);
        return;
      }
      if (text !== applied) {
        accept(text);
        applied = text;
      }
      lastError = '';
    } catch (error) {
      applied = undefined;
      const e = error instanceof Error ? error : new Error(String(error));
      if (lastError !== e.message) failed(e);
      lastError = e.message;
    }
  };
  const poll = setInterval(check, 2000);
  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(path.dirname(file), (_, name) => {
      if (name && name.toString() !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(check, 100);
    });
    watcher.on('error', failed);
  } catch (error) {
    failed(error instanceof Error ? error : new Error(String(error)));
  }
  timer = setTimeout(check, 100);
  return {
    check,
    // A caller can validate a file directly before the observer sees the healthy interval.
    resetError() {
      lastError = '';
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(poll);
      watcher?.close();
    },
  };
}

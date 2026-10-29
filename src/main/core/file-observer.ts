import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { readObservedFile } from './file-reader';

const pollInterval = 60000;
const fullCheckInterval = 5 * pollInterval;
const stableInterval = 180;
const maximumBytes = 4 * 1024 * 1024;
const signature = (stat: fs.BigIntStats) =>
  [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(
    ':',
  );

/** Watch for updates; asynchronous metadata polling covers missed events and resume. */
export function observeFile(
  file: string,
  accept: (text: string) => void,
  failed: (error: Error) => void,
) {
  let closed = false,
    candidate: string | undefined,
    applied: string | undefined;
  let candidateSince = 0,
    lastFullCheck = 0,
    acceptedSignature: string | undefined,
    generation = 0,
    pending = false;
  let checking: Promise<void> | undefined;
  let watcher: fs.FSWatcher | undefined, watchedDirectory: string | undefined;
  let lastWatchError = '',
    lastError = '',
    timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), delay);
  };
  const report = (error: unknown) => {
    applied = undefined;
    candidate = undefined;
    acceptedSignature = undefined;
    const e = error instanceof Error ? error : new Error(String(error));
    if (lastError !== e.message) failed(e);
    lastError = e.message;
  };
  const reportWatchError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message === lastWatchError) return;
    lastWatchError = message;
    report(error);
  };
  const read = async (force: boolean) => {
    if (closed) return;
    const currentGeneration = generation;
    try {
      if (watchedDirectory !== path.dirname(file)) watchDirectory(path.dirname(file));
      const stat = await fs.promises.stat(file, { bigint: true });
      if (closed || currentGeneration !== generation) return;
      if (!stat.isFile() || stat.size > maximumBytes)
        throw Error(hostText('services.fileObserver.invalidFile'));
      const metadata = signature(stat);
      // Events always read bytes, even when a synchronizer preserves size and timestamps.
      // A slower full check also covers filesystems with unreliable metadata and notifications.
      if (
        !force &&
        !lastError &&
        metadata === acceptedSignature &&
        Date.now() - lastFullCheck < fullCheckInterval
      )
        return;
      const text = await readObservedFile(file);
      if (closed || currentGeneration !== generation) return;
      if (Buffer.byteLength(text, 'utf8') > maximumBytes)
        throw Error(hostText('services.fileObserver.invalidFile'));
      const after = await fs.promises.stat(file, { bigint: true });
      if (closed || currentGeneration !== generation) return;
      if (signature(after) !== metadata) {
        candidate = undefined;
        schedule(stableInterval);
        return;
      }
      if (text !== candidate) {
        candidate = text;
        candidateSince = performance.now();
        schedule(stableInterval);
        return;
      }
      const remaining = stableInterval - (performance.now() - candidateSince);
      if (remaining > 0) {
        schedule(Math.ceil(remaining));
        return;
      }
      if (text !== applied) {
        accept(text);
        if (closed || currentGeneration !== generation) return;
        applied = text;
      }
      acceptedSignature = metadata;
      lastFullCheck = Date.now();
      lastError = '';
    } catch (error) {
      if (!closed && currentGeneration === generation)
        report(
          (error as NodeJS.ErrnoException).code === 'EFBIG'
            ? Error(hostText('services.fileObserver.invalidFile'))
            : error,
        );
    }
  };
  const check = (force = true): Promise<void> => {
    if (closed) return Promise.resolve();
    if (checking) {
      pending ||= force;
      return checking;
    }
    checking = (async () => {
      do {
        pending = false;
        await read(force);
        force = true;
      } while (pending && !closed);
    })().finally(() => {
      checking = undefined;
    });
    return checking;
  };
  const poll = setInterval(() => void check(false), pollInterval);
  function watchDirectory(directory: string): void {
    try {
      const next = fs.watch(directory, (_, name) => {
        if (closed) return;
        if (directory === path.dirname(file) && name) {
          const changed = name.toString();
          const expected = path.basename(file);
          if (
            process.platform === 'win32'
              ? changed.toLowerCase() !== expected.toLowerCase()
              : changed !== expected
          )
            return;
        }
        generation++;
        schedule(100);
      });
      next.on('error', (error) => {
        if (closed || watcher !== next) return;
        next.close();
        watcher = undefined;
        watchedDirectory = undefined;
        reportWatchError(error);
        schedule(100);
      });
      watcher?.close();
      watcher = next;
      watchedDirectory = directory;
      lastWatchError = '';
    } catch (error) {
      const parent = path.dirname(directory);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && parent !== directory) {
        // Shared rosters may not exist at startup. Watch their nearest existing ancestor
        // until the real parent arrives, so the first file does not wait for a poll.
        if (watchedDirectory !== parent) watchDirectory(parent);
      } else reportWatchError(error);
    }
  }
  watchDirectory(path.dirname(file));
  schedule(100);
  return {
    check,
    // A synchronous owner read/save supersedes work started against the previous file.
    invalidate(currentText?: string) {
      if (closed) return;
      generation++;
      candidate = applied = currentText;
      candidateSince = performance.now() - stableInterval;
      acceptedSignature = undefined;
      schedule(100);
    },
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

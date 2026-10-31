import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { readObservedFile } from './file-reader';
import type { FileWatchAssistance } from './file-watch-assistance';

const stableInterval = 180;
const maximumBytes = 4 * 1024 * 1024;
const signature = (stat: fs.BigIntStats) =>
  [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(
    ':',
  );

/** Native changes and optional shared reconciliation use the same serialized reader. */
export function observeFile(
  file: string,
  accept: (text: string) => void,
  failed: (error: Error) => void,
  assistance?: FileWatchAssistance,
) {
  let closed = false,
    candidate: string | undefined,
    applied: string | undefined;
  let candidateSince = 0,
    generation = 0,
    pending = false;
  let checkingGeneration = 0;
  let checking: Promise<void> | undefined;
  let finishStability: (() => void) | undefined;
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
  const read = async (signal?: AbortSignal): Promise<number | undefined> => {
    if (closed || signal?.aborted) return;
    const currentGeneration = generation;
    try {
      if (watchedDirectory !== path.dirname(file)) watchDirectory(path.dirname(file));
      const stat = await fs.promises.stat(file, { bigint: true });
      if (closed || signal?.aborted || currentGeneration !== generation) return;
      if (!stat.isFile() || stat.size > maximumBytes)
        throw Error(hostText('services.fileObserver.invalidFile'));
      const metadata = signature(stat);
      const text = await readObservedFile(file);
      if (closed || signal?.aborted || currentGeneration !== generation) return;
      if (Buffer.byteLength(text, 'utf8') > maximumBytes)
        throw Error(hostText('services.fileObserver.invalidFile'));
      const after = await fs.promises.stat(file, { bigint: true });
      if (closed || signal?.aborted || currentGeneration !== generation) return;
      if (signature(after) !== metadata) {
        candidate = undefined;
        return stableInterval;
      }
      if (text !== candidate) {
        candidate = text;
        candidateSince = performance.now();
        return stableInterval;
      }
      const remaining = stableInterval - (performance.now() - candidateSince);
      if (remaining > 0) {
        return Math.ceil(remaining);
      }
      if (text !== applied) {
        accept(text);
        if (closed || currentGeneration !== generation) return;
        applied = text;
      }
      lastError = '';
    } catch (error) {
      if (!closed && !signal?.aborted && currentGeneration === generation)
        report(
          (error as NodeJS.ErrnoException).code === 'EFBIG'
            ? Error(hostText('services.fileObserver.invalidFile'))
            : error,
        );
    }
  };
  const waitStable = (delay: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(stabilityTimer);
        signal?.removeEventListener('abort', finish);
        if (finishStability === finish) finishStability = undefined;
        resolve();
      };
      const stabilityTimer = setTimeout(finish, delay);
      finishStability = finish;
      signal?.addEventListener('abort', finish, { once: true });
      if (closed || signal?.aborted) finish();
    });
  const check = (signal?: AbortSignal): Promise<void> => {
    if (closed || signal?.aborted) return Promise.resolve();
    if (checking) {
      pending ||= checkingGeneration !== generation;
      return checking;
    }
    checkingGeneration = generation;
    pending = false;
    checking = (async () => {
      const delay = await read(signal);
      if (delay !== undefined && !closed && !signal?.aborted) {
        await waitStable(delay, signal);
        const nextDelay = await read(signal);
        // A shared check completes one attempt; native reception may continue stabilizing.
        if (nextDelay !== undefined && !signal && !closed) schedule(nextDelay);
      }
    })().finally(() => {
      checking = undefined;
      if (pending && !closed) void check();
    });
    return checking;
  };
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
        generation++;
        reportWatchError(error);
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
  const unregister = assistance?.register(
    'file:' + path.resolve(file).toLowerCase(),
    ({ signal }) => check(signal),
  );
  return {
    check,
    // A synchronous owner read/save supersedes work started against the previous file.
    invalidate(currentText?: string) {
      if (closed) return;
      generation++;
      candidate = applied = currentText;
      candidateSince = performance.now() - stableInterval;
      schedule(100);
    },
    // A caller can validate a file directly before the observer sees the healthy interval.
    resetError() {
      lastError = '';
    },
    close() {
      closed = true;
      clearTimeout(timer);
      unregister?.();
      finishStability?.();
      watcher?.close();
    },
  };
}

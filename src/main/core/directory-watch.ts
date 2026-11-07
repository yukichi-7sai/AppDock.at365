import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

type Changed = (event: string, filename: string | Buffer | null) => void;
export interface DirectoryWatcher {
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
  close(): void;
  ready?: Promise<void>;
}
interface Registration {
  id: string;
  key: string;
  directory: string;
  recursive: boolean;
  ready: boolean;
  listeners: Set<NativeWatcher>;
}
class NativeWatcher extends EventEmitter {
  closed = false;
  readonly ready: Promise<void>;
  private settle!: () => void;
  constructor(
    private release: () => void,
    readonly changed: Changed,
  ) {
    super();
    this.ready = new Promise((resolve) => (this.settle = resolve));
  }
  connected() {
    this.settle();
  }
  failed(error: Error) {
    if (this.closed) return;
    this.settle();
    this.emit('error', error);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.settle();
    this.release();
    this.removeAllListeners();
  }
}

/** One private process, shared registrations, and explicit reconciliation after failures. */
export class NativeDirectoryWatchService {
  private child?: ChildProcessWithoutNullStreams;
  private registrations = new Map<string, Registration>();
  private ids = new Map<string, Registration>();
  private closed = false;
  private failures = new Set<string>();
  constructor(
    private executable: string,
    private failed: (error: Error) => void = () => {},
  ) {}

  watch(directory: string, recursive: boolean, changed: Changed): DirectoryWatcher {
    if (this.closed) throw Error('Directory watching has stopped');
    directory = path.resolve(directory);
    const key = `${directory.toLowerCase()}:${recursive}`;
    let entry = this.registrations.get(key);
    const fresh = !entry;
    if (!entry) {
      entry = { id: randomUUID(), key, directory, recursive, ready: false, listeners: new Set() };
      this.registrations.set(key, entry);
      this.ids.set(entry.id, entry);
    }
    const registration = entry;
    const listener = new NativeWatcher(() => {
      registration.listeners.delete(listener);
      if (registration.listeners.size) return;
      if (this.registrations.get(key) === registration) this.registrations.delete(key);
      this.ids.delete(registration.id);
      this.send({ method: 'unwatch', id: registration.id });
    }, changed);
    entry.listeners.add(listener);
    if (entry.ready) listener.connected();
    if (fresh) {
      // Callers install error handlers before process/registration errors are delivered.
      queueMicrotask(() => {
        if (this.closed || this.ids.get(registration.id) !== registration) return;
        try {
          this.start();
          this.send({ method: 'watch', id: registration.id, path: directory, recursive });
        } catch (error) {
          this.reject(registration, error as Error);
        }
      });
    }
    return listener;
  }
  private send(value: object) {
    if (this.child?.stdin.writable) this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  private start() {
    if (this.child) return;
    const child = spawn(this.executable, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    const lost = () => {
      if (this.child !== child) return;
      this.child = undefined;
      lines.close();
      child.kill();
      const error = Object.assign(Error('Directory watch process unavailable'), { code: 'EIO' });
      for (const entry of [...this.ids.values()]) this.reject(entry, error);
    };
    child.on('error', lost);
    child.on('exit', lost);
    child.stdin.on('error', lost);
    lines.on('line', (line) => {
      if (this.child !== child) return;
      try {
        const event = JSON.parse(line);
        const entry = this.ids.get(event.id);
        if (!entry) return;
        if (event.type === 'ready') {
          entry.ready = true;
          this.failures.delete(entry.key);
          for (const listener of entry.listeners) listener.connected();
        } else if (event.type === 'change') {
          for (const listener of [...entry.listeners])
            if (!listener.closed) listener.changed(event.kind, event.name ?? null);
        } else if (event.type === 'error') {
          this.reject(
            entry,
            Object.assign(Error('Directory change notifications unavailable'), {
              code: event.code,
              nativeCode: event.nativeCode,
            }),
          );
        }
      } catch {
        lost();
      }
    });
  }
  private reject(entry: Registration, error: Error) {
    if (this.ids.get(entry.id) !== entry) return;
    this.ids.delete(entry.id);
    this.registrations.delete(entry.key);
    this.send({ method: 'unwatch', id: entry.id });
    // Missing directories are handled by the owner's existing ancestor/reconnect policy.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !this.failures.has(entry.key)) {
      this.failures.add(entry.key);
      this.failed(error);
    }
    for (const listener of [...entry.listeners]) listener.failed(error);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of [...this.ids.values()])
      for (const listener of [...entry.listeners]) listener.close();
    const child = this.child;
    this.child = undefined;
    child?.stdin.end();
    child?.kill();
    this.failures.clear();
  }
}

let service: NativeDirectoryWatchService | undefined;
export function useDirectoryWatchService(next: NativeDirectoryWatchService | undefined) {
  service = next;
}
export function watchDirectory(
  directory: string,
  options: { recursive?: boolean } | undefined,
  changed: Changed,
): DirectoryWatcher {
  if (service) return service.watch(directory, !!options?.recursive, changed);
  // Standalone core consumers and non-Windows tests can use the native Node adapter.
  return options ? fs.watch(directory, options, changed) : fs.watch(directory, changed);
}

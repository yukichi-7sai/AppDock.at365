import path from 'node:path';
import { Worker } from 'node:worker_threads';

type Request = { resolve(text: string): void; reject(error: Error): void };
type Reader = { worker: Worker; requests: Map<number, Request> };
let reader: Reader | undefined;
let nextId = 0;

/** Share one lazy reader; no file handle depends on the main event loop to close. */
export function readObservedFile(file: string): Promise<string> {
  if (!reader) {
    const state: Reader = {
      worker: new Worker(path.join(__dirname, 'file-reader-worker.js')),
      requests: new Map(),
    };
    reader = state;
    const fail = (error: Error) => {
      if (reader === state) reader = undefined;
      for (const request of state.requests.values()) request.reject(error);
      state.requests.clear();
      state.worker.unref();
    };
    state.worker.on(
      'message',
      (result: { id: number; text: string; error?: { message: string; code?: string } }) => {
        const request = state.requests.get(result.id);
        if (!request) return;
        state.requests.delete(result.id);
        if (result.error) request.reject(Object.assign(Error(result.error.message), result.error));
        else request.resolve(result.text);
        if (!state.requests.size) state.worker.unref();
      },
    );
    state.worker.on('error', fail);
    state.worker.on('exit', (code) => fail(Error(`Observed file reader exited (${code})`)));
  }
  const state = reader;
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    state.requests.set(id, { resolve, reject });
    state.worker.ref();
    try {
      state.worker.postMessage({ id, file });
    } catch (error) {
      state.requests.delete(id);
      if (!state.requests.size) state.worker.unref();
      reject(error);
    }
  });
}

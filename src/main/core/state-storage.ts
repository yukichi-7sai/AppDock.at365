import fs from 'node:fs';
import { atomicWrite } from './settings';

/** A small persisted value; the host supplies device-settings entries in production. */
export interface StateStorage {
  read(): unknown;
  write(value: unknown): void;
}

export function stateStorage(source?: StateStorage | string): StateStorage {
  if (source && typeof source !== 'string') return source;
  if (!source) {
    let value: unknown;
    return {
      read: () => value,
      write: (next) => {
        value = structuredClone(next);
      },
    };
  }
  let previous: Buffer | undefined;
  return {
    read() {
      try {
        previous = fs.readFileSync(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        previous = undefined;
      }
      return previous ? JSON.parse(previous.toString('utf8').replace(/^\uFEFF/, '')) : undefined;
    },
    write(value) {
      const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      atomicWrite(source, bytes, { previous });
      previous = bytes;
    },
  };
}

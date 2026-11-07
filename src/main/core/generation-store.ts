import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeDirectory } from './library-files';
import { atomicReplaceSync } from './atomic-replace';

export interface StoredResult {
  id: string;
  mimeType: string;
  byteLength: number;
  hash: string;
}
export interface GenerationRecord<T = unknown> {
  version: 1;
  id: string;
  kind: 'image' | 'sound';
  data: T;
  results: StoredResult[];
  deletedResults?: string[];
  retired?: boolean;
}
export interface GenerationCopy {
  id: string;
  file: string;
  hash: string;
}
export function verifiedGenerationCopy(
  copies: GenerationCopy[] | undefined,
  id: string,
  expectedHash: string,
) {
  return (
    copies?.some((copy) => {
      try {
        return (
          copy.id === id &&
          copy.hash === expectedHash &&
          fs.lstatSync(copy.file).isFile() &&
          !fs.lstatSync(copy.file).isSymbolicLink() &&
          hash(fs.readFileSync(copy.file)) === expectedHash
        );
      } catch {
        return false;
      }
    }) ?? false
  );
}
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Local recovery data has no expiry. No cleanup operation may remove the only copy. */
export class GenerationStore {
  readonly issues: string[] = [];
  constructor(readonly directory: string) {}
  private folder(id?: string) {
    if (id !== undefined && !validId(id)) throw Error('Invalid generation record ID');
    return safeDirectory(this.directory, id ?? '', true);
  }
  private checked(file: string) {
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()
    )
      throw Error('Unsafe generation recovery file');
    return file;
  }
  private write(file: string, bytes: Buffer) {
    const previous = fs.existsSync(file) ? fs.readFileSync(this.checked(file)) : undefined;
    const temp = path.join(path.dirname(file), `.${randomUUID()}.partial`);
    const fd = fs.openSync(temp, 'wx');
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // A failed replacement leaves the complete partial file available for rescue.
    atomicReplaceSync(temp, file, () => {
      safeDirectory(
        this.directory,
        path.relative(this.directory, path.dirname(file)).split(path.sep).join('/'),
      );
      const current = fs.existsSync(file) ? fs.readFileSync(this.checked(file)) : undefined;
      if (previous === undefined ? current !== undefined : !current?.equals(previous))
        throw Error('Generation recovery record changed during write');
    });
  }
  preflight() {
    if (this.issues.length) throw Error('Generation recovery storage needs attention');
    const file = path.join(this.folder(), `.${randomUUID()}.probe`);
    this.write(file, Buffer.from('ready'));
    fs.unlinkSync(file);
  }
  /** Called only after the host verifies a safe handoff or explicit result deletion. */
  discard(record: GenerationRecord) {
    const folder = this.folder(record.id);
    const known = new Set(['manifest.json', ...record.results.map((result) => result.id + '.bin')]);
    const files = fs.readdirSync(folder).map((name) => {
      if (!known.has(name))
        throw Error('Uncommitted recovery data must be rescued before removing the job');
      return this.checked(path.join(folder, name));
    });
    const previous = record.retired;
    record.retired = true;
    try {
      this.save(record);
    } catch (error) {
      record.retired = previous;
      throw error;
    }
    for (const file of files.sort(
      (a, b) =>
        Number(path.basename(a) === 'manifest.json') - Number(path.basename(b) === 'manifest.json'),
    )) {
      this.folder(record.id);
      this.checked(file);
      fs.unlinkSync(file);
    }
    fs.rmdirSync(folder);
    for (let i = this.issues.length - 1; i >= 0; i--)
      if (this.issues[i].includes(record.id)) this.issues.splice(i, 1);
  }
  /** Persist deletion intent before removing bytes so a crash cannot resurrect a result. */
  deleteResults(record: GenerationRecord, ids: string[]) {
    if (ids.some((id) => !validId(id))) throw Error('Invalid generation result ID');
    const previous = record.deletedResults;
    record.deletedResults = [...new Set([...(previous ?? []), ...ids])];
    try {
      this.save(record);
    } catch (error) {
      record.deletedResults = previous;
      throw error;
    }
    for (const id of record.deletedResults) {
      const file = path.join(this.folder(record.id), id + '.bin');
      if (fs.existsSync(file)) fs.unlinkSync(this.checked(file));
    }
  }
  save<T>(record: GenerationRecord<T>) {
    this.write(
      path.join(this.folder(record.id), 'manifest.json'),
      Buffer.from(JSON.stringify(record)),
    );
  }
  preserve<T>(record: GenerationRecord<T>, id: string, mimeType: string, bytes: Buffer) {
    if (!validId(id)) throw Error('Invalid generation result ID');
    const result = { id, mimeType, byteLength: bytes.length, hash: hash(bytes) };
    const old = record.results.findIndex((item) => item.id === id);
    if (old < 0) record.results.push(result);
    else record.results[old] = result;
    // The intent makes a crash after the binary commit discoverable on restart.
    this.save(record);
    this.write(path.join(this.folder(record.id), id + '.bin'), bytes);
    this.save(record);
    return result;
  }
  read(record: GenerationRecord, id: string) {
    if (record.deletedResults?.includes(id)) throw Error('Generation result was deleted');
    const result = record.results.find((item) => item.id === id);
    if (!result || !validId(id)) throw Error('Missing generation result');
    const bytes = fs.readFileSync(this.checked(path.join(this.folder(record.id), id + '.bin')));
    if (bytes.length !== result.byteLength || hash(bytes) !== result.hash)
      throw Error('Generation result integrity check failed');
    return bytes;
  }
  load<T>(kind: GenerationRecord['kind']): GenerationRecord<T>[] {
    const records: GenerationRecord<T>[] = [];
    let names: string[];
    try {
      names = fs.readdirSync(this.folder());
    } catch {
      this.issues.push('Recovery storage is unavailable');
      return records;
    }
    for (const id of names) {
      if (id.startsWith('.') && id.endsWith('.probe')) continue;
      try {
        if (!validId(id)) throw Error('Unrecognized recovery entry');
        const folder = this.folder(id);
        const value = JSON.parse(
          fs.readFileSync(this.checked(path.join(folder, 'manifest.json')), 'utf8'),
        );
        if (
          value.version !== 1 ||
          value.id !== id ||
          !['image', 'sound'].includes(value.kind) ||
          !value.data ||
          (value.retired !== undefined && typeof value.retired !== 'boolean') ||
          !Array.isArray(value.results) ||
          value.results.some(
            (r: StoredResult) =>
              !validId(r.id) ||
              typeof r.mimeType !== 'string' ||
              !Number.isSafeInteger(r.byteLength) ||
              r.byteLength < 0 ||
              !/^[a-f0-9]{64}$/.test(r.hash),
          )
        )
          throw Error('Invalid recovery manifest');
        if (value.retired) {
          this.discard(value);
          continue;
        }
        if (value.deletedResults !== undefined) {
          if (
            !Array.isArray(value.deletedResults) ||
            value.deletedResults.some((id: string) => !validId(id))
          )
            throw Error('Invalid deleted results');
          this.deleteResults(value, []);
        }
        if (value.kind === kind) records.push(value);
        const known = new Set([
          'manifest.json',
          ...value.results.map((r: StoredResult) => r.id + '.bin'),
        ]);
        if (fs.readdirSync(folder).some((file) => !known.has(file)))
          this.issues.push('Uncommitted recovery files require inspection: ' + id);
      } catch {
        this.issues.push('Recovery record requires inspection: ' + id);
      }
    }
    return records;
  }
}

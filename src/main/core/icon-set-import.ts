import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { imageFilename } from '../../shared/registered-images';
import { validateSvg } from '../../shared/svg-image';
import { hostText } from '../../shared/i18n';
import { safeDirectory } from './image-files';
import type { RegisteredImages } from './registered-images';

export const iconSets = [
  { id: 'lucide', name: 'Lucide', folder: 'Lucide Icon', package: 'lucide-static' },
] as const;
export interface IconImportProgress {
  phase: 'download' | 'import';
  completed: number;
  total: number;
  added: number;
  reused: number;
  failed: number;
}
const licenseEntry = (name: string) => /^package\/LICENSE(?:\.txt|\.md)?$/i.test(name);

/** Reads regular files only, never materializes archive paths or executes package code. */
export async function* tarEntries(file: string): AsyncGenerator<{ name: string; bytes: Buffer }> {
  const input = await fs.open(file, 'r');
  let offset = 0;
  try {
    const length = (await input.stat()).size;
    while (offset + 512 <= length) {
      const header = Buffer.alloc(512);
      await input.read(header, 0, 512, offset);
      if (header.every((v) => v === 0)) return;
      const field = (start: number, size: number) =>
        header
          .toString('utf8', start, start + size)
          .replace(/\0.*$/s, '')
          .trim();
      const checksum = parseInt(field(148, 8), 8);
      const actual = header.reduce(
        (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
        0,
      );
      const sizeText = field(124, 12);
      const size = /^[0-7]+$/.test(sizeText) ? parseInt(sizeText, 8) : NaN;
      if (
        checksum !== actual ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        offset + 512 + size > length
      )
        throw Error(hostText('images.archiveInvalid'));
      const prefix = field(345, 155),
        base = field(0, 100);
      const name = prefix ? prefix + '/' + base : base;
      if (['1', '2'].includes(field(156, 1))) throw Error(hostText('images.archiveInvalid'));
      if (
        ['', '0'].includes(field(156, 1)) &&
        (/^package\/icons\/[^/]+\.svg$/.test(name) || licenseEntry(name))
      ) {
        // Registered-image validation defines the supported single-image byte size.
        if (size > 5 * 1024 * 1024) throw Error(hostText('images.archiveInvalid'));
        const bytes = Buffer.alloc(size);
        await input.read(bytes, 0, size, offset + 512);
        yield { name, bytes };
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    throw Error(hostText('images.archiveInvalid'));
  } finally {
    await input.close();
  }
}

export async function importIconSet(options: {
  id: string;
  images: RegisteredImages;
  signal: AbortSignal;
  writable(): void;
  progress(value: IconImportProgress): void;
  fetch?: typeof fetch;
}) {
  const set = iconSets.find((set) => set.id === options.id);
  if (!set) throw Error(hostText('images.setUnknown'));
  const request = options.fetch ?? fetch;
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(120000)]);
  const check = () => {
    options.signal.throwIfAborted();
    options.writable();
  };
  const progress: IconImportProgress = {
    phase: 'download',
    completed: 0,
    total: 0,
    added: 0,
    reused: 0,
    failed: 0,
  };
  check();
  options.progress({ ...progress });
  const metaResponse = await request(`https://registry.npmjs.org/${set.package}/latest`, {
    signal,
    redirect: 'error',
  });
  if (!metaResponse.ok) throw Error(hostText('images.downloadFailed'));
  const meta = (await metaResponse.json()) as {
    version: string;
    dist: { integrity: string; tarball: string };
  };
  if (
    !meta ||
    typeof meta !== 'object' ||
    !/^\d+\.\d+\.\d+$/.test(meta.version) ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(meta.dist?.integrity ?? '') ||
    meta.dist.tarball !==
      `https://registry.npmjs.org/${set.package}/-/${set.package}-${meta.version}.tgz`
  )
    throw Error(hostText('images.archiveInvalid'));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'appdock-icons-'));
  const archive = path.join(temporary, 'icons.tgz'),
    unpacked = path.join(temporary, 'icons.tar');
  try {
    const response = await request(meta.dist.tarball, { signal, redirect: 'error' });
    if (!response.ok || !response.body) throw Error(hostText('images.downloadFailed'));
    const hash = createHash('sha512');
    await pipeline(
      Readable.fromWeb(response.body as any),
      new Transform({
        transform(chunk, _encoding, done) {
          hash.update(chunk);
          done(null, chunk);
        },
      }),
      createWriteStream(archive, { flags: 'wx' }),
      { signal },
    );
    if (`sha512-${hash.digest('base64')}` !== meta.dist.integrity)
      throw Error(hostText('images.integrityFailed'));
    await pipeline(
      createReadStream(archive),
      createGunzip(),
      createWriteStream(unpacked, { flags: 'wx' }),
      { signal },
    );
    let license: Buffer | undefined;
    const names = new Set<string>();
    // Validate the complete selected set before publishing any image.
    for await (const entry of tarEntries(unpacked)) {
      check();
      if (licenseEntry(entry.name)) {
        license = entry.bytes;
        continue;
      }
      const name = entry.name.slice('package/icons/'.length);
      if (!imageFilename(name) || names.has(name.toLowerCase()))
        throw Error(hostText('images.archiveInvalid'));
      validateSvg(entry.bytes.toString('utf8'));
      names.add(name.toLowerCase());
    }
    if (!license?.length || !names.size) throw Error(hostText('images.archiveInvalid'));
    check();
    const destination = safeDirectory(options.images.directory, set.folder, true);
    // Keep each fetched version's license, without replacing a user's existing document.
    const licenseFile = path.join(destination, `LICENSE-${meta.version}.txt`);
    try {
      await fs.writeFile(licenseFile, license, { flag: 'wx' });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
        (await fs.lstat(licenseFile)).isSymbolicLink() ||
        (await fs.realpath(licenseFile)).toLowerCase() !== licenseFile.toLowerCase() ||
        !(await fs.readFile(licenseFile)).equals(license)
      )
        throw error;
    }
    progress.phase = 'import';
    progress.total = names.size;
    options.progress({ ...progress });
    const failures: string[] = [];
    await options.images.batch(async () => {
      for await (const entry of tarEntries(unpacked)) {
        check();
        if (licenseEntry(entry.name)) continue;
        const name = entry.name.slice('package/icons/'.length);
        try {
          const result = await options.images.addWithResult(entry.bytes, `${set.folder}/${name}`);
          if (result.reused) progress.reused++;
          else progress.added++;
        } catch {
          progress.failed++;
          failures.push(name);
        }
        progress.completed++;
        if (progress.completed % 20 === 0 || progress.completed === progress.total)
          options.progress({ ...progress });
      }
    });
    await options.images.refresh();
    return { ...progress, folder: set.folder, version: meta.version, failures };
  } finally {
    const real = await fs.realpath(temporary);
    if (
      path.dirname(real).toLowerCase() !== (await fs.realpath(os.tmpdir())).toLowerCase() ||
      !path.basename(real).startsWith('appdock-icons-')
    )
      throw Error('Unexpected temporary directory');
    await fs.rm(real, { recursive: true, force: true });
  }
}

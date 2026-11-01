import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { imageFilename, type ImageGroup } from '../../shared/registered-images';
import type { IconImportProgress } from '../../shared/image-library-page';
export type { IconImportProgress } from '../../shared/image-library-page';
import { validateSvg } from '../../shared/svg-image';
import { hostText } from '../../shared/i18n';
import { safeDirectory } from './image-files';
import type { RegisteredImages } from './registered-images';

export const iconSets = [
  { id: 'lucide', name: 'Lucide', folder: 'Lucide Icon', package: 'lucide-static' },
] as const;
const licenseEntry = (name: string) => /^package\/LICENSE(?:\.txt|\.md)?$/i.test(name);

interface IconImportCandidate {
  name: string;
  bytes: Buffer;
  categories: { id: string; title: string }[];
}
/** Verified failed originals and unsaved memberships, owned by the current Window only. */
export interface IconImportRetry {
  id: string;
  version: string;
  folder: string;
  images: IconImportCandidate[];
  groups: ImageGroup[];
}
interface IconImportOptions {
  id: string;
  images: RegisteredImages;
  signal: AbortSignal;
  writable(): void;
  progress(value: IconImportProgress): void;
  groups(value: ImageGroup[]): void;
  retry?(value: IconImportRetry | undefined): void;
  fetch?: typeof fetch;
}

/** Reads regular files only, never materializes archive paths or executes package code. */
export async function* tarEntries(
  file: string,
  selected = (name: string) => /^package\/icons\/[^/]+\.svg$/.test(name) || licenseEntry(name),
): AsyncGenerator<{ name: string; bytes: Buffer }> {
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
      if (['', '0'].includes(field(156, 1)) && selected(name)) {
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

export async function importIconSet(options: IconImportOptions) {
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
    progress.phase = 'metadata';
    options.progress({ ...progress });
    const metadataArchive = path.join(temporary, 'metadata.tar');
    // The release tag matches the verified npm version; no mutable main-branch metadata is used.
    const metadataResponse = await request(
      `https://codeload.github.com/lucide-icons/lucide/tar.gz/refs/tags/${meta.version}`,
      { signal, redirect: 'error' },
    );
    if (!metadataResponse.ok || !metadataResponse.body)
      throw Error(hostText('images.metadataFailed'));
    await pipeline(
      Readable.fromWeb(metadataResponse.body as any),
      createGunzip(),
      createWriteStream(metadataArchive, { flags: 'wx' }),
      { signal },
    );
    const categories = await readLucideCategories(metadataArchive, meta.version, check);
    progress.phase = 'validate';
    options.progress({ ...progress });
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
      if (!categories.has(name.slice(0, -4))) throw Error(hostText('images.metadataFailed'));
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
    async function* candidates() {
      for await (const entry of tarEntries(unpacked)) {
        if (licenseEntry(entry.name)) continue;
        const name = entry.name.slice('package/icons/'.length);
        yield { name, bytes: entry.bytes, categories: categories.get(name.slice(0, -4))! };
      }
    }
    return await applyIconImport(options, meta.version, candidates(), names.size);
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

/** Retries only verified failed originals or unsaved groups, without fetching the package again. */
export async function retryIconImport(options: IconImportOptions, retry: IconImportRetry) {
  const set = iconSets.find((set) => set.id === options.id);
  if (
    !set ||
    retry.id !== set.id ||
    retry.folder !== set.folder ||
    (!retry.images.length && !retry.groups.length)
  )
    throw Error(hostText('images.setUnknown'));
  async function* candidates() {
    yield* retry.images;
  }
  return applyIconImport(options, retry.version, candidates(), retry.images.length, retry.groups);
}

async function applyIconImport(
  options: IconImportOptions,
  version: string,
  candidates: AsyncIterable<IconImportCandidate>,
  total: number,
  pendingGroups: ImageGroup[] = [],
) {
  const set = iconSets.find((set) => set.id === options.id)!;
  const check = () => {
    options.signal.throwIfAborted();
    options.writable();
  };
  const progress: IconImportProgress = {
    phase: total ? 'import' : 'groups',
    completed: 0,
    total,
    added: 0,
    reused: 0,
    failed: 0,
  };
  check();
  options.progress({ ...progress });
  const failed: IconImportCandidate[] = [];
  const groups = new Map(pendingGroups.map((group) => [group.id, structuredClone(group)]));
  let complete = false;
  try {
    await options.images.batch(async () => {
      for await (const candidate of candidates) {
        check();
        try {
          const result = await options.images.addWithResult(
            candidate.bytes,
            `${set.folder}/${candidate.name}`,
          );
          if (result.reused) progress.reused++;
          else progress.added++;
          for (const category of candidate.categories) {
            const id = `icon-set-${set.id}-${category.id}`;
            const group = groups.get(id) ?? {
              id,
              name: `${set.name}: ${category.title}`,
              images: [],
            };
            group.images.push(result.ref);
            groups.set(id, group);
          }
        } catch {
          progress.failed++;
          failed.push(candidate);
        }
        progress.completed++;
        if (progress.completed % 20 === 0 || progress.completed === total)
          options.progress({ ...progress });
      }
    });
    complete = true;
  } finally {
    const memberships = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const retry = (unsaved: ImageGroup[]) => {
      options.retry?.(
        complete && (failed.length || unsaved.length)
          ? { id: set.id, version, folder: set.folder, images: failed, groups: unsaved }
          : undefined,
      );
    };
    // Save the retry scope before attempting the settings write, which can itself fail.
    retry(memberships);
    if (memberships.length) {
      progress.phase = 'groups';
      options.progress({ ...progress });
      options.writable();
      options.groups(memberships);
    }
    retry([]);
  }
  await options.images.refresh();
  return { ...progress, folder: set.folder, version, failures: failed.map((image) => image.name) };
}

async function readLucideCategories(file: string, version: string, check: () => void) {
  const prefix = `lucide-${version}/`;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const icons = new Map<string, { categories: string[]; aliases: string[] }>();
  const titles = new Map<string, string>();
  const invalid = () => Error(hostText('images.metadataFailed'));
  for await (const entry of tarEntries(
    file,
    (name) =>
      name.startsWith(prefix) &&
      /^(icons|categories)\/[^/]+\.json$/.test(name.slice(prefix.length)),
  )) {
    check();
    const relative = entry.name.slice(prefix.length);
    const id = path.posix.basename(relative, '.json');
    if (!slug.test(id)) throw invalid();
    let data;
    try {
      data = JSON.parse(entry.bytes.toString('utf8'));
    } catch {
      throw invalid();
    }
    if (!data || typeof data !== 'object') throw invalid();
    if (relative.startsWith('categories/')) {
      if (
        titles.has(id) ||
        typeof data.title !== 'string' ||
        !data.title.trim() ||
        data.title.length > 70 ||
        /[\x00-\x1f\x7f]/.test(data.title) ||
        id.length > 64
      )
        throw invalid();
      titles.set(id, data.title.trim());
    } else {
      if (
        icons.has(id) ||
        !Array.isArray(data.categories) ||
        !data.categories.every(
          (v: unknown) =>
            typeof v === 'string' && slug.test(v.startsWith('$extends:') ? v.slice(9) : v),
        ) ||
        (data.aliases !== undefined && !Array.isArray(data.aliases))
      )
        throw invalid();
      const aliases = (data.aliases ?? []).map((v: unknown) =>
        typeof v === 'string' ? v : (v as { name?: unknown } | null)?.name,
      );
      if (!aliases.every((v: unknown) => typeof v === 'string' && slug.test(v))) throw invalid();
      icons.set(id, { categories: data.categories, aliases });
    }
  }
  type Category = { id: string; title: string };
  const result = new Map<string, Category[]>(),
    resolving = new Set<string>();
  const resolve = (name: string): Category[] => {
    const done = result.get(name);
    if (done) return done;
    const icon = icons.get(name);
    if (!icon || resolving.has(name)) throw invalid();
    resolving.add(name);
    const categories = new Map<string, Category>();
    for (const value of icon.categories) {
      if (value.startsWith('$extends:')) {
        for (const category of resolve(value.slice(9))) categories.set(category.id, category);
      } else {
        const title = titles.get(value);
        if (!title) throw invalid();
        categories.set(value, { id: value, title });
      }
    }
    resolving.delete(name);
    result.set(name, [...categories.values()]);
    return result.get(name)!;
  };
  for (const name of icons.keys()) resolve(name);
  for (const [name, icon] of icons)
    for (const alias of icon.aliases) {
      if (icons.has(alias)) continue;
      const previous = result.get(alias),
        categories = result.get(name)!;
      if (previous && JSON.stringify(previous) !== JSON.stringify(categories)) throw invalid();
      result.set(alias, categories);
    }
  return result;
}

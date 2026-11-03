import fs from 'node:fs';
import type { CatalogEdition, CatalogRelease } from '../../shared/applet-catalog';
import { parseVersion, validRepository } from '../../shared/versions';
import { atomicWrite } from './settings';

export type Cached<T> = { fetchedAt: number; value: T };
export type ReleaseValue = CatalogRelease | 'unpublished';
export interface CachedRepository {
  release?: Cached<ReleaseValue>;
  development?: Cached<CatalogEdition>;
}

const day = 24 * 60 * 60 * 1000;
export function fresh(record: Cached<unknown> | undefined, now: number) {
  return !!record && record.fetchedAt <= now && now - record.fetchedAt < day;
}

function readEdition(record: any, repository?: string) {
  if (!Number.isSafeInteger(record?.fetchedAt) || record.fetchedAt < 0) return;
  const value = record.value;
  if (repository && value === 'unpublished') return record;
  if (
    typeof value?.id !== 'string' ||
    !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(value.id) ||
    typeof value.displayName !== 'string' ||
    !value.displayName.trim() ||
    typeof value.date !== 'string' ||
    !Number.isFinite(Date.parse(value.date)) ||
    (value.description !== undefined && typeof value.description !== 'string') ||
    (value.tagline !== undefined && typeof value.tagline !== 'string')
  )
    return;
  try {
    parseVersion(value.version);
    if (value.minimumHostVersion !== undefined) parseVersion(value.minimumHostVersion);
  } catch {
    return;
  }
  if (repository) {
    const prefix = `https://github.com/${repository}/releases/tag/`;
    if (
      value.unavailable !== undefined ||
      typeof value.source !== 'string' ||
      !value.source.toLowerCase().startsWith(prefix.toLowerCase()) ||
      !/^[a-z0-9][a-z0-9._+-]*$/i.test(value.source.slice(prefix.length))
    )
      return;
  }
  return record;
}

export class AppletCatalogCache {
  readonly entries = new Map<string, CachedRepository>();
  retryAt = 0;
  dirty = false;
  private loaded = false;

  constructor(
    private readonly file: string | undefined,
    private readonly warn?: () => void,
  ) {}

  load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data?.schemaVersion !== 1) return;
      if (Number.isSafeInteger(data.retryAt)) this.retryAt = data.retryAt;
      for (const [repository, record] of Object.entries(data.repositories ?? {})) {
        if (!validRepository(repository) || !record || typeof record !== 'object') continue;
        const release = 'release' in record ? readEdition(record.release, repository) : undefined;
        const development = 'development' in record ? readEdition(record.development) : undefined;
        if (release || development)
          this.entries.set(repository.toLowerCase(), { release, development });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warn?.();
    }
  }

  save() {
    if (!this.dirty || !this.file) return;
    try {
      atomicWrite(
        this.file,
        JSON.stringify({
          schemaVersion: 1,
          retryAt: this.retryAt,
          repositories: Object.fromEntries(this.entries),
        }),
      );
      this.dirty = false;
    } catch {
      this.warn?.();
    }
  }
}

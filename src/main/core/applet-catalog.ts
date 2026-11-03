import fs from 'node:fs';
import type { ExtensionManifest } from '../../shared/contracts';
import { AppletCatalogCache, fresh, type Cached, type ReleaseValue } from './applet-catalog-cache';
import type { AppletCatalogEntry, CatalogRelease } from '../../shared/applet-catalog';
import { appletDisplayName } from '../../shared/applet-display-name';
import { compareVersions, parseVersion, validRepository } from '../../shared/versions';
import { orderedReads } from './ordered-io';
import {
  readGithubFeed,
  readGithubRelease,
  readUpdateJson,
  type Fetcher,
} from './portable-updates';

type Installed = readonly Pick<ExtensionManifest, 'id' | 'updateRepository'>[];

export function readAppletRoster(file: string, seed: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || file === seed) throw error;
    try {
      fs.copyFileSync(seed, file, fs.constants.COPYFILE_EXCL);
    } catch (copyError) {
      const code = (copyError as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
        return readAppletRoster(seed, seed);
      if (code !== 'EEXIST') throw copyError;
    }
    text = fs.readFileSync(file, 'utf8');
  }
  const list = JSON.parse(text.replace(/^\uFEFF/, '')).applets;
  if (!Array.isArray(list) || !list.every(validRepository)) throw Error('Invalid applets.json');
  const repositories = new Map<string, string>();
  for (const repository of list) repositories.set(repository.toLowerCase(), repository);
  return [...repositories.values()];
}

export class AppletCatalog {
  private readonly pending = new Map<string, Promise<AppletCatalogEntry>>();
  private readonly cache: AppletCatalogCache;
  private readonly repositories: () => string[];
  private readonly now: () => number;
  private readonly fetcher: Fetcher;

  constructor(
    private readonly hostVersion: string,
    options: {
      fetcher?: Fetcher;
      repositories: () => string[];
      file?: string;
      now?: () => number;
      warn?: () => void;
    },
  ) {
    this.repositories = options.repositories;
    this.now = options.now ?? Date.now;
    this.cache = new AppletCatalogCache(options.file, options.warn);
    const transport = options.fetcher ?? fetch;
    this.fetcher = async (url, init) => {
      const api = url.startsWith('https://api.github.com/');
      if (api && this.now() < this.cache.retryAt) throw Error('GitHub rate limit');
      const response = await transport(url, init);
      if (api && (response.status === 403 || response.status === 429)) {
        const reset =
          response.headers.get('x-ratelimit-remaining') === '0'
            ? Number(response.headers.get('x-ratelimit-reset')) * 1000
            : 0;
        const after = response.headers.get('retry-after');
        const retry =
          after && /^\d+$/.test(after)
            ? this.now() + Number(after) * 1000
            : Date.parse(after ?? '');
        const until = Math.max(
          Number.isSafeInteger(reset) ? reset : 0,
          Number.isSafeInteger(retry) ? retry : 0,
        );
        if (until > Math.max(this.now(), this.cache.retryAt)) {
          this.cache.retryAt = until;
          this.cache.dirty = true;
        }
      }
      return response;
    };
  }

  private candidates(installed: Installed) {
    const ids = new Set(installed.map((applet) => applet.id));
    const sources = new Set(installed.map((applet) => applet.updateRepository?.toLowerCase()));
    const remaining = this.repositories().filter((repo) => !sources.has(repo.toLowerCase()));
    if (remaining.length) this.cache.load();
    return remaining.filter((repo) => {
      const record = this.cache.entries.get(repo.toLowerCase());
      return ![record?.release?.value, record?.development?.value].some(
        (value) => typeof value === 'object' && ids.has(value.id),
      );
    });
  }

  private displayRelease(value?: ReleaseValue): AppletCatalogEntry['release'] {
    if (!value) return 'error';
    if (
      typeof value === 'object' &&
      !value.unavailable &&
      value.minimumHostVersion &&
      compareVersions(value.minimumHostVersion, this.hostVersion) > 0
    )
      return { ...value, unavailable: 'host' };
    return value;
  }

  snapshot(installed: Installed) {
    const entries: AppletCatalogEntry[] = [];
    let needsRefresh = false;
    for (const repository of this.candidates(installed)) {
      const record = this.cache.entries.get(repository.toLowerCase());
      if (!fresh(record?.release, this.now()) || !fresh(record?.development, this.now()))
        needsRefresh = true;
      if (record)
        entries.push({
          repository,
          release: this.displayRelease(record.release?.value),
          development: record.development?.value ?? 'error',
        });
    }
    return { entries, needsRefresh };
  }

  async list(installed: Installed = []) {
    const entries: AppletCatalogEntry[] = [];
    const installedIds = new Set(installed.map((applet) => applet.id));
    for await (const result of orderedReads(this.candidates(installed), 4, (repository) => {
      const key = repository.toLowerCase();
      const pending = this.pending.get(key);
      if (pending) return pending;
      const work = this.refresh(repository).finally(() => this.pending.delete(key));
      this.pending.set(key, work);
      return work;
    })) {
      if (result.status === 'rejected') throw result.reason;
      const row = result.value;
      if (
        ![row.release, row.development].some(
          (value) => typeof value === 'object' && installedIds.has(value.id),
        )
      )
        entries.push(row);
    }
    this.cache.save();
    return entries;
  }

  private async refresh(repository: string): Promise<AppletCatalogEntry> {
    const key = repository.toLowerCase();
    const record = this.cache.entries.get(key) ?? {};
    let refreshFailed = false;
    const read = async <T>(
      previous: Cached<T> | undefined,
      fetch: () => Promise<T>,
      store: (value: Cached<T>) => void,
      valid: (value: T) => boolean,
    ) => {
      if (previous && fresh(previous, this.now())) return previous.value;
      try {
        const value = await fetch();
        if (valid(value)) {
          store({ fetchedAt: this.now(), value });
          this.cache.entries.set(key, record);
          this.cache.dirty = true;
          return value;
        }
        refreshFailed = true;
        return previous?.value ?? value;
      } catch {
        refreshFailed = true;
        return previous?.value;
      }
    };
    const [release, development] = await Promise.all([
      read(
        record.release,
        () => this.release(repository),
        (value) => {
          record.release = value;
        },
        (value) => typeof value === 'string' || !value.unavailable,
      ),
      read(
        record.development,
        () => this.head(repository),
        (value) => {
          record.development = value;
        },
        () => true,
      ),
    ]);
    return {
      repository,
      release: this.displayRelease(release),
      development: development ?? 'error',
      refreshFailed,
    };
  }

  private async edition(repository: string, ref: string, date: string) {
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))
      throw Error('Invalid catalog date');
    const manifest = await readUpdateJson(
      `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}/extension.json`,
      this.fetcher,
    );
    if (
      typeof manifest?.id !== 'string' ||
      !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(manifest.id) ||
      typeof manifest.name !== 'string' ||
      !manifest.name.trim() ||
      (manifest.displayName !== undefined && typeof manifest.displayName !== 'string')
    )
      throw Error('Invalid catalog manifest');
    parseVersion(manifest.version);
    if (manifest.minimumHostVersion !== undefined) parseVersion(manifest.minimumHostVersion);
    return {
      id: manifest.id as string,
      displayName: appletDisplayName(manifest),
      version: manifest.version as string,
      date,
      description: typeof manifest.description === 'string' ? manifest.description : undefined,
      tagline: typeof manifest.tagline === 'string' ? manifest.tagline : undefined,
      minimumHostVersion: manifest.minimumHostVersion as string | undefined,
    };
  }

  private async head(repository: string) {
    const commits = await readUpdateJson(
      `https://api.github.com/repos/${repository}/commits?per_page=1`,
      this.fetcher,
    );
    const head = commits?.[0];
    if (!/^[a-f\d]{40}$/i.test(head?.sha)) throw Error('Invalid catalog commit');
    return this.edition(repository, head.sha, head.commit.committer.date);
  }

  private async release(repository: string): Promise<CatalogRelease | 'unpublished'> {
    const release = await readGithubRelease(repository, undefined, this.fetcher);
    if (!release) return 'unpublished';
    const tag = release.tag_name;
    if (typeof tag !== 'string' || !/^[a-z0-9][a-z0-9._+-]*$/i.test(tag))
      throw Error('Invalid catalog release tag');
    const [manifest, distribution] = await Promise.all([
      this.edition(repository, tag, release.published_at),
      readGithubFeed(release.assets, this.fetcher).catch(() => undefined),
    ]);
    const source = `https://github.com/${repository}/releases/tag/${tag}`;
    const feed = distribution?.feed;
    if (!feed || feed.id !== manifest.id || feed.version !== manifest.version)
      return { ...manifest, source, unavailable: 'package' };
    const minimumHostVersion = [manifest.minimumHostVersion, feed.minimumHostVersion]
      .filter((v): v is string => !!v)
      .sort(compareVersions)
      .at(-1);
    return { ...manifest, source, minimumHostVersion };
  }
}

import roster from './applets.json';
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

// The enclosing list request is shared. Keep only successful editions between requests.
async function cached<T>(
  cache: Map<string, T>,
  repository: string,
  read: () => Promise<T>,
  retry?: (value: T) => boolean,
) {
  const previous = cache.get(repository);
  if (previous !== undefined) return previous;
  const result = await read();
  if (!retry?.(result)) cache.set(repository, result);
  return result;
}

export class AppletCatalog {
  private readonly releases = new Map<string, AppletCatalogEntry['release']>();
  private readonly development = new Map<string, AppletCatalogEntry['development']>();
  private pending?: Promise<AppletCatalogEntry[]>;

  constructor(
    private readonly hostVersion: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly repositories = roster.applets,
  ) {}

  list() {
    return (this.pending ??= this.readAll().finally(() => {
      this.pending = undefined;
    }));
  }

  private async readAll() {
    const entries: AppletCatalogEntry[] = [];
    for await (const result of orderedReads(
      [...new Set(this.repositories)],
      4,
      async (repository): Promise<AppletCatalogEntry> => {
        if (!validRepository(repository))
          return { repository, release: 'error', development: 'error' };
        const [release, development] = await Promise.all([
          cached(
            this.releases,
            repository,
            () => this.release(repository),
            (value) => typeof value === 'object' && value.unavailable === 'package',
          ).catch(() => 'error' as const),
          cached(this.development, repository, () => this.head(repository)).catch(
            () => 'error' as const,
          ),
        ]);
        return { repository, release, development };
      },
    )) {
      if (result.status === 'rejected') throw result.reason;
      entries.push(result.value);
    }
    return entries;
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
    const incompatible = [manifest.minimumHostVersion, feed.minimumHostVersion].some(
      (version) => version && compareVersions(version, this.hostVersion) > 0,
    );
    return { ...manifest, source, unavailable: incompatible ? 'host' : undefined };
  }
}

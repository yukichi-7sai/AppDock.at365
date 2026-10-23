import { hostText } from '../../shared/i18n';
import { compareVersions, validRepository } from '../../shared/versions';
import type { UpdateResult } from '../../shared/contracts';

export async function checkUpdate(
  currentVersion: string,
  repository?: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<UpdateResult> {
  const base = { currentVersion, checkedAt: new Date().toISOString() };
  if (!repository) return { ...base, status: 'unsupported' };
  if (!validRepository(repository)) throw new Error(hostText('services.updates.invalidSource'));
  const response = await fetcher(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AppDock.at365',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (response.status === 404) return { ...base, status: 'unpublished' };
  if (!response.ok)
    throw new Error(hostText('services.updates.httpError', { status: String(response.status) }));
  const text = await response.text();
  if (text.length > 1024 * 1024) throw new Error(hostText('services.updates.responseLimit'));
  const release = JSON.parse(text);
  if (release.draft || release.prerelease)
    throw new Error(hostText('services.updates.stableReleaseRequired'));
  const latestVersion = release.tag_name;
  const newer = compareVersions(latestVersion, currentVersion) > 0;
  return { ...base, latestVersion, status: newer ? 'available' : 'current' };
}
export function releasesUrl(repository: string): string {
  if (!validRepository(repository)) throw new Error(hostText('services.updates.invalidSource'));
  return `https://github.com/${repository}/releases`;
}

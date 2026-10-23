import { hostText } from './i18n';
// A saved source is a publish directory/update.json, an HTTP(S) feed, or a GitHub repository.
export function validateUpdateSource(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value))
    throw Error(hostText('services.sharedUpdateSources.length'));
  if (!value.trim()) return;
  if (/^github:/i.test(value)) {
    if (!/^github:[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value))
      throw Error(hostText('services.sharedUpdateSources.githubSyntax'));
    return;
  }
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password || url.hash)
      throw Error(hostText('services.sharedUpdateSources.unsafeUrl'));
    return;
  }
  if (!/^[A-Za-z]:[\\/]/.test(value) && !/^\\\\[^\\/]+\\[^\\/]+/.test(value))
    throw Error(hostText('services.sharedUpdateSources.invalidSource'));
  if (/^\\\\[?.]\\/.test(value)) throw Error(hostText('services.sharedUpdateSources.devicePath'));
}

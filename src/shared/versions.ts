import { hostText } from './i18n';
// Stable SemVer only: prereleases never masquerade as stable updates.
export function parseVersion(value: unknown): number[] {
  if (
    typeof value !== 'string' ||
    !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/.test(value)
  )
    throw new Error(hostText('services.sharedVersions.invalidVersion'));
  const parts = value.replace(/^v/, '').split('+')[0].split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part)))
    throw new Error(hostText('services.sharedVersions.versionLimit'));
  return parts;
}
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left),
    b = parseVersion(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
export function validRepository(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)
  );
}

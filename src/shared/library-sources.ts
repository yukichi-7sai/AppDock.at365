import { hostText } from './i18n';

export type LibrarySourceAccess = 'read-only' | 'read-write';
export interface ExternalLibrarySource {
  id: string;
  name: string;
  path: string;
  access: LibrarySourceAccess;
}
export interface LibrarySourceSnapshot extends ExternalLibrarySource {
  available: boolean;
  loading: boolean;
  canWrite: boolean;
}
export type ExternalLibrarySources = ExternalLibrarySource[];
const sourceId = /^[a-z0-9][a-z0-9-]*$/;
/** A colon cannot occur in a normal Windows filename, so existing relative refs do not collide. */
export function externalLibraryPath(id: string, relative = '') {
  if (!sourceId.test(id)) throw Error('Invalid library source ID');
  return `@external:${id}${relative ? '/' + relative : ''}`;
}
export function externalLibraryLocation(
  value: unknown,
): { id: string; relative: string } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^@external:([a-z0-9][a-z0-9-]*)(?:\/(.*))?$/.exec(value);
  return match ? { id: match[1], relative: match[2] ?? '' } : undefined;
}
export function parseExternalLibrarySources(value: unknown): ExternalLibrarySources {
  if (value === undefined) return [];
  const invalid = () => Error(hostText('library.sources.invalid'));
  if (!Array.isArray(value)) throw invalid();
  const ids = new Set<string>(),
    paths = new Set<string>();
  for (const row of value) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).some((k) => !['id', 'name', 'path', 'access'].includes(k)) ||
      typeof row.id !== 'string' ||
      !sourceId.test(row.id) ||
      ids.has(row.id) ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      /[\x00-\x1f\x7f]/.test(row.name) ||
      typeof row.path !== 'string' ||
      !/^(?:[a-z]:[\\/]|\\\\[^\\/? .]+\\[^\\/? .]+)/i.test(row.path) ||
      /[\x00-\x1f\x7f]/.test(row.path) ||
      // Writable external roots are deliberately not enabled by editing settings JSON.
      row.access !== 'read-only'
    )
      throw invalid();
    const key = row.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (paths.has(key)) throw invalid();
    ids.add(row.id);
    paths.add(key);
  }
  return structuredClone(value);
}

export function libraryRootFolder(folder: string) {
  const location = externalLibraryLocation(folder);
  return location ? externalLibraryPath(location.id, '*') : '*';
}

export function libraryFolderLabel(
  folder: string,
  sources: ExternalLibrarySource[],
  directLabel: string,
) {
  const location = externalLibraryLocation(folder);
  if (!location) return folder;
  const source = sources.find((source) => source.id === location.id);
  return location.relative === '*'
    ? (source?.name ?? '')
    : `${source?.name ?? ''}/${location.relative || directLabel}`;
}

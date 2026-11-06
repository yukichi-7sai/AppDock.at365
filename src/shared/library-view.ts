import type { LibraryEntry } from './library-assets';

export interface LibraryView {
  mode: 'cards' | 'list';
  sort: 'manual' | 'name' | 'type' | 'modified' | 'size';
  direction: 'ascending' | 'descending';
}
export const defaultLibraryView: LibraryView = {
  mode: 'cards',
  sort: 'manual',
  direction: 'ascending',
};
export function validLibraryView(value: unknown): value is LibraryView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as LibraryView;
  return (
    Object.keys(v).every((key) => ['mode', 'sort', 'direction'].includes(key)) &&
    ['cards', 'list'].includes(v.mode) &&
    ['manual', 'name', 'type', 'modified', 'size'].includes(v.sort) &&
    ['ascending', 'descending'].includes(v.direction)
  );
}
const names = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
/** Sort a display projection only. Missing measurements always follow known values. */
export function compareLibraryEntries(
  a: LibraryEntry,
  b: LibraryEntry,
  view: LibraryView,
  modified: (entry: LibraryEntry) => number | undefined,
) {
  if (view.sort === 'manual') return 0;
  const name = () =>
    names.compare(a.ref.file.split('/').at(-1)!, b.ref.file.split('/').at(-1)!) ||
    names.compare(a.ref.file, b.ref.file);
  let result = 0;
  if (view.sort === 'name') result = name();
  else if (view.sort === 'type')
    result = names.compare(a.ref.file.split('.').at(-1)!, b.ref.file.split('.').at(-1)!);
  else {
    const av = view.sort === 'modified' ? modified(a) : a.available ? a.bytes : undefined;
    const bv = view.sort === 'modified' ? modified(b) : b.available ? b.bytes : undefined;
    if (av === undefined || bv === undefined) {
      if (av !== bv) return av === undefined ? 1 : -1;
    } else result = av - bv;
  }
  return (view.direction === 'descending' ? -result : result) || name();
}

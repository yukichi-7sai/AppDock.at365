const number = new Intl.NumberFormat('ja', { maximumFractionDigits: 1 });

/** Human-readable file bytes; unknown measurements must not look like empty files. */
export function libraryFileSize(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${number.format(value)} ${units[unit]}`;
}

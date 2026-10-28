/** Derived indexes belong to an immutable settings snapshot, never to saved JSON. */
const processIndexes = new WeakMap<readonly string[], ReadonlySet<string>>();
const stringIndexes = new WeakMap<readonly string[], ReadonlySet<string>>();

export const normalizeProcessName = (name: string) => name.replace(/\.exe$/i, '').toLowerCase();

/** Prepare once when accepting settings. Freezing prevents a cached index becoming stale. */
export function prepareProcessNames(names: readonly string[]): void {
  if (processIndexes.has(names)) return;
  processIndexes.set(Object.freeze(names), new Set(names.map(normalizeProcessName)));
}

export function processNameIndex(names: readonly string[]): ReadonlySet<string> {
  // Compatibility callers may pass mutable drafts. Do not cache their contents.
  return processIndexes.get(names) ?? new Set(names.map(normalizeProcessName));
}

export function prepareStringNames(names: readonly string[]): void {
  if (!stringIndexes.has(names)) stringIndexes.set(Object.freeze(names), new Set(names));
}

export function stringNameIndex(names: readonly string[]): ReadonlySet<string> {
  return stringIndexes.get(names) ?? new Set(names);
}

type InputRow = { key?: string; gesture?: string };
const inputIndexes = new WeakMap<readonly InputRow[], ReadonlyMap<string, readonly number[]>>();

export function prepareInputRows(rows: readonly InputRow[], field: 'key' | 'gesture'): void {
  if (inputIndexes.has(rows)) return;
  const index = new Map<string, number[]>();
  rows.forEach((row, position) => {
    const input = row[field] ?? '';
    const positions = index.get(input) ?? [];
    positions.push(position);
    index.set(input, positions);
    Object.freeze(row);
  });
  inputIndexes.set(Object.freeze(rows), index);
}

/** Multiple equivalent keys still follow saved row order, including duplicate commands. */
export function inputRows<T extends InputRow>(
  rows: readonly T[],
  inputs: readonly string[],
  field: 'key' | 'gesture' = 'key',
): T[] {
  const index = inputIndexes.get(rows);
  if (!index) {
    const keys = new Set(inputs);
    return rows.filter((row) => keys.has(row[field] ?? ''));
  }
  const positions = [...new Set(inputs)].flatMap((input) => index.get(input) ?? []);
  if (inputs.length > 1) positions.sort((a, b) => a - b);
  return positions.map((position) => rows[position]);
}

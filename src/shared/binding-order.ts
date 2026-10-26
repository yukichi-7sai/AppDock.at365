import { hostText } from './i18n';
import type { InputExecutionModes } from './input-execution';

/** Change order and per-input behavior together, preserving untouched groups and their options. */
export function applyBindingSettings<R extends { id: string }>(
  current: R[],
  original: R[],
  ordered: R[],
  currentModes: InputExecutionModes,
  originalModes: InputExecutionModes,
  modes: InputExecutionModes,
  input: (row: R) => string,
  label: (input: string) => string,
): { bindings: R[]; inputExecutionModes: InputExecutionModes } {
  const nextModes = { ...currentModes };
  for (const key of new Set([
    ...original.map(input),
    ...Object.keys(originalModes),
    ...Object.keys(modes),
  ])) {
    const before = original.filter((row) => input(row) === key);
    const after = ordered.filter((row) => input(row) === key);
    const modeChanged = originalModes[key] !== modes[key];
    const orderChanged =
      before.map((row) => row.id).join('\n') !== after.map((row) => row.id).join('\n');
    if (!modeChanged && !orderChanged) continue;
    if (
      JSON.stringify(current.filter((row) => input(row) === key)) !== JSON.stringify(before) ||
      currentModes[key] !== originalModes[key]
    )
      throw Error(hostText('services.sharedBindingOrder.changed', { name: label(key) }));
    if (modeChanged) {
      if (modes[key]) nextModes[key] = modes[key];
      else delete nextModes[key];
    }
  }
  return {
    bindings: applyBindingOrder(current, original, ordered, input, label),
    inputExecutionModes: nextModes,
  };
}
/** Merge reordered groups atomically without overwriting concurrent changes to other inputs. */
export function applyBindingOrder<R extends { id: string }>(
  current: R[],
  original: R[],
  ordered: R[],
  input: (row: R) => string,
  label: (input: string) => string,
): R[] {
  const replacements = new Map<string, R[]>();
  for (const key of new Set(original.map(input))) {
    const before = original.filter((row) => input(row) === key);
    const after = ordered.filter((row) => input(row) === key);
    if (JSON.stringify(before.map((row) => row.id)) === JSON.stringify(after.map((row) => row.id)))
      continue;
    const live = current.filter((row) => input(row) === key);
    if (
      JSON.stringify(live) !== JSON.stringify(before) ||
      after.length !== before.length ||
      new Set(after.map((row) => row.id)).size !== before.length ||
      after.some((row) => !before.some((old) => old.id === row.id))
    )
      throw Error(hostText('services.sharedBindingOrder.changed', { name: String(label(key)) }));
    replacements.set(
      key,
      after.map((row) => live.find((item) => item.id === row.id)!),
    );
  }
  const offsets = new Map<string, number>();
  return current.map((row) => {
    const key = input(row),
      group = replacements.get(key);
    if (!group) return row;
    const index = offsets.get(key) ?? 0;
    offsets.set(key, index + 1);
    return group[index];
  });
}

import type { SettingDefinition } from './contracts';
import { objectFieldValue, setObjectField } from './object-list';
export interface SettingListDraftResult {
  values: Record<string, unknown>;
  message?: string;
  image?: { base64: string; preview: string };
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Suggestions may refresh earlier imports, but never replace manual or in-flight edits. */
export function mergeSettingListDraft(
  definition: SettingDefinition,
  current: Record<string, unknown>,
  before: Record<string, unknown>,
  result: SettingListDraftResult,
  changed: Set<string>,
) {
  const action = definition.list!.draftAction!,
    draft = structuredClone(current);
  const previous = current[action.historyKey];
  const history =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {};
  for (const key of action.fields) {
    if (!Object.hasOwn(result.values, key) || changed.has(key)) continue;
    const field = definition.fields!.find((field) => field.key === key)!;
    const value = objectFieldValue(current, field);
    if (!equal(value, objectFieldValue(before, field))) continue;
    if (
      equal(value, history[key]) ||
      equal(value, field.default) ||
      value === undefined ||
      value === '' ||
      (key === action.inputKey && history[key] === undefined)
    )
      setObjectField(draft, field, structuredClone(result.values[key]));
  }
  draft[action.historyKey] = { ...history, ...structuredClone(result.values) };
  return draft;
}

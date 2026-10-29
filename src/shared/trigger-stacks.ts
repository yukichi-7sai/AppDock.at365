import type { Settings } from './contracts';
import { hostText } from './i18n';
import { normalizeShortcut } from './commands';
import {
  getKeybindings,
  getKeybindingOptions,
  withKeybindings,
  type Keybinding,
} from './keybindings';
import { defaultGestures, gestureTypes, normalizeGesture, type GestureBinding } from './gestures';
import { defaultTouchpadGestures, touchpadGestureTypes, touchpadId } from './touchpad-gestures';
import { parseCommandStack, type CommandStackEntry } from './command-stacks';
import { compareShortcutDisplayOrder } from './shortcut-key-catalog';
import { parseCommandExecutionMode, type CommandExecutionMode } from './command-execution-mode';

export type TriggerStackKind = 'shortcuts' | 'gestures' | 'touchpad-gestures';
export interface TriggerStack {
  kind: TriggerStackKind;
  input: string;
  executionMode: 'inherit' | CommandExecutionMode;
  entries: CommandStackEntry[];
}
export function triggerStackKey(stack: Pick<TriggerStack, 'kind' | 'input'>) {
  return JSON.stringify([stack.kind, stack.input]);
}
/** The gesture-wide default, independently of any per-input override. */
export function inheritedTriggerExecutionMode(settings: Settings, kind: TriggerStackKind) {
  return kind === 'shortcuts'
    ? getKeybindingOptions(settings).executionMode
    : kind === 'gestures'
      ? (settings.gestures ?? defaultGestures()).executionMode
      : (settings.touchpadGestures ?? defaultTouchpadGestures()).executionMode;
}
/** Presentation order only; keep each stack's execution order and stored rows intact. */
export function sortTriggerStacksForDisplay(stacks: readonly TriggerStack[]): TriggerStack[] {
  const kinds = ['shortcuts', 'gestures', 'touchpad-gestures'];
  const mouse = new Map<string, number>(gestureTypes.map(([id], index) => [id, index]));
  const touchpad = new Map<string, number>(touchpadGestureTypes.map(([id], index) => [id, index]));
  return [...stacks].sort((a, b) => {
    if (a.kind !== b.kind) return kinds.indexOf(a.kind) - kinds.indexOf(b.kind);
    if (a.kind === 'shortcuts') return compareShortcutDisplayOrder(a.input, b.input);
    const catalog = a.kind === 'gestures' ? mouse : touchpad;
    const order = (catalog.get(a.input) ?? catalog.size) - (catalog.get(b.input) ?? catalog.size);
    if (!order && a.input.startsWith('key:') && b.input.startsWith('key:'))
      return compareShortcutDisplayOrder(a.input.slice(4), b.input.slice(4));
    return order || (a.input < b.input ? -1 : a.input > b.input ? 1 : 0);
  });
}
export function normalizeStackInput(kind: TriggerStackKind, input: string) {
  return kind === 'shortcuts'
    ? normalizeShortcut(input)
    : kind === 'gestures'
      ? normalizeGesture(input)
      : touchpadId(input);
}
/** These views adapt the input modules to a single persisted stack per trigger. */
export function triggerStacks(settings: Settings, kind?: TriggerStackKind): TriggerStack[] {
  const result: TriggerStack[] = [];
  for (const current of ['shortcuts', 'gestures', 'touchpad-gestures'] as const) {
    if (kind && kind !== current) continue;
    const options =
      current === 'shortcuts'
        ? getKeybindingOptions(settings)
        : current === 'gestures'
          ? (settings.gestures ?? defaultGestures())
          : (settings.touchpadGestures ?? defaultTouchpadGestures());
    const rows =
      current === 'shortcuts'
        ? getKeybindings(settings)
        : (options as ReturnType<typeof defaultGestures>).bindings;
    const inputs = [
      ...new Set([
        ...rows.map((row) => ('key' in row ? row.key : row.gesture)),
        ...Object.keys(options.inputExecutionModes),
      ]),
    ];
    for (const input of inputs)
      result.push({
        kind: current,
        input,
        executionMode: options.inputExecutionModes[input] ?? 'inherit',
        entries: rows
          .filter((row) => ('key' in row ? row.key : row.gesture) === input)
          .map((row) => {
            const { id, command, enabled, when } = row;
            return {
              id,
              command,
              enabled,
              when: structuredClone(when),
              ...('blockOriginalInput' in row
                ? { blockOriginalInput: row.blockOriginalInput }
                : {}),
            };
          }),
      });
  }
  return result;
}
export function applyTriggerStack(
  settings: Settings,
  value: TriggerStack | null,
  original?: TriggerStack,
): Settings {
  const current = triggerStacks(settings);
  if (
    original &&
    JSON.stringify(
      current.find((stack) => triggerStackKey(stack) === triggerStackKey(original)),
    ) !== JSON.stringify(original)
  )
    throw Error(hostText('settings.commandTriggers.conflict'));
  if (!value && !original) return settings;
  const normalized = value && {
    ...value,
    executionMode:
      value.executionMode === 'inherit'
        ? ('inherit' as const)
        : parseCommandExecutionMode(value.executionMode),
    input: normalizeStackInput(value.kind, value.input),
    entries: parseCommandStack({ executionMode: 'all', entries: value.entries }).entries,
  };
  if (
    normalized &&
    (!original || triggerStackKey(normalized) !== triggerStackKey(original)) &&
    current.some((stack) => triggerStackKey(stack) === triggerStackKey(normalized))
  )
    throw Error(hostText('settings.commandStacks.triggerExists'));
  const changed = new Set([original?.kind, normalized?.kind]);
  const stacks = current.filter(
    (stack) => !original || triggerStackKey(stack) !== triggerStackKey(original),
  );
  if (normalized) stacks.push(normalized);
  let next = settings;
  for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures'] as const) {
    if (!changed.has(kind)) continue;
    const own = stacks.filter((stack) => stack.kind === kind);
    const modes = Object.fromEntries(
      own
        .filter((stack) => stack.executionMode !== 'inherit')
        .map((stack) => [stack.input, stack.executionMode as CommandExecutionMode]),
    );
    if (kind === 'shortcuts') {
      const rows: Keybinding[] = own.flatMap((stack) =>
        stack.entries.map((row) => ({ ...row, key: stack.input })),
      );
      next = withKeybindings(
        {
          ...next,
          keybindingOptions: { ...getKeybindingOptions(next), inputExecutionModes: modes },
        },
        rows,
      );
    } else {
      const rows: GestureBinding[] = own.flatMap((stack) =>
        stack.entries.map(({ blockOriginalInput: _block, ...row }) => ({
          ...row,
          gesture: stack.input,
          when: { ...row.when, processes: row.when.processes ?? [] },
        })),
      );
      const key = kind === 'gestures' ? 'gestures' : 'touchpadGestures';
      const options =
        next[key] ?? (kind === 'gestures' ? defaultGestures() : defaultTouchpadGestures());
      next = { ...next, [key]: { ...options, bindings: rows, inputExecutionModes: modes } };
    }
  }
  return next;
}

export function parseStoredTriggerStacks(value: unknown): TriggerStack[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(hostText('settings.commandStacks.invalid'));
  const block = value as Record<string, unknown>;
  if (
    block.version !== 1 ||
    !Array.isArray(block.items) ||
    Object.keys(block).some((key) => !['version', 'items'].includes(key))
  )
    throw Error(hostText('settings.commandStacks.invalid'));
  const keys = new Set<string>(),
    rowIds = new Set<string>();
  return block.items.map((raw) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !['shortcuts', 'gestures', 'touchpad-gestures'].includes(raw.kind) ||
      typeof raw.input !== 'string' ||
      Object.keys(raw).some((key) => !['kind', 'input', 'executionMode', 'entries'].includes(key))
    )
      throw Error(hostText('settings.commandStacks.invalid'));
    const entries = parseCommandStack({ executionMode: 'all', entries: raw.entries }).entries;
    const stack: TriggerStack = {
      kind: raw.kind,
      input: normalizeStackInput(raw.kind, raw.input),
      executionMode:
        raw.executionMode === 'inherit' ? 'inherit' : parseCommandExecutionMode(raw.executionMode),
      entries,
    };
    const key = triggerStackKey(stack);
    if (keys.has(key)) throw Error(hostText('settings.commandStacks.invalid'));
    keys.add(key);
    for (const row of entries) {
      const rowKey = stack.kind + ':' + row.id;
      if (rowIds.has(rowKey)) throw Error(hostText('settings.commandStacks.invalid'));
      rowIds.add(rowKey);
    }
    return stack;
  });
}

/** Decode once at the storage boundary. No copied stack collection remains in runtime state. */
export function restoreTriggerStackStorage(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.triggerStacks === undefined) return raw;
  const stacks = parseStoredTriggerStacks(raw.triggerStacks);
  const { triggerStacks: _stacks, ...next } = raw;
  for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures'] as const) {
    const own = stacks.filter((stack) => stack.kind === kind);
    const modes = Object.fromEntries(
      own
        .filter((stack) => stack.executionMode !== 'inherit')
        .map((stack) => [stack.input, stack.executionMode]),
    );
    const key =
      kind === 'shortcuts'
        ? 'keybindingOptions'
        : kind === 'gestures'
          ? 'gestures'
          : 'touchpadGestures';
    const options = next[key];
    next[key] = {
      ...(options && typeof options === 'object' && !Array.isArray(options) ? options : {}),
      inputExecutionModes: modes,
      ...(kind === 'shortcuts'
        ? {}
        : {
            bindings: own.flatMap((stack) =>
              stack.entries.map(({ blockOriginalInput: _block, ...row }) => ({
                ...row,
                gesture: stack.input,
                when: { ...row.when, processes: row.when.processes ?? [] },
              })),
            ),
          }),
    };
    if (kind === 'shortcuts')
      next.keybindings = own.flatMap((stack) =>
        stack.entries.map((row) => ({ ...row, key: stack.input })),
      );
  }
  return next;
}

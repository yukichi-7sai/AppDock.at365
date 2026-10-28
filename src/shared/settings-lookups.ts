import type { Settings } from './contracts';
import { customItems, customCommandId, type CustomCommandDefinition } from './custom-commands';
import { commandStackTypeId, parseCommandStack, type CommandStack } from './command-stacks';
import { prepareInputRows, prepareProcessNames, prepareStringNames } from './settings-indexes';

type Lookups = {
  customById: ReadonlyMap<string, CustomCommandDefinition>;
  customByCommandId: ReadonlyMap<string, CustomCommandDefinition>;
  stacks: ReadonlyMap<string, CommandStack>;
};
const lookups = new WeakMap<Settings, Lookups>();

function freezeValues(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeValues(child);
  Object.freeze(value);
}

function prepareCondition(when: {
  appletIds: readonly string[];
  processes?: readonly string[];
  excludedProcesses?: readonly string[];
}) {
  prepareStringNames(when.appletIds);
  if (when.processes) prepareProcessNames(when.processes);
  if (when.excludedProcesses) prepareProcessNames(when.excludedProcesses);
}

/** Called after parsing/cloning the accepted snapshot. Indexes never cross a settings revision. */
export function prepareSettingsLookups(settings: Settings): void {
  if (lookups.has(settings)) return;
  for (const [rows, field] of [
    [settings.keybindings, 'key'],
    [settings.gestures?.bindings, 'gesture'],
    [settings.touchpadGestures?.bindings, 'gesture'],
  ] as const) {
    if (!rows) continue;
    for (const row of rows) prepareCondition(row.when);
    prepareInputRows(rows, field);
  }
  for (const names of [
    settings.commandTriggerOptions?.browsers,
    settings.keybindingOptions?.excludedProcesses,
    settings.gestures?.excludedProcesses,
    settings.touchpadGestures?.excludedProcesses,
  ]) {
    if (names) prepareProcessNames(names);
  }
  const items = customItems(settings.customCommands);
  // Accepted definitions and their config share the lifetime of these indexes.
  freezeValues(items);
  const stacks = new Map<string, CommandStack>();
  for (const item of items) {
    if (item.typeId !== commandStackTypeId) continue;
    try {
      const stack = parseCommandStack(item.config);
      for (const row of stack.entries) prepareCondition(row.when);
      freezeValues(stack);
      stacks.set(item.id, stack);
    } catch {
      // Unknown/invalid stored definitions remain visible as unavailable commands.
    }
  }
  lookups.set(settings, {
    customById: new Map(items.map((item) => [item.id, item])),
    customByCommandId: new Map(items.map((item) => [customCommandId(item.id), item])),
    stacks,
  });
}

export function settingsLookups(settings: Settings): Lookups {
  prepareSettingsLookups(settings);
  return lookups.get(settings)!;
}

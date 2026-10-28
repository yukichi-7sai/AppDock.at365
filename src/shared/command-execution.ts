import {
  matchesCommandCondition,
  type CommandCondition,
  type ConditionEnvironment,
  type TriggerContext,
} from './command-conditions';
import { expandStackCommand, type CommandStack } from './command-stacks';

export type CommandExecutionMode = 'first' | 'all';
export interface TriggerBinding {
  id: string;
  command: string;
  enabled: boolean;
  when: CommandCondition;
}
export interface CommandCatalogEntry {
  id: string;
  extensionId?: string | null;
  available?: boolean;
  stack?: CommandStack;
}
export interface CommandBatchPlan {
  readonly commands: readonly string[];
  readonly rowIds: readonly string[];
  readonly stackIds?: readonly string[];
}

/** Shared by planning and compatibility adapters; busy state never changes selection. */
export function selectCommandBindings<T extends { command: string }>(
  rows: readonly T[],
  mode: CommandExecutionMode,
): T[] {
  if (mode !== 'all' && mode !== 'first') throw Error('Unknown command execution mode.');
  const selected: T[] = [];
  for (const row of rows) {
    selected.push(row);
    if (mode === 'first') break;
  }
  return selected;
}

export function planCommandBatch(
  rows: readonly TriggerBinding[],
  context: TriggerContext,
  catalog: readonly CommandCatalogEntry[],
  mode: CommandExecutionMode,
  environment: ConditionEnvironment = {},
): CommandBatchPlan {
  const available = new Map(catalog.filter((c) => c.available !== false).map((c) => [c.id, c]));
  const expanded = new Map<string, ReturnType<typeof expandStackCommand>>();
  if (mode !== 'all' && mode !== 'first') throw Error('Unknown command execution mode.');
  const selected: TriggerBinding[] = [];
  for (const row of rows) {
    const command = available.get(row.command);
    if (
      !row.enabled ||
      !command ||
      !matchesCommandCondition(row.when, context, command.extensionId, environment)
    )
      continue;
    const plan =
      expanded.get(row.command) ?? expandStackCommand(row.command, available, context, environment);
    expanded.set(row.command, plan);
    if (!plan.commands.length) continue;
    selected.push(row);
    if (mode === 'first') break;
  }
  const stackIds = [
    ...new Set(selected.flatMap((row) => expanded.get(row.command)?.stackIds ?? [])),
  ];
  const commands = selected.flatMap((row) => expanded.get(row.command)?.commands ?? []);
  return Object.freeze({
    commands: Object.freeze(commands),
    rowIds: Object.freeze(selected.map((row) => row.id)),
    ...(stackIds.length ? { stackIds: Object.freeze(stackIds) } : {}),
  });
}

/** Already-authorized callers retain the same selection rules during internal adaptation. */
export function commandBatch(commands: readonly string[]): CommandBatchPlan {
  const selected = selectCommandBindings(
    commands.map((command) => ({ command })),
    'all',
  );
  return Object.freeze({
    commands: Object.freeze(selected.map((row) => row.command)),
    rowIds: Object.freeze([] as string[]),
  });
}

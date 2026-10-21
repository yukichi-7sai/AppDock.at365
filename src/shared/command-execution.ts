import {
  matchesCommandCondition,
  type CommandCondition,
  type ConditionEnvironment,
  type TriggerContext,
} from './command-conditions';

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
}
export interface CommandBatchPlan {
  readonly commands: readonly string[];
  readonly rowIds: readonly string[];
}

/** Shared by planning and compatibility adapters; busy state never changes selection. */
export function selectCommandBindings<T extends { command: string }>(
  rows: readonly T[],
  mode: CommandExecutionMode,
): T[] {
  if (mode !== 'all' && mode !== 'first') throw Error('Unknown command execution mode.');
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const row of rows) {
    if (seen.has(row.command)) continue;
    seen.add(row.command);
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
  const selected = selectCommandBindings(
    rows.filter((row) => {
      const command = available.get(row.command);
      return (
        row.enabled &&
        !!command &&
        matchesCommandCondition(row.when, context, command.extensionId, environment)
      );
    }),
    mode,
  );
  return Object.freeze({
    commands: Object.freeze(selected.map((row) => row.command)),
    rowIds: Object.freeze(selected.map((row) => row.id)),
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

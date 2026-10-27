import { hostText } from './i18n';
import { validCommandId } from './commands';
import { validShortcutTarget } from './shortcut-pages';
import {
  commandCondition,
  matchesCommandCondition,
  processNames,
  type ConditionEnvironment,
  type TriggerContext,
} from './command-conditions';
import type { CustomCommandDefinition, CustomCommandType } from './custom-commands';
import type { Keybinding } from './keybindings';

export const commandStackTypeId = 'appdock.commands.stack';
export const maximumStackDepth = 8;
export const maximumStackEntries = 256;
export const maximumExpandedCommands = 2000;
export interface CommandStackEntry {
  id: string;
  command: string;
  enabled: boolean;
  when: Keybinding['when'];
  blockOriginalInput?: boolean;
}
export interface CommandStack {
  executionMode: 'first' | 'all';
  entries: CommandStackEntry[];
}
export interface StackCatalogEntry {
  id: string;
  extensionId?: string | null;
  available?: boolean;
  stack?: CommandStack;
}
export const emptyCommandStack = (): CommandStack => ({ executionMode: 'all', entries: [] });
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never {
  throw Error(hostText('settings.commandStacks.invalid'));
}
export function parseCommandStack(value: unknown, limit = maximumStackEntries): CommandStack {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['executionMode', 'entries'].includes(key)) ||
    !['first', 'all'].includes(String(value.executionMode)) ||
    !Array.isArray(value.entries) ||
    value.entries.length > limit
  )
    invalid();
  const seen = new Set<string>();
  const entries = value.entries.map((raw: unknown): CommandStackEntry => {
    if (
      !object(raw) ||
      !validCommandId(raw.id) ||
      seen.has(raw.id) ||
      !validCommandId(raw.command) ||
      typeof raw.enabled !== 'boolean' ||
      !object(raw.when) ||
      Object.keys(raw).some(
        (key) => !['id', 'command', 'enabled', 'when', 'blockOriginalInput'].includes(key),
      ) ||
      (raw.blockOriginalInput !== undefined && typeof raw.blockOriginalInput !== 'boolean')
    )
      invalid();
    seen.add(raw.id as string);
    const when = raw.when as Record<string, unknown>;
    if (
      !['global', 'app', 'pages', 'owner', 'applets', 'desktop', 'browser', 'exe'].includes(
        String(when.scope),
      ) ||
      !Array.isArray(when.appletIds) ||
      when.appletIds.length > 500 ||
      when.appletIds.some((id) => !validShortcutTarget(id)) ||
      new Set(when.appletIds).size !== when.appletIds.length ||
      (when.scope === 'applets' ? !when.appletIds.length : !!when.appletIds.length) ||
      (when.excludeDesktop !== undefined && typeof when.excludeDesktop !== 'boolean') ||
      (when.excludeDesktop && !['global', 'exe'].includes(String(when.scope))) ||
      Object.keys(when).some(
        (key) =>
          !['scope', 'appletIds', 'processes', 'excludeDesktop', 'excludedProcesses'].includes(key),
      )
    )
      invalid();
    const processes = processNames(when.processes ?? []);
    const excludedProcesses = processNames(when.excludedProcesses ?? []);
    if (
      (when.scope === 'exe' ? !processes.length : !!processes.length) ||
      (when.scope !== 'global' && excludedProcesses.length)
    )
      invalid();
    return {
      id: raw.id as string,
      command: raw.command as string,
      enabled: raw.enabled as boolean,
      when: {
        scope: when.scope as Keybinding['when']['scope'],
        appletIds: [...when.appletIds] as string[],
        ...(when.processes === undefined ? {} : { processes }),
        ...(when.excludedProcesses === undefined ? {} : { excludedProcesses }),
        ...(when.excludeDesktop === undefined
          ? {}
          : { excludeDesktop: when.excludeDesktop as boolean }),
      },
      ...(raw.blockOriginalInput === undefined
        ? {}
        : { blockOriginalInput: raw.blockOriginalInput as boolean }),
    };
  });
  return { executionMode: value.executionMode as CommandStack['executionMode'], entries };
}

/** A stack is a host-owned command type; it never grants authority to its children. */
export const commandStackType = (): CustomCommandType => ({
  id: commandStackTypeId,
  title: hostText('settings.commandStacks.type'),
  description: hostText('settings.commandStacks.description'),
  configVersion: 1,
  automation: true,
  configSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['executionMode', 'entries'],
    properties: {
      executionMode: { type: 'string', enum: ['first', 'all'] },
      entries: {
        type: 'array',
        maxItems: maximumStackEntries,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'command', 'enabled', 'when'],
          properties: {
            id: { type: 'string', maxLength: 200 },
            command: { type: 'string', maxLength: 200 },
            enabled: { type: 'boolean' },
            blockOriginalInput: { type: 'boolean' },
            when: {
              type: 'object',
              additionalProperties: false,
              required: ['scope', 'appletIds'],
              properties: {
                scope: {
                  type: 'string',
                  enum: ['global', 'app', 'pages', 'owner', 'applets', 'desktop', 'browser', 'exe'],
                },
                appletIds: {
                  type: 'array',
                  maxItems: 500,
                  items: { type: 'string', maxLength: 200 },
                },
                processes: {
                  type: 'array',
                  maxItems: 100,
                  items: { type: 'string', maxLength: 120 },
                },
                excludedProcesses: {
                  type: 'array',
                  maxItems: 100,
                  items: { type: 'string', maxLength: 120 },
                },
                excludeDesktop: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
});

export function validateStackGraph(
  definitions: readonly CustomCommandDefinition[],
  triggerRoots: readonly { entries: CommandStackEntry[] }[] = [],
) {
  const stacks = new Map(
    definitions
      .filter((d) => d.typeId === commandStackTypeId)
      .map((d) => ['appdock.custom.' + d.id, parseCommandStack(d.config)]),
  );
  const memo = new Map<string, { count: number; depth: number }>();
  const visit = (id: string, ancestors: readonly string[]): { count: number; depth: number } => {
    if (ancestors.includes(id)) throw Error(hostText('settings.commandStacks.cycle'));
    const stack = stacks.get(id);
    if (!stack) return { count: 1, depth: 0 };
    const cached = memo.get(id);
    if (cached) {
      if (ancestors.length + cached.depth > maximumStackDepth)
        throw Error(hostText('settings.commandStacks.depth'));
      return cached;
    }
    if (ancestors.length >= maximumStackDepth)
      throw Error(hostText('settings.commandStacks.depth'));
    let count = 0,
      depth = 1;
    for (const entry of stack.entries) {
      const child = visit(entry.command, [...ancestors, id]);
      count += Math.max(1, child.count);
      depth = Math.max(depth, child.depth + 1);
      if (count > maximumExpandedCommands)
        throw Error(hostText('settings.commandStacks.expandedLimit'));
    }
    const result = { count, depth };
    memo.set(id, result);
    return result;
  };
  for (const id of stacks.keys()) visit(id, []);
  for (const root of triggerRoots) {
    let count = 0;
    for (const entry of root.entries) {
      count += Math.max(1, visit(entry.command, []).count);
      if (count > maximumExpandedCommands)
        throw Error(hostText('settings.commandStacks.expandedLimit'));
    }
  }
}

/** Resolve a bounded invocation plan while preserving every selected entry. */
export function expandStackCommand(
  id: string,
  catalog: ReadonlyMap<string, StackCatalogEntry>,
  context: TriggerContext,
  environment: ConditionEnvironment = {},
  ancestors: readonly string[] = [],
  budget = { remaining: maximumExpandedCommands * maximumStackDepth },
): { commands: string[]; stackIds: string[] } {
  if (--budget.remaining < 0) return { commands: [], stackIds: [] };
  const command = catalog.get(id);
  if (!command || command.available === false) return { commands: [], stackIds: [] };
  if (!command.stack) return { commands: [id], stackIds: [] };
  if (ancestors.includes(id) || ancestors.length >= maximumStackDepth)
    return { commands: [], stackIds: [] };
  const commands: string[] = [],
    stackIds: string[] = [id];
  for (const row of command.stack.entries) {
    const child = catalog.get(row.command);
    if (
      !row.enabled ||
      !child ||
      child.available === false ||
      !matchesCommandCondition(commandCondition(row.when), context, child.extensionId, environment)
    )
      continue;
    const plan = expandStackCommand(
      row.command,
      catalog,
      context,
      environment,
      [...ancestors, id],
      budget,
    );
    if (budget.remaining < 0) return { commands: [], stackIds: [] };
    if (!plan.commands.length) continue;
    commands.push(...plan.commands);
    stackIds.push(...plan.stackIds);
    if (commands.length > maximumExpandedCommands) return { commands: [], stackIds: [] };
    if (command.stack.executionMode === 'first') break;
  }
  return { commands, stackIds: [...new Set(stackIds)] };
}

export interface StackConditionTerm {
  when: Keybinding['when'];
  ownerId?: string | null;
}
/** OR of AND paths, used by native preflight without executing or reserving commands. */
export function stackConditionPaths(
  id: string,
  catalog: ReadonlyMap<string, StackCatalogEntry>,
  ancestors: readonly string[] = [],
  budget = { remaining: maximumExpandedCommands * maximumStackDepth },
): StackConditionTerm[][] | undefined {
  if (--budget.remaining < 0) return [];
  const command = catalog.get(id);
  if (!command || command.available === false) return [];
  if (!command.stack) return undefined;
  if (ancestors.includes(id) || ancestors.length >= maximumStackDepth) return [];
  const paths: StackConditionTerm[][] = [];
  for (const row of command.stack.entries) {
    const child = catalog.get(row.command);
    if (!row.enabled || !child || child.available === false) continue;
    const suffixes = stackConditionPaths(row.command, catalog, [...ancestors, id], budget) ?? [[]];
    if (budget.remaining < 0) return [];
    for (const suffix of suffixes) {
      paths.push([{ when: row.when, ownerId: child.extensionId }, ...suffix]);
      if (paths.length > maximumExpandedCommands) return [];
    }
  }
  return paths;
}

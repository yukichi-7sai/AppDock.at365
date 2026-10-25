import { hostText } from './i18n';
import { applyBindingOrder } from './binding-order';
import {
  defaultShortcuts,
  defaultGlobalShortcutCommands,
  normalizeShortcut,
  validCommandId,
} from './commands';
import type { Settings } from './contracts';
import { getCommandTriggerOptions } from './command-trigger-options';
import { collectionPages, collectionIdentity } from './page-collections';
import { shortcutTargetTitle, validShortcutTarget } from './shortcut-pages';
import {
  commandCondition,
  matchesCommandCondition,
  processNames,
  type CommandTarget,
  type ConditionEnvironment,
} from './command-conditions';
import { planCommandBatch, type CommandExecutionMode } from './command-execution';

export const shortcutScopes = [
  { id: 'global', title: hostText('settings.keybindings.global') },
  { id: 'app', title: hostText('settings.keybindings.app') },
  { id: 'pages', title: hostText('settings.keybindings.pages') },
  { id: 'owner', title: hostText('settings.keybindings.owner') },
  { id: 'applets', title: hostText('settings.keybindings.selectedPages') },
] as const;
export type ShortcutScope = (typeof shortcutScopes)[number]['id'];
export const externalShortcutScopes = [
  { id: 'browser', title: hostText('settings.keybindings.browser') },
  { id: 'exe', title: hostText('settings.keybindings.exe') },
  { id: 'desktop', title: hostText('settings.keybindings.desktop'), after: 'global' },
] as const;
export type KeybindingScope = ShortcutScope | (typeof externalShortcutScopes)[number]['id'];
export const keybindingScopes: readonly { id: KeybindingScope; title: string }[] = [
  shortcutScopes[0],
  externalShortcutScopes[2],
  ...shortcutScopes.slice(1),
  ...externalShortcutScopes.slice(0, 2),
];
export const externalShortcutScope = (scope: string) =>
  ['global', 'desktop', 'browser', 'exe'].includes(scope);
export interface Keybinding {
  id: string;
  command: string;
  key: string;
  enabled: boolean;
  blockOriginalInput?: boolean;
  when: {
    scope: KeybindingScope;
    appletIds: string[];
    processes?: string[];
    excludeDesktop?: boolean;
  };
}
export type KeybindingDefault = Omit<Keybinding, 'id'>;
export interface ShortcutContext {
  appFocused: boolean;
  appletId?: string;
  pageId?: string;
  target?: CommandTarget;
}
export interface KeybindingOptions {
  executionMode: CommandExecutionMode;
}
export const defaultKeybindingOptions = (): KeybindingOptions => ({
  executionMode: 'all',
});
export function parseKeybindingOptions(value: unknown): KeybindingOptions {
  if (value === undefined) return defaultKeybindingOptions();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(hostText('settings.keybindings.options'));
  const source = value as Record<string, unknown>;
  if (
    source.executionMode !== undefined &&
    source.executionMode !== 'first' &&
    source.executionMode !== 'all'
  )
    throw Error(hostText('settings.keybindings.executionMode'));
  const { browsers: _browsers, requireChromiumWindowClass: _chromium, ...current } = source;
  return {
    ...current,
    executionMode: source.executionMode ?? 'all',
  } as KeybindingOptions;
}
export function getKeybindingOptions(
  settings: Pick<Settings, 'keybindingOptions' | 'commandTriggerOptions'>,
) {
  return {
    ...defaultKeybindingOptions(),
    ...settings.keybindingOptions,
    ...getCommandTriggerOptions(settings),
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseKeybindings(value: unknown): Keybinding[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw Error(hostText('settings.keybindings.list'));
  const ids = new Set<string>();
  return value.map((row) => {
    if (
      !object(row) ||
      !validCommandId(row.id) ||
      ids.has(row.id) ||
      !validCommandId(row.command) ||
      typeof row.enabled !== 'boolean' ||
      !object(row.when) ||
      (row.blockOriginalInput !== undefined && typeof row.blockOriginalInput !== 'boolean')
    )
      throw Error(hostText('settings.keybindings.binding'));
    ids.add(row.id);
    const when = row.when;
    if (
      !keybindingScopes.some((s) => s.id === when.scope) ||
      !Array.isArray(when.appletIds) ||
      when.appletIds.length > 500 ||
      when.appletIds.some((id) => !validShortcutTarget(id)) ||
      new Set(when.appletIds).size !== when.appletIds.length ||
      (when.scope === 'applets' ? !when.appletIds.length : !!when.appletIds.length) ||
      (when.excludeDesktop !== undefined && typeof when.excludeDesktop !== 'boolean') ||
      (when.excludeDesktop === true && !['global', 'exe'].includes(String(when.scope))) ||
      Object.keys(when).some(
        (k) => !['scope', 'appletIds', 'processes', 'excludeDesktop'].includes(k),
      )
    )
      throw Error(hostText('settings.keybindings.scope'));
    const key = normalizeShortcut(row.key);
    const processes = when.processes === undefined ? [] : processNames(when.processes);
    if (when.scope === 'exe' ? !processes.length : !!processes.length)
      throw Error(hostText('settings.keybindings.processes'));
    return {
      id: row.id,
      command: row.command,
      key,
      enabled: row.enabled,
      when: {
        scope: when.scope as KeybindingScope,
        appletIds: [...when.appletIds] as string[],
        ...(when.processes === undefined ? {} : { processes }),
        ...(when.excludeDesktop === undefined
          ? {}
          : { excludeDesktop: when.excludeDesktop as boolean }),
      },
      ...(row.blockOriginalInput === undefined
        ? {}
        : { blockOriginalInput: row.blockOriginalInput as boolean }),
    };
  });
}
/** Manifest defaults may only name commands declared by the same Applet. */
export function parseKeybindingDefaults(
  value: unknown,
  commands: string[],
  limit = 100,
): KeybindingDefault[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit)
    throw Error(hostText('settings.keybindings.defaultLimit', { limit: limit }));
  const allowed = new Set(commands);
  return parseKeybindings(
    value.map((row, index) => {
      if (
        !object(row) ||
        !allowed.has(String(row.command)) ||
        Object.keys(row).some(
          (key) => !['command', 'key', 'enabled', 'when', 'blockOriginalInput'].includes(key),
        )
      )
        throw Error(hostText('settings.keybindings.defaultOwner'));
      return { ...row, id: `default.${index}` };
    }),
  ).map(({ id: _id, ...row }) => row);
}

export function addDefaultBindings(
  rows: Keybinding[],
  owner: string,
  defaults: KeybindingDefault[],
): Keybinding[] {
  const assigned = new Set(rows.map((row) => row.command));
  return [
    ...rows,
    ...defaults.flatMap((row, index) =>
      assigned.has(row.command)
        ? []
        : [
            {
              ...row,
              id: `applet-default.${owner}.${index}`,
              when: structuredClone(row.when),
            },
          ],
    ),
  ];
}

export function initializeExtensionDefaults(
  settings: Settings,
  applets: { id: string; defaultKeybindings?: KeybindingDefault[] }[],
): Settings {
  const initialized = new Set(settings.keybindingDefaultsInitialized ?? []);
  let rows = getKeybindings(settings);
  for (const applet of applets) {
    if (initialized.has(applet.id)) continue;
    // An Applet already present in older settings has user-owned shortcut state.
    if (!settings.extensions[applet.id])
      rows = addDefaultBindings(rows, applet.id, applet.defaultKeybindings ?? []);
    initialized.add(applet.id);
  }
  return withKeybindings({ ...settings, keybindingDefaultsInitialized: [...initialized] }, rows);
}

export function initializeCollectionDefaults(
  settings: Settings,
  previous: Settings,
  parents: import('./contracts').ExtensionSnapshot[],
): Settings {
  const prior = new Set(
    parents.flatMap((parent) =>
      (parent.pageCollections ?? []).flatMap((definition) => {
        const rows = previous.extensions[parent.id]?.settings[definition.key];
        return Array.isArray(rows)
          ? rows
              .filter((row) => typeof row?.id === 'string')
              .map((row) => collectionIdentity(previous, parent.id, definition.key, row.id))
          : [];
      }),
    ),
  );
  let rows = getKeybindings(settings);
  for (const page of collectionPages(settings, parents)) {
    if (!page.definition.shortcutDefaultsKey) continue;
    const fallback = page.parent.settings?.find(
      (setting) => setting.key === page.definition.shortcutDefaultsKey,
    )?.default;
    const bindings = parseKeybindingDefaults(
      settings.extensions[page.binding.owner]?.settings[page.definition.shortcutDefaultsKey] ??
        fallback,
      page.definition.source === 'remote'
        ? ['open', 'back', 'forward', 'reload', 'home']
        : ['open'],
      20,
    );
    if (!prior.has(page.id))
      rows = addDefaultBindings(
        rows,
        page.id,
        bindings.map((binding) => ({ ...binding, command: `${page.id}.${binding.command}` })),
      );
  }
  return withKeybindings(settings, rows);
}

export function resetAppletKeybindings(
  settings: Settings,
  applet: {
    id: string;
    runtime: string;
    commands: { id: string }[];
    defaultKeybindings?: KeybindingDefault[];
  },
): Settings {
  const owned = new Set(applet.commands.map((command) => command.id));
  const remaining = getKeybindings(settings).filter((row) => !owned.has(row.command));
  const defaults = applet.defaultKeybindings ?? [];
  return withKeybindings(settings, addDefaultBindings(remaining, applet.id, defaults));
}
export function migrateKeybindings(
  shortcuts: Record<string, string[]>,
  globals: string[],
): Keybinding[] {
  return Object.entries(shortcuts).flatMap(([command, keys], i) =>
    keys.map((key, j) => ({
      id: `legacy.${i}.${j}`,
      command,
      key,
      enabled: true,
      when: {
        scope: globals.includes(command) ? ('global' as const) : ('app' as const),
        appletIds: [],
      },
    })),
  );
}
export function getKeybindings(
  settings: Pick<Settings, 'keybindings' | 'shortcuts' | 'globalShortcutCommands'>,
): Keybinding[] {
  return (
    settings.keybindings ?? migrateKeybindings(settings.shortcuts, settings.globalShortcutCommands)
  );
}
export function defaultKeybindings() {
  return migrateKeybindings(defaultShortcuts, defaultGlobalShortcutCommands);
}

export function protectedShortcut(key: string) {
  const parts = normalizeShortcut(key).split('+');
  return (
    (parts.includes('Win') && parts.at(-1) === 'L') ||
    (parts.includes('Ctrl') && parts.includes('Alt') && parts.at(-1) === 'Delete')
  );
}
export function globalShortcutInputs(rows: Keybinding[], available: string[]) {
  const groups = new Map<string, boolean>();
  const commands = new Set(available);
  for (const row of rows) {
    if (!row.enabled || !externalShortcutScope(row.when.scope) || !commands.has(row.command))
      continue;
    groups.set(row.key, (groups.get(row.key) ?? false) || row.blockOriginalInput !== false);
  }
  return [...groups].map(([shortcut, blockOriginalInput]) => ({ shortcut, blockOriginalInput }));
}
/** Native preselection only decides input ownership; the common planner owns first/all execution. */
export function nativeShortcutInputs(
  rows: Keybinding[],
  available: string[],
  environment: ConditionEnvironment,
) {
  return globalShortcutInputs(rows, available).map((input) => {
    const members = rows.filter(
      (row) =>
        row.key === input.shortcut &&
        row.enabled &&
        available.includes(row.command) &&
        externalShortcutScope(row.when.scope),
    );
    if (!members.some((row) => row.when.scope !== 'global' || row.when.excludeDesktop))
      return input;
    return {
      ...input,
      conditions: members.map((row) => ({
        when: {
          scope: row.when.scope,
          appletIds: [],
          processes: row.when.processes ?? [],
          excludeDesktop: row.when.excludeDesktop ?? false,
        },
        blockOriginalInput: row.blockOriginalInput !== false,
      })),
      environment: {
        browsers: environment.browsers,
        requireChromiumWindowClass: environment.requireChromiumWindowClass,
      },
    };
  });
}

/** Group display is derived; never sort the stored dispatch array to render it. */
export function keybindingGroups(rows: Keybinding[]) {
  const groups = new Map<string, Keybinding[]>();
  for (const row of rows) {
    const key = normalizeShortcut(row.key);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
}

export function moveKeybindingWithinKey(rows: Keybinding[], id: string, target: string) {
  const source = rows.find((row) => row.id === id);
  const destination = rows.find((row) => row.id === target);
  if (!source || !destination) return rows;
  const key = normalizeShortcut(source.key);
  if (normalizeShortcut(destination.key) !== key) return rows;
  const members = rows.filter((row) => normalizeShortcut(row.key) === key);
  const from = members.indexOf(source),
    to = members.indexOf(destination);
  if (from === to) return rows;
  members.splice(from, 1);
  members.splice(to, 0, source);
  let index = 0;
  return rows.map((row) => (normalizeShortcut(row.key) === key ? members[index++] : row));
}

export function appendKeybinding(rows: Keybinding[], binding: Keybinding) {
  const key = normalizeShortcut(binding.key);
  const last = rows.reduce(
    (index, row, current) => (normalizeShortcut(row.key) === key ? current : index),
    -1,
  );
  const index = last < 0 ? rows.length : last + 1;
  return [...rows.slice(0, index), { ...binding, key }, ...rows.slice(index)];
}

/** Apply only reordered key groups, preserving newer edits to unrelated keys. */
export function applyKeybindingOrder(
  current: Keybinding[],
  original: Keybinding[],
  ordered: Keybinding[],
) {
  return applyBindingOrder(
    current,
    original,
    ordered,
    (row) => normalizeShortcut(row.key),
    (key) => key,
  );
}

export function changeKeybindingKey(rows: Keybinding[], id: string, value: string) {
  const row = rows.find((row) => row.id === id);
  if (!row) return rows;
  const key = normalizeShortcut(value);
  if (normalizeShortcut(row.key) === key) return rows;
  return appendKeybinding(
    rows.filter((item) => item.id !== id),
    { ...row, key },
  );
}

export function changeKeybindingCommand(
  row: Keybinding,
  command: { id: string; extensionId?: string | null },
): Keybinding {
  return {
    ...row,
    command: command.id,
    when:
      row.when.scope === 'owner' && !command.extensionId
        ? { scope: 'app', appletIds: [] }
        : row.when,
  };
}

export function keybindingConditionLabel(
  when: Keybinding['when'],
  ownerTitle: string | undefined,
  applets: { id: string; title: string }[],
) {
  if (when.scope === 'owner') return ownerTitle ?? hostText('settings.keybindings.unknownOwner');
  if (when.scope === 'applets')
    return (
      when.appletIds.map((id) => shortcutTargetTitle(id, applets)).join(' / ') ||
      hostText('settings.keybindings.noPages')
    );
  if (when.scope === 'exe')
    return (
      (when.processes ?? []).join(' / ') +
      (when.excludeDesktop ? hostText('settings.keybindings.excludeDesktop') : '')
    );
  if (when.scope === 'global' && when.excludeDesktop)
    return hostText('settings.keybindings.globalExcludeDesktop');
  return keybindingScopes.find((scope) => scope.id === when.scope)?.title ?? when.scope;
}
/** Legacy fields are derived display/compatibility data once keybindings exists. */
export function withKeybindings(settings: Settings, rows: Keybinding[]): Settings {
  const shortcuts: Record<string, string[]> = {};
  for (const row of rows) {
    shortcuts[row.command] ??= [];
    if (row.enabled && !shortcuts[row.command].includes(row.key))
      shortcuts[row.command].push(row.key);
  }
  return {
    ...settings,
    keybindings: rows,
    shortcuts,
    globalShortcutCommands: [
      ...new Set(
        rows.filter((r) => r.enabled && externalShortcutScope(r.when.scope)).map((r) => r.command),
      ),
    ],
  };
}
export function matchesWhen(
  when: Keybinding['when'],
  context: ShortcutContext,
  extensionId?: string | null,
  environment: ConditionEnvironment = {},
): boolean {
  return matchesCommandCondition(
    commandCondition(when),
    {
      host: { focused: context.appFocused, appletId: context.appletId, pageId: context.pageId },
      target: context.target,
    },
    extensionId,
    environment,
  );
}
export function planKeybindings(
  rows: Keybinding[],
  key: string | readonly string[],
  context: ShortcutContext,
  available: { id: string; extensionId?: string | null }[],
  globalEvent = false,
  mode: CommandExecutionMode = 'all',
  environment: ConditionEnvironment = {},
) {
  const keys = new Set(typeof key === 'string' ? [key] : key);
  return planCommandBatch(
    rows
      .filter((row) => keys.has(row.key) && (globalEvent || !externalShortcutScope(row.when.scope)))
      .map((row) => ({ ...row, when: commandCondition(row.when) })),
    {
      host: { focused: context.appFocused, appletId: context.appletId, pageId: context.pageId },
      target: context.target,
    },
    available,
    mode,
    environment,
  );
}
export function resolveKeybindings(...args: Parameters<typeof planKeybindings>): string[] {
  return [...planKeybindings(...args).commands];
}
/** No host IPC or text inspection is injected into remote documents. */
export function safePageShortcut(input: { control: boolean; alt: boolean; key: string }) {
  return (
    input.control ||
    input.alt ||
    /^F([1-9]|1[0-9]|2[0-4])$/i.test(input.key) ||
    input.key === 'Pause'
  );
}

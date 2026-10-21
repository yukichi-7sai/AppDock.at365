import { applyBindingOrder } from './binding-order';
import {
  defaultShortcuts,
  defaultGlobalShortcutCommands,
  normalizeShortcut,
  validCommandId,
} from './commands';
import type { Settings } from './contracts';
import { collectionPages, collectionIdentity } from './page-collections';
import { shortcutTargetTitle, validShortcutTarget } from './shortcut-pages';

export const shortcutScopes = [
  { id: 'global', title: 'グローバル' },
  { id: 'app', title: 'AppDock全体' },
  { id: 'pages', title: 'AppDockのすべてのページ' },
  { id: 'owner', title: '提供元のApplet' },
  { id: 'applets', title: 'AppDockの指定したページ' },
] as const;
export type ShortcutScope = (typeof shortcutScopes)[number]['id'];
export interface Keybinding {
  id: string;
  command: string;
  key: string;
  enabled: boolean;
  blockOriginalInput?: boolean;
  when: { scope: ShortcutScope; appletIds: string[] };
}
export type KeybindingDefault = Omit<Keybinding, 'id'>;
export interface ShortcutContext {
  appFocused: boolean;
  appletId?: string;
  pageId?: string;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseKeybindings(value: unknown): Keybinding[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw Error('キーバインドは2000件以内の配列です。');
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
      throw Error('キーバインドのID・コマンド・有効状態・条件を確認してください。');
    ids.add(row.id);
    const when = row.when;
    if (
      !shortcutScopes.some((s) => s.id === when.scope) ||
      !Array.isArray(when.appletIds) ||
      when.appletIds.length > 500 ||
      when.appletIds.some((id) => !validShortcutTarget(id)) ||
      new Set(when.appletIds).size !== when.appletIds.length ||
      (when.scope === 'applets' ? !when.appletIds.length : !!when.appletIds.length) ||
      Object.keys(when).some((k) => !['scope', 'appletIds'].includes(k))
    )
      throw Error(
        '「いつ・どこで」の条件を確認してください。指定したページは1件以上選んでください。',
      );
    const key = normalizeShortcut(row.key);
    return {
      id: row.id,
      command: row.command,
      key,
      enabled: row.enabled,
      when: { scope: when.scope as ShortcutScope, appletIds: [...when.appletIds] as string[] },
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
    throw Error(`既定のキーバインドは${limit}件以内の配列です。`);
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
        throw Error('既定のキーバインドには自身の登録コマンドだけを指定してください。');
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
              when: { ...row.when, appletIds: [...row.when.appletIds] },
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
    if (!row.enabled || row.when.scope !== 'global' || !commands.has(row.command)) continue;
    groups.set(row.key, (groups.get(row.key) ?? false) || row.blockOriginalInput !== false);
  }
  return [...groups].map(([shortcut, blockOriginalInput]) => ({ shortcut, blockOriginalInput }));
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
  if (when.scope === 'owner') return ownerTitle ?? '提供元不明';
  if (when.scope === 'applets')
    return (
      when.appletIds.map((id) => shortcutTargetTitle(id, applets)).join(' / ') || 'ページ未選択'
    );
  return shortcutScopes.find((scope) => scope.id === when.scope)?.title ?? when.scope;
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
      ...new Set(rows.filter((r) => r.enabled && r.when.scope === 'global').map((r) => r.command)),
    ],
  };
}
export function matchesWhen(
  when: Keybinding['when'],
  context: ShortcutContext,
  extensionId?: string | null,
): boolean {
  switch (when.scope) {
    case 'global':
      return true;
    case 'app':
      return context.appFocused;
    case 'pages':
      return context.appFocused && (!!context.pageId || !!context.appletId);
    case 'owner':
      return context.appFocused && !!extensionId && context.appletId === extensionId;
    case 'applets':
      return (
        context.appFocused &&
        ((!!context.pageId && when.appletIds.includes(context.pageId)) ||
          (!!context.appletId && when.appletIds.includes(context.appletId)))
      );
    default:
      return false;
  }
}
export function resolveKeybindings(
  rows: Keybinding[],
  key: string | readonly string[],
  context: ShortcutContext,
  available: { id: string; extensionId?: string | null }[],
  globalEvent = false,
): string[] {
  const commands = new Map(available.map((command) => [command.id, command]));
  const keys = new Set(typeof key === 'string' ? [key] : key);
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.enabled &&
            keys.has(row.key) &&
            (globalEvent || row.when.scope !== 'global') &&
            commands.has(row.command) &&
            matchesWhen(row.when, context, commands.get(row.command)?.extensionId),
        )
        .map((row) => row.command),
    ),
  ];
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

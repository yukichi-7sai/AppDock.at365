import { normalizeShortcut } from './commands';
import {
  commandCondition,
  defaultConditionEnvironment,
  type TriggerContext,
} from './command-conditions';
import { planCommandBatch, type CommandCatalogEntry } from './command-execution';
import { defaultGestures, parseGestureBindings, type GestureBinding } from './gestures';
import { getKeybindings, parseKeybindingOptions } from './keybindings';
import type { Settings } from './contracts';

export const touchpadGestureTypes = [
  ['three.tap', '3本指・タップ'],
  ['three.up', '3本指・上'],
  ['three.down', '3本指・下'],
  ['three.left', '3本指・左'],
  ['three.right', '3本指・右'],
  ['four.tap', '4本指・タップ'],
  ['four.up', '4本指・上'],
  ['four.down', '4本指・下'],
  ['four.left', '4本指・左'],
  ['four.right', '4本指・右'],
] as const;
export type TouchpadGestureId = (typeof touchpadGestureTypes)[number][0];
export const touchpadModifiers = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;
export interface TouchpadConnection {
  key: string;
  modifiers: (typeof touchpadModifiers)[number][];
}
export interface TouchpadGestureSettings {
  /** Effective setting; persisted in this device's settings JSON only. */
  enabled: boolean;
  connections: Record<TouchpadGestureId, TouchpadConnection>;
  executionMode: 'first' | 'all';
  browsers: string[];
  requireChromiumWindowClass: boolean;
  bindings: GestureBinding[];
}
export type TouchpadState =
  | 'unassigned'
  | 'off'
  | 'unconnected'
  | 'checking'
  | 'applying'
  | 'connected'
  | 'conflict'
  | 'unavailable'
  | 'error';
export interface TouchpadGestureStatus {
  gesture: TouchpadGestureId;
  key: string;
  state: TouchpadState;
  message?: string;
  actual?: string;
}
export interface TouchpadSnapshot {
  statuses: TouchpadGestureStatus[];
  busy: boolean;
  operationId?: string;
}
export const touchpadTitle = (gesture: string) =>
  touchpadGestureTypes.find(([id]) => id === gesture)?.[1] ?? gesture;
export function touchpadId(value: unknown): TouchpadGestureId {
  if (!touchpadGestureTypes.some(([id]) => id === value))
    throw Error('タッチパッドのジェスチャーを確認してください。');
  return value as TouchpadGestureId;
}
export const connectionKey = (connection: TouchpadConnection) =>
  [
    ...touchpadModifiers.filter((modifier) => connection.modifiers.includes(modifier)),
    connection.key,
  ].join('+');
export function defaultTouchpadGestures(): TouchpadGestureSettings {
  return {
    enabled: false,
    ...defaultConditionEnvironment(),
    executionMode: 'all',
    bindings: [],
    connections: Object.fromEntries(
      touchpadGestureTypes.map(([id], index) => [
        id,
        { key: `F${13 + index}`, modifiers: [] as TouchpadConnection['modifiers'] },
      ]),
    ) as TouchpadGestureSettings['connections'],
  };
}
export function parseTouchpadGestures(raw: unknown): TouchpadGestureSettings {
  if (raw === undefined) return defaultTouchpadGestures();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('タッチパッドジェスチャー設定を確認してください。');
  const value = raw as TouchpadGestureSettings;
  const defaults = defaultTouchpadGestures();
  if (
    (value.enabled !== undefined && typeof value.enabled !== 'boolean') ||
    Object.keys(value).some((key) => !Object.keys(defaults).includes(key))
  )
    throw Error('タッチパッドの設定項目を確認してください。');
  const source = value.connections ?? defaults.connections;
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    Object.keys(source).some((key) => !touchpadGestureTypes.some(([id]) => id === key))
  )
    throw Error('接続用キーの対応を確認してください。');
  const keys = new Set<string>();
  const connections = Object.fromEntries(
    touchpadGestureTypes.map(([id]) => {
      const entry = source[id] ?? defaults.connections[id];
      if (
        !entry ||
        typeof entry !== 'object' ||
        Object.keys(entry).some((key) => !['key', 'modifiers'].includes(key)) ||
        !/^F(1[3-9]|2[0-4])$/.test(entry.key) ||
        !Array.isArray(entry.modifiers) ||
        entry.modifiers.length > 4 ||
        entry.modifiers.some((modifier) => !touchpadModifiers.includes(modifier)) ||
        new Set(entry.modifiers).size !== entry.modifiers.length
      )
        throw Error('接続用キーはF13～F24と修飾キーから選んでください。');
      const key = normalizeShortcut(connectionKey(entry));
      if (keys.has(key)) throw Error('別のタッチパッドジェスチャーと接続用キーが重複しています。');
      keys.add(key);
      return [
        id,
        {
          key: entry.key,
          modifiers: touchpadModifiers.filter((modifier) => entry.modifiers.includes(modifier)),
        },
      ];
    }),
  ) as TouchpadGestureSettings['connections'];
  const options = parseKeybindingOptions({
    executionMode: value.executionMode ?? 'all',
    browsers: value.browsers ?? defaults.browsers,
    requireChromiumWindowClass:
      value.requireChromiumWindowClass ?? defaults.requireChromiumWindowClass,
  });
  return {
    enabled: value.enabled ?? false,
    ...options,
    connections,
    bindings: parseGestureBindings(value.bindings ?? [], touchpadId),
  };
}
export function reservedTouchpadKeys(settings: Settings): Map<string, TouchpadGestureId> {
  const value = settings.touchpadGestures ?? defaultTouchpadGestures();
  return new Map(
    touchpadGestureTypes
      .filter(([id]) => value.bindings.some((row) => row.gesture === id))
      .map(([id]) => [connectionKey(value.connections[id]), id]),
  );
}
export class TouchpadKeyConflictError extends Error {
  readonly code = 'TOUCHPAD_KEY_CONFLICT';
  constructor(readonly keys: string[]) {
    super(
      `接続用キー「${keys.join('、')}」がショートカットキーの割り当てと重複しています。タッチパッドジェスチャーの「接続用キー設定」で接続用キーを変更してください。`,
    );
    this.name = 'TouchpadKeyConflictError';
  }
}
/** Only newly introduced collisions are rejected; received conflicts remain available for repair. */
export function validateTouchpadKeyEdit(next: Settings, before: Settings) {
  const collisions = (settings: Settings) => {
    const reserved = reservedTouchpadKeys(settings);
    return new Set(
      getKeybindings(settings)
        .filter((row) => reserved.has(row.key))
        .map((row) => `${row.id}\0${row.key}`),
    );
  };
  const old = collisions(before);
  const introduced = [...collisions(next)].filter((value) => !old.has(value));
  if (introduced.length)
    throw new TouchpadKeyConflictError([
      ...new Set(introduced.map((value) => value.split('\0')[1])),
    ]);
}
export function planTouchpadCommands(
  settings: TouchpadGestureSettings,
  gesture: TouchpadGestureId,
  context: TriggerContext,
  commands: readonly CommandCatalogEntry[],
) {
  return planCommandBatch(
    settings.bindings
      .filter((row) => row.gesture === gesture)
      .map((row) => ({ ...row, when: commandCondition(row.when) })),
    context,
    commands,
    settings.executionMode,
    settings,
  );
}
/** Shared row editor helpers accept the same condition model as mouse gestures. */
export const touchpadAsGestureSettings = (value: TouchpadGestureSettings) => ({
  ...defaultGestures(),
  ...value,
});

/** Read-only projection; these rows are never persisted as normal shortcuts. */
export function touchpadShortcutProjection(
  settings: Settings,
): import('./keybindings').Keybinding[] {
  const value = settings.touchpadGestures ?? defaultTouchpadGestures();
  return value.bindings.map((row) => ({
    ...row,
    id: 'touchpad:' + row.id,
    key: connectionKey(value.connections[touchpadId(row.gesture)]),
    blockOriginalInput: true,
  }));
}

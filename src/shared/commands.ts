import type { Command } from './contracts';
import { generatedSettingCommands, hostSettingDefinitions } from './settings-commands';
export const hostCommands = [
  { id: 'appdock.open', title: 'AppDockを開く', extension: 'AppDock', available: true },
  { id: 'appdock.commands.search', title: 'コマンドを検索', extension: 'AppDock', available: true },
  { id: 'appdock.settings.open', title: '設定を開く', extension: 'AppDock', available: true },
  {
    id: 'appdock.image-library.open',
    title: '画像ライブラリーを開く',
    extension: 'AppDock',
    available: true,
  },
  {
    id: 'appdock.ribbon.settings.open',
    title: 'リボン設定を開く',
    extension: 'AppDock',
    available: true,
  },
  { id: 'appdock.applets.open', title: 'Applet一覧を開く', extension: 'AppDock', available: true },
  {
    id: 'appdock.notifications.open',
    title: '通知センターを開く',
    extension: 'AppDock',
    available: true,
  },
  { id: 'appdock.logs.open', title: 'ログを開く', extension: 'AppDock', available: true },
  { id: 'appdock.updates.open', title: '更新画面を開く', extension: 'AppDock', available: true },
  { id: 'appdock.restart', title: '再起動', extension: 'AppDock', available: true },
  {
    id: 'appdock.gestures.togglePause',
    title: 'マウスジェスチャーを一時停止／再開',
    extension: 'AppDock',
    available: true,
  },
  { id: 'appdock.quit', title: '終了', extension: 'AppDock', available: true },
  ...generatedSettingCommands('appdock', hostSettingDefinitions, true).map((c) => ({
    ...c,
    extension: 'AppDock',
  })),
];
export interface UiCommand extends Command {
  extension: string;
  /** Stable owner ID; null is the host, undefined is an unknown saved command. */
  extensionId?: string | null;
  available: boolean;
  disabledReason?: string;
  hidden?: boolean;
}
export const defaultShortcuts: Record<string, string[]> = {
  'appdock.commands.search': ['Ctrl+P', 'Ctrl+Shift+P'],
  'appdock.settings.open': ['Ctrl+,'],
};
export const defaultGlobalShortcutCommands: string[] = [];
export function validCommandId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(id) &&
    !['constructor', 'prototype', '__proto__'].includes(id)
  );
}
const specialKeys: Record<string, string> = {
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  plus: 'Plus',
  pause: 'Pause',
};
export function normalizeShortcut(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80)
    throw new Error('ショートカットの形式が正しくありません。');
  const parts = value.split('+').map((p) => p.trim());
  const rawKey = parts.pop()!;
  const modifiers = new Set<string>();
  for (const part of parts) {
    const modifier = (
      {
        ctrl: 'Ctrl',
        control: 'Ctrl',
        alt: 'Alt',
        shift: 'Shift',
        win: 'Win',
        windows: 'Win',
        meta: 'Win',
      } as Record<string, string>
    )[part.toLowerCase()];
    if (!modifier || modifiers.has(modifier))
      throw new Error(`ショートカット ${value} の修飾キーを確認してください。`);
    modifiers.add(modifier);
  }
  let key: string;
  if (/^[a-z0-9]$/i.test(rawKey) || /^f([1-9]|1[0-9]|2[0-4])$/i.test(rawKey))
    key = rawKey.toUpperCase();
  else if (specialKeys[rawKey.toLowerCase()]) key = specialKeys[rawKey.toLowerCase()];
  else if (/^[,./\\;\[\]'=-]$/.test(rawKey)) key = rawKey;
  else throw new Error(`ショートカット ${value} のキーを確認してください。`);
  return [...['Ctrl', 'Alt', 'Shift', 'Win'].filter((m) => modifiers.has(m)), key].join('+');
}
export interface KeyStroke {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}
export function shortcutFromEvent(event: KeyStroke): string | null {
  if (
    event.isComposing ||
    ['Control', 'Alt', 'Shift', 'Meta', 'Process', 'Dead', 'Unidentified'].includes(event.key)
  )
    return null;
  let key = event.key;
  if (event.code?.startsWith('Digit') && event.shiftKey) key = event.code.slice(5);
  if (key === ' ') key = 'Space';
  if (key === '+') key = 'Plus';
  try {
    return normalizeShortcut(
      [
        ...(event.ctrlKey ? ['Ctrl'] : []),
        ...(event.altKey ? ['Alt'] : []),
        ...(event.shiftKey ? ['Shift'] : []),
        ...(event.metaKey ? ['Win'] : []),
        key,
      ].join('+'),
    );
  } catch {
    return null;
  }
}
export function parseShortcuts(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('shortcuts はコマンドIDとキー配列のオブジェクトです。');
  const result = structuredClone(defaultShortcuts);
  for (const [id, bindings] of Object.entries(value)) {
    if (!validCommandId(id) || !Array.isArray(bindings) || bindings.length > 5)
      throw new Error(`ショートカット ${id} の形式が正しくありません。`);
    result[id] = bindings.map(normalizeShortcut);
  }
  const assigned = new Map<string, string>();
  for (const [id, bindings] of Object.entries(result))
    for (const binding of bindings) {
      if (assigned.has(binding))
        throw new Error(`${binding} が ${assigned.get(binding)} と ${id} に重複しています。`);
      assigned.set(binding, id);
    }
  return result;
}
export function rankCommands<T extends Command>(commands: T[], pins: string[]): T[] {
  const rank = new Map(pins.map((id, index) => [id, index]));
  return [...commands].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
export function movePinnedCommand(
  pins: string[],
  id: string,
  direction: -1 | 1,
  visibleIds = pins,
): string[] {
  const visible = pins.filter((pin) => visibleIds.includes(pin));
  const index = visible.indexOf(id);
  const target = visible[index + direction];
  if (index === -1 || !target) return [...pins];
  const next = [...pins];
  const from = next.indexOf(id);
  const to = next.indexOf(target);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

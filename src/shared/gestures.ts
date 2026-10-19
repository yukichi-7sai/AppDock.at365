import { normalizeShortcut, validCommandId } from './commands';
import { applyBindingOrder } from './binding-order';
import { keybindingConditionLabel } from './keybindings';
import { matchesWhen, type ShortcutContext, type ShortcutScope } from './keybindings';
import type { Settings } from './contracts';

export const gestureTypes = [
  ['move-up', '↑ 上'],
  ['move-down', '↓ 下'],
  ['move-left', '← 左'],
  ['move-right', '→ 右'],
  ['click-left', '左クリック'],
  ['click-middle', '中クリック'],
  ['wheel-up', 'ホイール上'],
  ['wheel-down', 'ホイール下'],
] as const;
export type GestureScope = ShortcutScope | 'browser' | 'exe';
export interface GestureBinding {
  id: string;
  command: string;
  gesture: string;
  enabled: boolean;
  when: { scope: GestureScope; appletIds: string[]; processes: string[] };
}
export interface GestureSettings {
  enabled: boolean;
  browsers: string[];
  excludedProcesses: string[];
  requireChromiumWindowClass: boolean;
  distance: number;
  wheelDelayMs: number;
  executionMode: 'all' | 'first';
  indicatorOpacity: number;
  indicatorPosition: 'gesture-start' | 'window-center' | 'none';
  bindings: GestureBinding[];
}
/** Different gestures never share an execution batch; ordering is local to each group. */
export function groupGestureBindings(rows: GestureBinding[]) {
  const order = [
    ...gestureTypes.map(([id]) => id as string),
    ...new Set(
      rows
        .filter((r) => r.gesture.startsWith('key:'))
        .map((r) => r.gesture)
        .sort(),
    ),
  ];
  return order
    .map((gesture) => ({ gesture, bindings: rows.filter((r) => r.gesture === gesture) }))
    .filter((g) => g.bindings.length);
}
export function gestureTitle(gesture: string) {
  return gestureTypes.find(([id]) => id === gesture)?.[1] ?? `キー: ${gesture.slice(4)}`;
}
export function gestureConditionLabel(
  when: GestureBinding['when'],
  ownerTitle?: string,
  applets: { id: string; title: string }[] = [],
) {
  if (when.scope === 'browser') return 'Webブラウザ';
  if (when.scope === 'exe') return when.processes.join(' / ');
  return keybindingConditionLabel(
    { scope: when.scope, appletIds: when.appletIds },
    ownerTitle,
    applets,
  );
}
export function applyGestureOrder(
  current: GestureBinding[],
  original: GestureBinding[],
  ordered: GestureBinding[],
) {
  return applyBindingOrder(current, original, ordered, (row) => row.gesture, gestureTitle);
}
/** New inputs go at the end of their execution group; condition-only edits retain their slot. */
export function applyGestureBinding(
  rows: GestureBinding[],
  row: GestureBinding,
  original?: GestureBinding,
) {
  if (
    original &&
    JSON.stringify(rows.find((item) => item.id === original.id)) !== JSON.stringify(original)
  )
    throw Error('編集中に割り当てが変更されました。キャンセルして開き直してください。');
  if (!original && rows.length >= 2000) throw Error('ジェスチャー割り当ては2000件以内です。');
  if (original?.gesture === row.gesture)
    return rows.map((item) => (item.id === row.id ? row : item));
  const next = rows.filter((item) => item.id !== row.id);
  const last = next.map((item) => item.gesture).lastIndexOf(row.gesture);
  next.splice(last < 0 ? next.length : last + 1, 0, row);
  return next;
}
export function moveGestureBinding(rows: GestureBinding[], id: string, target: string) {
  const source = rows.find((r) => r.id === id),
    destination = rows.find((r) => r.id === target);
  if (!source || !destination || source.gesture !== destination.gesture || id === target)
    return rows;
  const group = rows.filter((r) => r.gesture === source.gesture);
  const from = group.findIndex((r) => r.id === id),
    to = group.findIndex((r) => r.id === target);
  group.splice(to, 0, ...group.splice(from, 1));
  let index = 0;
  return rows.map((r) => (r.gesture === source.gesture ? group[index++] : r));
}
export function defaultGestures(): GestureSettings {
  return {
    enabled: true,
    browsers: ['chrome', 'msedge', 'brave', 'vivaldi', 'opera', 'chromium', 'thorium'],
    excludedProcesses: [],
    requireChromiumWindowClass: false,
    distance: 50,
    wheelDelayMs: 0,
    executionMode: 'all',
    indicatorOpacity: 0.45,
    indicatorPosition: 'gesture-start',
    bindings: [],
  };
}
export function processNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((v) => typeof v !== 'string' || !/^[\p{L}\p{N}_. -]{1,120}$/u.test(v.trim()))
  )
    throw Error('exe名は100件以内で、パスを含めずに指定してください。');
  return [
    ...new Set(
      value.map((v) =>
        v
          .trim()
          .replace(/\.exe$/i, '')
          .toLowerCase(),
      ),
    ),
  ];
}
export function normalizeGesture(value: unknown): string {
  if (gestureTypes.some(([id]) => id === value)) return value as string;
  if (typeof value === 'string' && value.startsWith('key:')) {
    const key = normalizeShortcut(value.slice(4));
    if (key.split('+').includes('Win'))
      throw Error('ジェスチャーではWin修飾キーを使用できません。');
    return 'key:' + key;
  }
  throw Error('ジェスチャーは移動・左/中クリック・ホイール・キーから選んでください。');
}
export function parseGestures(value: unknown): GestureSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('マウスジェスチャー設定が不正です。');
  const v = value as GestureSettings;
  if (
    typeof v.enabled !== 'boolean' ||
    typeof v.requireChromiumWindowClass !== 'boolean' ||
    !Number.isInteger(v.distance) ||
    v.distance < 5 ||
    v.distance > 500 ||
    !Number.isInteger(v.wheelDelayMs) ||
    v.wheelDelayMs < 0 ||
    v.wheelDelayMs > 5000 ||
    !Number.isFinite(v.indicatorOpacity) ||
    v.indicatorOpacity < 0.1 ||
    v.indicatorOpacity > 1 ||
    (v.executionMode !== undefined && !['all', 'first'].includes(v.executionMode)) ||
    !['gesture-start', 'window-center', 'none'].includes(v.indicatorPosition) ||
    !Array.isArray(v.bindings) ||
    v.bindings.length > 2000
  )
    throw Error('ジェスチャーの距離・間隔・表示・割り当てを確認してください。');
  const ids = new Set<string>();
  const bindings = v.bindings.map((r) => {
    if (
      !r ||
      !validCommandId(r.id) ||
      ids.has(r.id) ||
      !validCommandId(r.command) ||
      typeof r.enabled !== 'boolean' ||
      !r.when ||
      !['global', 'browser', 'exe', 'app', 'pages', 'owner', 'applets'].includes(r.when.scope) ||
      !Array.isArray(r.when.appletIds) ||
      r.when.appletIds.length > 500 ||
      r.when.appletIds.some((id) => !validCommandId(id)) ||
      (r.when.scope === 'applets' ? !r.when.appletIds.length : !!r.when.appletIds.length)
    )
      throw Error('ジェスチャー割り当てのID・コマンド・条件を確認してください。');
    ids.add(r.id);
    const processes = processNames(r.when.processes);
    if (r.when.scope === 'exe' ? !processes.length : !!processes.length)
      throw Error('指定したexe条件にはexe名が必要です。');
    if (Object.keys(r.when).some((k) => !['scope', 'appletIds', 'processes'].includes(k)))
      throw Error('未知のジェスチャー条件です。');
    return {
      id: r.id,
      command: r.command,
      enabled: r.enabled,
      gesture: normalizeGesture(r.gesture),
      when: { scope: r.when.scope, appletIds: [...new Set(r.when.appletIds)], processes },
    };
  });
  return {
    ...v,
    executionMode: v.executionMode ?? 'all',
    browsers: processNames(v.browsers),
    excludedProcesses: processNames(v.excludedProcesses),
    bindings,
  };
}
export interface GestureContext extends ShortcutContext {
  window: string;
}
export function initializeGestureDefaults(
  settings: Settings,
  applets: { id: string; defaultGestureBindings?: GestureBinding[] }[],
): Settings {
  const initialized = new Set(settings.gestureDefaultsInitialized ?? []);
  const gestures = structuredClone(settings.gestures ?? defaultGestures());
  const ids = new Set(gestures.bindings.map((row) => row.id));
  let sequence = 0;
  for (const applet of applets) {
    if (initialized.has(applet.id)) continue;
    if (!settings.extensions[applet.id]) {
      for (const row of applet.defaultGestureBindings ?? []) {
        let id: string;
        do {
          id = `gesture.default.${sequence++}`;
        } while (ids.has(id));
        ids.add(id);
        gestures.bindings.push({ ...structuredClone(row), id });
      }
    }
    initialized.add(applet.id);
  }
  return { ...settings, gestures, gestureDefaultsInitialized: [...initialized] };
}
export function nativeGestureRows(
  settings: GestureSettings,
  context: GestureContext,
  commands: { id: string; title: string; extensionId?: string | null }[],
) {
  const available = new Map(commands.map((c) => [c.id, c]));
  return settings.bindings.flatMap((row) => {
    const command = available.get(row.command);
    if (!row.enabled || !command) return [];
    const external = ['global', 'browser', 'exe'].includes(row.when.scope);
    if (
      !external &&
      !matchesWhen(
        { ...row.when, scope: row.when.scope as ShortcutScope },
        context,
        command.extensionId,
      )
    )
      return [];
    return [{ ...row, title: command.title, window: external ? '' : context.window }];
  });
}

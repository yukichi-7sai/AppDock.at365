import { hostText } from './i18n';
import { normalizeShortcut, validCommandId } from './commands';
import { applyBindingOrder } from './binding-order';
import { keybindingConditionLabel } from './keybindings';
import { matchesWhen, type ShortcutContext, type ShortcutScope } from './keybindings';
import { validShortcutTarget } from './shortcut-pages';
import type { Settings } from './contracts';
import {
  commandCondition,
  defaultConditionEnvironment,
  processNames,
  type CommandTarget,
} from './command-conditions';
export { processNames } from './command-conditions';
import { planCommandBatch } from './command-execution';

export const moveDirections = [
  ['up', hostText('settings.gestures.up')],
  ['down', hostText('settings.gestures.down')],
  ['left', hostText('settings.gestures.left')],
  ['right', hostText('settings.gestures.right')],
] as const;
export const gestureTypes = [
  ...moveDirections.map(
    ([id, label]) =>
      [`move-${id}`, hostText('settings.gestures.movement', { direction: label })] as const,
  ),
  ...moveDirections.flatMap(([first, firstLabel]) =>
    moveDirections
      .filter(([second]) => second !== first)
      .map(
        ([second, secondLabel]) =>
          [
            `move-${first}-${second}`,
            hostText('settings.gestures.movementSequence', {
              first: firstLabel,
              second: secondLabel,
            }),
          ] as const,
      ),
  ),
  ['click-left', hostText('settings.gestures.clickLeft')],
  ['click-middle', hostText('settings.gestures.clickMiddle')],
  ['wheel-up', hostText('settings.gestures.wheelUp')],
  ['wheel-down', hostText('settings.gestures.wheelDown')],
] as const;
export type GestureScope = ShortcutScope | 'browser' | 'exe' | 'desktop';
export interface GestureBinding {
  id: string;
  command: string;
  gesture: string;
  enabled: boolean;
  when: { scope: GestureScope; appletIds: string[]; processes: string[]; excludeDesktop?: boolean };
}
export interface GestureSettings {
  enabled: boolean;
  activateOnStart: boolean;
  browsers: string[];
  excludedProcesses: string[];
  requireChromiumWindowClass: boolean;
  distance: number;
  wheelDelayMs: number;
  executionMode: 'all' | 'first';
  indicatorOpacity: number;
  indicatorStyle: 'compact' | 'pill' | 'ring' | 'classic';
  indicatorPosition: 'gesture-start' | 'window-center' | 'monitor-center' | 'none';
  indicatorShowNoAction: boolean;
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
  return (
    gestureTypes.find(([id]) => id === gesture)?.[1] ??
    hostText('settings.gestures.key', { value: gesture.slice(4) })
  );
}
export function gestureConditionLabel(
  when: GestureBinding['when'],
  ownerTitle?: string,
  applets: { id: string; title: string }[] = [],
) {
  if (when.scope === 'browser') return hostText('settings.gestures.browser');
  if (when.scope === 'desktop') return hostText('settings.gestures.desktop');
  if (when.scope === 'exe')
    return (
      when.processes.join(' / ') +
      (when.excludeDesktop ? hostText('settings.gestures.excludeDesktop') : '')
    );
  if (when.scope === 'global' && when.excludeDesktop)
    return hostText('settings.gestures.globalExcludeDesktop');
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
    throw Error(hostText('settings.gestures.conflict'));
  if (!original && rows.length >= 2000) throw Error(hostText('settings.gestures.limit'));
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
    activateOnStart: false,
    ...defaultConditionEnvironment(),
    excludedProcesses: [],
    distance: 50,
    wheelDelayMs: 0,
    executionMode: 'all',
    indicatorOpacity: 0.45,
    indicatorStyle: 'compact',
    indicatorPosition: 'gesture-start',
    indicatorShowNoAction: true,
    bindings: [],
  };
}
export function normalizeGesture(value: unknown): string {
  if (gestureTypes.some(([id]) => id === value)) return value as string;
  if (typeof value === 'string' && value.startsWith('key:')) {
    const key = normalizeShortcut(value.slice(4));
    if (key.split('+').includes('Win')) throw Error(hostText('settings.gestures.windowsModifier'));
    return 'key:' + key;
  }
  throw Error(hostText('settings.gestures.gesture'));
}
export function parseGestures(value: unknown): GestureSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(hostText('settings.gestures.settings'));
  const v = value as GestureSettings;
  if (
    typeof v.enabled !== 'boolean' ||
    (v.activateOnStart !== undefined && typeof v.activateOnStart !== 'boolean') ||
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
    (v.indicatorStyle !== undefined &&
      !['compact', 'pill', 'ring', 'classic'].includes(v.indicatorStyle)) ||
    (v.executionMode !== undefined && !['all', 'first'].includes(v.executionMode)) ||
    !['gesture-start', 'window-center', 'monitor-center', 'none'].includes(v.indicatorPosition) ||
    (v.indicatorShowNoAction !== undefined && typeof v.indicatorShowNoAction !== 'boolean') ||
    !Array.isArray(v.bindings) ||
    v.bindings.length > 2000
  )
    throw Error(hostText('settings.gestures.options'));
  const bindings = parseGestureBindings(v.bindings);
  return {
    ...v,
    activateOnStart: v.activateOnStart ?? false,
    indicatorShowNoAction: v.indicatorShowNoAction ?? true,
    indicatorStyle: v.indicatorStyle ?? 'compact',
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
  includeInactive = false,
) {
  const available = new Map(commands.map((c) => [c.id, c]));
  return settings.bindings.flatMap((row) => {
    const command = available.get(row.command);
    if (!row.enabled || !command) return [];
    const external = ['global', 'browser', 'exe', 'desktop'].includes(row.when.scope);
    const matches =
      external ||
      matchesWhen(
        { ...row.when, scope: row.when.scope as ShortcutScope },
        context,
        command.extensionId,
      );
    if (!matches && !includeInactive) return [];
    // Keep hooks available for a click that activates AppDock, without authorizing inactive rows.
    return [
      {
        ...row,
        title: command.title,
        ownerId: command.extensionId ?? null,
        window: !matches ? '-1' : external ? '' : context.window,
      },
    ];
  });
}
export function planGestureCommands(
  settings: GestureSettings,
  gesture: string,
  context: GestureContext,
  target: CommandTarget,
  commands: { id: string; extensionId?: string | null }[],
) {
  return planCommandBatch(
    settings.bindings
      .filter((row) => row.gesture === gesture)
      .map((row) => ({ ...row, when: commandCondition(row.when) })),
    {
      host: {
        focused: context.appFocused && context.window === target.window,
        pageId: context.pageId,
        appletId: context.appletId,
      },
      target,
    },
    commands,
    settings.executionMode,
    {
      browsers: settings.browsers,
      requireChromiumWindowClass: settings.requireChromiumWindowClass,
    },
  );
}

export function parseGestureBindings(
  value: unknown,
  normalize: (value: unknown) => string = normalizeGesture,
): GestureBinding[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw Error(hostText('settings.gestures.limit'));
  const rows = value as GestureBinding[];
  const ids = new Set<string>();
  return rows.map((r) => {
    if (
      !r ||
      !validCommandId(r.id) ||
      ids.has(r.id) ||
      !validCommandId(r.command) ||
      typeof r.enabled !== 'boolean' ||
      !r.when ||
      !['global', 'browser', 'exe', 'desktop', 'app', 'pages', 'owner', 'applets'].includes(
        r.when.scope,
      ) ||
      (r.when.excludeDesktop !== undefined && typeof r.when.excludeDesktop !== 'boolean') ||
      (r.when.excludeDesktop === true && !['global', 'exe'].includes(r.when.scope)) ||
      !Array.isArray(r.when.appletIds) ||
      r.when.appletIds.length > 500 ||
      r.when.appletIds.some((id) => !validShortcutTarget(id)) ||
      (r.when.scope === 'applets' ? !r.when.appletIds.length : !!r.when.appletIds.length)
    )
      throw Error(hostText('settings.gestures.binding'));
    ids.add(r.id);
    const processes = processNames(r.when.processes);
    if (r.when.scope === 'exe' ? !processes.length : !!processes.length)
      throw Error(hostText('settings.gestures.processes'));
    if (
      Object.keys(r.when).some(
        (k) => !['scope', 'appletIds', 'processes', 'excludeDesktop'].includes(k),
      )
    )
      throw Error(hostText('settings.gestures.scope'));
    return {
      id: r.id,
      command: r.command,
      enabled: r.enabled,
      gesture: normalize(r.gesture),
      when: {
        scope: r.when.scope,
        appletIds: [...new Set(r.when.appletIds)],
        processes,
        ...(r.when.excludeDesktop === undefined ? {} : { excludeDesktop: r.when.excludeDesktop }),
      },
    };
  });
}

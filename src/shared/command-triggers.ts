import type { Settings } from './contracts';
import { normalizeShortcut } from './commands';
import { hostText } from './i18n';
import {
  appendKeybinding,
  changeKeybindingKey,
  getKeybindings,
  withKeybindings,
  type Keybinding,
} from './keybindings';
import {
  applyGestureBinding,
  defaultGestures,
  groupGestureBindings,
  type GestureBinding,
} from './gestures';
import { defaultTouchpadGestures, touchpadGestureTypes } from './touchpad-gestures';

export const commandTriggerKinds = ['shortcuts', 'gestures', 'touchpad-gestures'] as const;
export type CommandTriggerKind = (typeof commandTriggerKinds)[number];
type TriggerRow = { id: string; command: string; enabled: boolean };
export type CommandTriggerBinding = TriggerRow &
  (
    | { kind: 'shortcuts'; binding: Keybinding }
    | { kind: 'gestures' | 'touchpad-gestures'; binding: GestureBinding }
  );

export function commandTriggerBinding(
  kind: 'shortcuts',
  binding: Keybinding,
): CommandTriggerBinding;
export function commandTriggerBinding(
  kind: 'gestures' | 'touchpad-gestures',
  binding: GestureBinding,
): CommandTriggerBinding;
export function commandTriggerBinding(
  kind: CommandTriggerKind,
  binding: Keybinding | GestureBinding,
): CommandTriggerBinding {
  return {
    kind,
    binding,
    id: JSON.stringify([kind, binding.id]),
    command: binding.command,
    enabled: binding.enabled,
  } as CommandTriggerBinding;
}

/** IDs and input identities are namespaced only in the view; stored rows remain untouched. */
export function commandTriggerInput(row: CommandTriggerBinding): string {
  return JSON.stringify([
    row.kind,
    row.kind === 'shortcuts' ? normalizeShortcut(row.binding.key) : row.binding.gesture,
  ]);
}

export function commandTriggerBindings(settings: Settings): CommandTriggerBinding[] {
  const mouse = settings.gestures ?? defaultGestures();
  const touchpad = settings.touchpadGestures ?? defaultTouchpadGestures();
  return [
    ...getKeybindings(settings).map((row) => commandTriggerBinding('shortcuts', row)),
    ...groupGestureBindings(mouse.bindings)
      .flatMap((group) => group.bindings)
      .map((row) => commandTriggerBinding('gestures', row)),
    ...touchpadGestureTypes
      .flatMap(([gesture]) => touchpad.bindings.filter((row) => row.gesture === gesture))
      .map((row) => commandTriggerBinding('touchpad-gestures', row)),
  ];
}

function assertCurrent(settings: Settings, original: CommandTriggerBinding) {
  const current = commandTriggerBindings(settings).find((row) => row.id === original.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(original))
    throw Error(hostText('settings.commandTriggers.conflict'));
}

/** Route changes back to the existing trigger-specific settings and ordering helpers. */
export function applyCommandTrigger(
  settings: Settings,
  row: CommandTriggerBinding,
  original?: CommandTriggerBinding,
): Settings {
  if (original) {
    assertCurrent(settings, original);
    if (row.id !== original.id || row.command !== original.command)
      throw Error(hostText('settings.commandTriggers.conflict'));
  }
  if (row.kind === 'shortcuts') {
    const bindings = getKeybindings(settings);
    const next = original
      ? changeKeybindingKey(bindings, row.binding.id, row.binding.key).map((item) =>
          item.id === row.binding.id ? row.binding : item,
        )
      : appendKeybinding(bindings, row.binding);
    return withKeybindings(settings, next);
  }
  const key = row.kind === 'gestures' ? 'gestures' : 'touchpadGestures';
  const value =
    settings[key] ?? (row.kind === 'gestures' ? defaultGestures() : defaultTouchpadGestures());
  return {
    ...settings,
    [key]: {
      ...value,
      bindings: applyGestureBinding(
        value.bindings,
        row.binding,
        original && original.kind !== 'shortcuts' ? original.binding : undefined,
      ),
    },
  };
}

export function deleteCommandTrigger(settings: Settings, row: CommandTriggerBinding): Settings {
  assertCurrent(settings, row);
  if (row.kind === 'shortcuts')
    return withKeybindings(
      settings,
      getKeybindings(settings).filter((item) => item.id !== row.binding.id),
    );
  const key = row.kind === 'gestures' ? 'gestures' : 'touchpadGestures';
  const value =
    settings[key] ?? (row.kind === 'gestures' ? defaultGestures() : defaultTouchpadGestures());
  return {
    ...settings,
    [key]: { ...value, bindings: value.bindings.filter((item) => item.id !== row.binding.id) },
  };
}

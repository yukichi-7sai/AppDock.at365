import { localizedMetadata } from './translation-metadata';
import { hostText } from './i18n';
import type { Command } from './contracts';

export const inputPauseKinds = ['mouse', 'keyboard', 'touchpad', 'all'] as const;
export type InputPauseKind = (typeof inputPauseKinds)[number];
export type SwitchAction = 'on' | 'off' | 'toggle';
export const inputPausePrefixes = {
  mouse: 'appdock.gestures',
  keyboard: 'appdock.shortcuts',
  touchpad: 'appdock.touchpadGestures',
  all: 'appdock.input',
} as const;
export function inputPauseCommand(id: string) {
  for (const kind of inputPauseKinds) {
    const prefix = inputPausePrefixes[kind];
    for (const [suffix, action] of [
      ['pause', 'on'],
      ['resume', 'off'],
      ['togglePause', 'toggle'],
    ] as const)
      if (id === `${prefix}.${suffix}`) return { kind, action };
  }
}

const actions = [
  ['ribbon.expand', 'ribbonExpand', 'navigation'],
  ['ribbon.collapse', 'ribbonCollapse', 'navigation'],
  ['ribbon.toggle', 'ribbonToggle', 'navigation'],
  ['theme.light', 'themeLight', 'settings'],
  ['theme.dark', 'themeDark', 'settings'],
  ['theme.system', 'themeSystem', 'settings'],
  ['theme.toggle', 'themeToggle', 'settings'],
  ['zoom.in', 'zoomIn', 'settings'],
  ['zoom.out', 'zoomOut', 'settings'],
  ['zoom.reset', 'zoomReset', 'settings'],
  ['window.hide', 'windowHide', 'navigation'],
  ['window.toggle', 'windowToggle', 'navigation'],
  ['window.minimize', 'windowMinimize', 'navigation'],
  ['window.maximize', 'windowMaximize', 'navigation'],
  ['window.restore', 'windowRestore', 'navigation'],
  ['window.toggleMaximize', 'windowToggleMaximize', 'navigation'],
  ['audio.stopAll', 'audioStopAll', 'system'],
  ['notifications.pause30Minutes', 'notificationsPause', 'navigation'],
  ['notifications.resume', 'notificationsResume', 'navigation'],
  ['notifications.togglePause', 'notificationsToggle', 'navigation'],
] as const;

export const hostActionCommands = localizedMetadata<
  (Command & { extension: string; available: boolean })[]
>(() => [
  ...actions.map(([id, key, category]) => ({
    id: `appdock.${id}`,
    title: hostText(`commands.actions.${key}.title`),
    description: hostText(`commands.actions.${key}.description`),
    category: hostText(`commands.category.${category}`),
    extension: 'AppDock',
    available: true,
  })),
  ...inputPauseKinds.flatMap((kind) =>
    (['pause', 'resume', 'togglePause'] as const).map((action) => ({
      id: `${inputPausePrefixes[kind]}.${action}`,
      title: hostText(`commands.pause.${action}`, { target: hostText(`commands.pause.${kind}`) }),
      description: hostText(`commands.pause.${kind}Description`, {
        operation: hostText(`commands.pause.operation.${action}`),
      }),
      category: hostText('commands.category.input'),
      extension: 'AppDock',
      available: true,
    })),
  ),
]);

import type { Settings } from './contracts';
import type { HostToggleSetting } from './host-toggle-settings';
import { hostText } from './i18n';
import { defaultGestures } from './gestures';
import { defaultKeybindingOptions } from './keybindings';
import { defaultTouchpadGestures } from './touchpad-gestures';
import { defaultCommandTriggerOptions } from './command-trigger-options';

export function applyHostToggle(
  settings: Settings,
  field: HostToggleSetting,
  action: 'on' | 'off' | 'toggle',
): Settings {
  const defaults =
    field.section === 'gestures'
      ? defaultGestures()
      : field.section === 'keybindingOptions'
        ? defaultKeybindingOptions()
        : field.section === 'touchpadGestures'
          ? defaultTouchpadGestures()
          : field.section === 'commandTriggerOptions'
            ? defaultCommandTriggerOptions()
            : {};
  const current = { ...defaults, ...settings[field.section] } as Record<string, unknown>;
  const value = current[field.property] ?? field.default;
  if (typeof value !== 'boolean') throw Error(hostText('services.settingsCommands.notBoolean'));
  return {
    ...settings,
    [field.section]: {
      ...current,
      [field.property]: action === 'toggle' ? !value : action === 'on',
    },
  };
}

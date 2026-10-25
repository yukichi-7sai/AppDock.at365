import type { Settings } from './contracts';
import { defaultConditionEnvironment, processNames } from './command-conditions';
import { hostText } from './i18n';

export interface CommandTriggerOptions {
  browsers: string[];
  requireChromiumWindowClass: boolean;
}
export const defaultCommandTriggerOptions = (): CommandTriggerOptions =>
  defaultConditionEnvironment();

export function parseCommandTriggerOptions(value: unknown): CommandTriggerOptions {
  if (value === undefined) return defaultCommandTriggerOptions();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(hostText('settings.commandTriggerOptions.invalid'));
  const source = value as Record<string, unknown>;
  if (
    source.requireChromiumWindowClass !== undefined &&
    typeof source.requireChromiumWindowClass !== 'boolean'
  )
    throw Error(hostText('settings.keybindings.chromium'));
  return {
    browsers:
      source.browsers === undefined
        ? defaultCommandTriggerOptions().browsers
        : processNames(source.browsers),
    requireChromiumWindowClass: source.requireChromiumWindowClass === true,
  };
}

export function getCommandTriggerOptions(settings: Pick<Settings, 'commandTriggerOptions'>) {
  return { ...defaultCommandTriggerOptions(), ...settings.commandTriggerOptions };
}

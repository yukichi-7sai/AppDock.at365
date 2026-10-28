import type { Settings, SettingDefinition } from './contracts';
import { defaultConditionEnvironment, processNames } from './command-conditions';
import { hostText } from './i18n';
import { validateSettingValue } from './setting-definitions';
import { mcpSettingPublished } from './mcp-setting-fields';

type Definition = Omit<SettingDefinition, 'key' | 'type' | 'default'> & {
  type: 'boolean' | 'number' | 'string' | 'select' | 'string-list';
  default: unknown;
  maxItems?: number;
  hint?: boolean;
  placeholder?: string;
  normalize?(value: unknown): unknown;
};
/** One declaration drives defaults, parsing, native controls, catalog and settings discovery. */
export const commandTriggerOptionDeclarations = {
  browsers: {
    type: 'string-list',
    title: hostText('settings.settings-catalog.browsers'),
    description:
      hostText('settings.inputBrowserOptions.executableHint') +
      hostText('settings.inputBrowserOptions.conditionHint'),
    default: defaultConditionEnvironment().browsers,
    hint: true,
    placeholder: 'chrome.exe, firefox.exe',
    normalize: processNames,
  },
  requireChromiumWindowClass: {
    type: 'boolean',
    title: hostText('settings.settings-catalog.chromium'),
    description: hostText('settings.inputBrowserOptions.chromiumHint'),
    default: false,
  },
} satisfies Record<string, Definition>;
export type CommandTriggerOptions = {
  [
    K in keyof typeof commandTriggerOptionDeclarations
  ]: (typeof commandTriggerOptionDeclarations)[K]['type'] extends 'boolean'
    ? boolean
    : (typeof commandTriggerOptionDeclarations)[K]['type'] extends 'number'
      ? number
      : (typeof commandTriggerOptionDeclarations)[K]['type'] extends 'string-list'
        ? string[]
        : string;
};
export function commandTriggerSettingDefinitions() {
  return Object.entries(commandTriggerOptionDeclarations).map(([key, value]) => {
    if (
      !/^[a-z][A-Za-z0-9]{0,79}$/.test(key) ||
      [
        'constructor',
        'prototype',
        'executionMode',
        'enabled',
        'bindings',
        'connections',
        'distance',
        'wheelDelayMs',
        'activateOnStart',
        'excludedProcesses',
      ].includes(key)
    )
      throw Error(hostText('settings.commandTriggerOptions.invalid'));
    const { normalize: _, ...field }: Definition = value;
    return { ...field, key };
  });
}
export const defaultCommandTriggerOptions = (): CommandTriggerOptions =>
  Object.fromEntries(
    commandTriggerSettingDefinitions().map((field) => [field.key, structuredClone(field.default)]),
  ) as CommandTriggerOptions;

/** Keep legacy responses and command schemas subject to the same common-field privacy. */
export function publicCommandTriggerFields<T extends object>(value: T): T {
  const hidden = new Set(
    commandTriggerSettingDefinitions()
      .filter((field) => !mcpSettingPublished(field))
      .map((field) => field.key),
  );
  return Object.fromEntries(Object.entries(value).filter(([key]) => !hidden.has(key))) as T;
}

export function parseCommandTriggerOptions(value: unknown): CommandTriggerOptions {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value)))
    throw Error(hostText('settings.commandTriggerOptions.invalid'));
  const source = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    commandTriggerSettingDefinitions().map((field) => {
      const definition: Definition =
        commandTriggerOptionDeclarations[field.key as keyof CommandTriggerOptions];
      const raw =
        source[field.key] === undefined ? structuredClone(field.default) : source[field.key];
      const next = definition.normalize ? definition.normalize(raw) : raw;
      if (field.type === 'string-list') {
        if (
          !Array.isArray(next) ||
          next.some((item) => typeof item !== 'string' || !item.trim() || item.length > 32767)
        )
          throw Error(hostText('settings.commandTriggerOptions.invalid'));
      } else validateSettingValue(field, next);
      return [field.key, next];
    }),
  ) as CommandTriggerOptions;
}

export function getCommandTriggerOptions(settings: Pick<Settings, 'commandTriggerOptions'>) {
  return { ...defaultCommandTriggerOptions(), ...settings.commandTriggerOptions };
}

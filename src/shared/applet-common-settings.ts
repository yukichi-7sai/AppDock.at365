import type { SettingDefinition } from './contracts';
import { hostText } from './i18n';
import { validateSettingValue } from './setting-definitions';

export type AppletCommonDefinition = Omit<SettingDefinition, 'key' | 'type'> & {
  type: 'boolean' | 'number' | 'string' | 'select';
  fromManifest?: boolean;
  integer?: boolean;
  applies?: string;
};
/** Host-owned primitive preferences. Lifecycle, credentials and update sources use their owners. */
export const appletCommonSettingDeclarations = {
  startupDelaySeconds: {
    title: hostText('settings.appletSettingsForm.delay'),
    description: hostText('settings.settings-catalog.appletDelay'),
    type: 'number',
    default: 0,
    minimum: 0,
    maximum: 86400,
    step: 1,
    integer: true,
    fromManifest: true,
    applies: 'appletStartupScheduleChanged',
  },
} satisfies Record<string, AppletCommonDefinition>;
export type AppletCommonKey = keyof typeof appletCommonSettingDeclarations;
export type AppletCommonValues = {
  [K in AppletCommonKey]: (typeof appletCommonSettingDeclarations)[K]['type'] extends 'boolean'
    ? boolean
    : (typeof appletCommonSettingDeclarations)[K]['type'] extends 'number'
      ? number
      : string;
};
export function appletCommonKeys(): AppletCommonKey[] {
  return Object.keys(appletCommonSettingDeclarations) as AppletCommonKey[];
}
export function appletCommonDefinitions(applet?: Partial<AppletCommonValues>) {
  return Object.entries(appletCommonSettingDeclarations).map(([key, value]) => {
    if (
      !/^[a-z][A-Za-z0-9]{0,79}$/.test(key) ||
      [
        'enabled',
        'settings',
        'pages',
        'updateSource',
        '__proto__',
        'constructor',
        'prototype',
      ].includes(key)
    )
      throw Error(hostText('services.settingsTargets.invalid'));
    const field: AppletCommonDefinition = value;
    return {
      ...field,
      key,
      default:
        field.fromManifest && applet?.[key as AppletCommonKey] !== undefined
          ? applet[key as AppletCommonKey]
          : field.default,
    };
  });
}
export function validateAppletCommonValues(value: Record<string, unknown>, manifestOnly = false) {
  for (const field of appletCommonDefinitions()) {
    if (
      !Object.hasOwn(value, field.key) ||
      value[field.key] === undefined ||
      (manifestOnly && !field.fromManifest)
    )
      continue;
    validateSettingValue(field, value[field.key]);
    if (
      (field.integer && !Number.isInteger(value[field.key])) ||
      (field.type === 'select' &&
        !field.options?.some((option) => option.value === value[field.key]))
    )
      throw Error(hostText('settings.setting-definitions.value', { title: field.title }));
  }
}

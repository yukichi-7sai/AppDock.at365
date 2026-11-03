import { localizedMetadata } from './translation-metadata';
import { hostText } from './i18n';
import type { SettingDefinition } from './contracts';
import { generatedSettingCommands } from './settings-commands';

const fields = [
  ['host', 'startAtLogon', false, 'startAtLogon'],
  ['host', 'runAsAdministrator', false, 'runAsAdministrator'],
  ['keybindingOptions', 'enabled', true, 'keysEnabled'],
  ['gestures', 'enabled', true, 'mouseEnabled'],
  ['gestures', 'activateOnStart', false, 'activateOnStart'],
  ['gestures', 'indicatorShowNoAction', true, 'indicatorShowNoAction'],
  ['touchpadGestures', 'enabled', false, 'touchpadEnabled'],
  ['commandTriggerOptions', 'requireChromiumWindowClass', false, 'requireChromiumWindowClass'],
  ['updates', 'allowSameVersion', false, 'allowSameVersion'],
  ['updates', 'checkHostOnAboutOpen', false, 'checkHostOnAboutOpen'],
  ['updates', 'checkHostOnStartup', false, 'checkHostOnStartup'],
  ['updates', 'checkAppletsOnStartup', false, 'checkAppletsOnStartup'],
  ['updates', 'notifyOnStartup', true, 'notifyOnStartup'],
] as const;
type Section = (typeof fields)[number][0];
export type HostToggleSetting = SettingDefinition & { section: Section; property: string };
export const hostToggleSettings = localizedMetadata<HostToggleSetting[]>(() =>
  fields.map(([section, property, fallback, label]) => ({
    key: section === 'host' ? property : `${section}.${property}`,
    section,
    property,
    title: hostText(`commands.toggles.${label}.title`),
    description: hostText(`commands.toggles.${label}.description`),
    type: 'boolean',
    default: fallback,
    automation: false,
    generateCommands: ['on', 'off', 'toggle'],
  })),
);
export const hostToggleCommands = localizedMetadata(() =>
  generatedSettingCommands('appdock', hostToggleSettings, true).map((command) => ({
    ...command,
    extension: 'AppDock',
  })),
);
export function hostToggleCommand(id: string) {
  for (const field of hostToggleSettings)
    for (const action of field.generateCommands ?? [])
      if (id === `appdock.settings.${field.key}.${action}`) return { field, action };
}

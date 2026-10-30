import type { Settings } from './contracts';
import { hostSettingDefinitions } from './host-settings';

export const hostPageSettingsIds = [
  'appearance',
  'general',
  'notifications',
  'ribbon',
  'statusbar',
  'tray',
  'about',
] as const;
export type HostPageSettingsId = (typeof hostPageSettingsIds)[number];
export const deviceOnlyHostKeys = [
  'startAtLogon',
  'runAsAdministrator',
  'hardwareAcceleration',
] as const;
export type HostPageConfiguration = Partial<
  Pick<Settings, 'host' | 'notificationPreferences' | 'ribbon' | 'trayMenu' | 'updates'>
>;
export const updateSettingKeys = [
  'hostSource',
  'checkHostOnAboutOpen',
  'checkHostOnStartup',
  'checkAppletsOnStartup',
  'startupDelaySeconds',
  'notifyOnStartup',
  'allowSameVersion',
] as const;
const paths: Record<HostPageSettingsId, string[][]> = {
  appearance: [['host', 'shellProviders']],
  general: [],
  notifications: [['notificationPreferences']],
  ribbon: [
    'order',
    'hidden',
    'bottom',
    'separators',
    'groups',
    'itemOverrides',
    'separatorTitles',
    'buttons',
    'rightClickCommand',
  ].map((key) => ['ribbon', key]),
  statusbar: [],
  tray: [['trayMenu'], ['host', 'trayClickCommand'], ['host', 'trayDoubleClickCommand']],
  about: updateSettingKeys.map((key) => ['updates', key]),
};
export function isHostPageSettingsId(value: string): value is HostPageSettingsId {
  return (hostPageSettingsIds as readonly string[]).includes(value);
}
export function hostPageSettingsPaths(pageId: HostPageSettingsId): string[][] {
  const ordinary = hostSettingDefinitions
    .filter(
      (field) =>
        field.pageId === pageId && !(deviceOnlyHostKeys as readonly string[]).includes(field.key),
    )
    .map((field) => ['host', field.key]);
  const specialized = paths[pageId].map((path) => [...path]);
  return pageId === 'appearance' ? [...ordinary, ...specialized] : [...specialized, ...ordinary];
}
export function hostPageForPath(path: readonly string[]): HostPageSettingsId | undefined {
  return hostPageSettingsIds.find((pageId) =>
    hostPageSettingsPaths(pageId).some((candidate) =>
      candidate.every((key, index) => path[index] === key),
    ),
  );
}
export function defaultHostPageLocal(pageId: HostPageSettingsId) {
  return ['appearance', 'general', 'notifications', 'statusbar'].includes(pageId);
}
export const readHostPagePath = (value: unknown, path: readonly string[]): any =>
  path.reduce((current: any, key) => current?.[key], value);
export function writeHostPagePath(target: object, path: readonly string[], value: unknown) {
  let current = target as Record<string, any>;
  for (const key of path.slice(0, -1)) current = current[key] ??= {};
  const key = path[path.length - 1];
  if (value === undefined) delete current[key];
  else current[key] = structuredClone(value);
}
export function hostPageConfiguration(value: object, pageId: HostPageSettingsId) {
  const result: HostPageConfiguration = {};
  for (const path of hostPageSettingsPaths(pageId)) {
    const field = readHostPagePath(value, path);
    if (field !== undefined) writeHostPagePath(result, path, field);
  }
  return result;
}
export function applyHostPageConfiguration(
  target: object,
  configuration: HostPageConfiguration,
  pageId: HostPageSettingsId,
) {
  for (const path of hostPageSettingsPaths(pageId))
    writeHostPagePath(target, path, readHostPagePath(configuration, path));
}

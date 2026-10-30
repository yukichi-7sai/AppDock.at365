import type { Settings } from './contracts';
import { hostSettingDefinitions } from './host-settings';

export const hostPageSettingsIds = [
  'notifications',
  'ribbon',
  'statusbar',
  'tray',
  'about',
] as const;
export type HostPageSettingsId = (typeof hostPageSettingsIds)[number];
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
  notifications: [
    ['notificationPreferences'],
    ...hostSettingDefinitions
      .filter((field) => field.pageId === 'notifications')
      .map((field) => ['host', field.key]),
  ],
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
  statusbar: hostSettingDefinitions
    .filter((field) => field.pageId === 'statusbar')
    .map((field) => ['host', field.key]),
  tray: [['trayMenu'], ['host', 'trayClickCommand'], ['host', 'trayDoubleClickCommand']],
  about: updateSettingKeys.map((key) => ['updates', key]),
};
export function isHostPageSettingsId(value: string): value is HostPageSettingsId {
  return (hostPageSettingsIds as readonly string[]).includes(value);
}
export function hostPageSettingsPaths(pageId: HostPageSettingsId): string[][] {
  return paths[pageId].map((path) => [...path]);
}
export function hostPageForPath(path: readonly string[]): HostPageSettingsId | undefined {
  return hostPageSettingsIds.find((pageId) =>
    paths[pageId].some((candidate) => candidate.every((key, index) => path[index] === key)),
  );
}
export function defaultHostPageLocal(pageId: HostPageSettingsId) {
  return pageId === 'notifications' || pageId === 'statusbar';
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
  for (const path of paths[pageId]) {
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
  for (const path of paths[pageId])
    writeHostPagePath(target, path, readHostPagePath(configuration, path));
}

import { hostText } from './i18n';
import type { ExtensionSnapshot } from './contracts';

/** The settings index and its commands share these stable page IDs and labels. */
export const hostSettingsPages = [
  ['appearance', hostText('pages.appearance.title')],
  ['general', hostText('pages.general.title')],
  ['applets', hostText('settings.settings-navigation.applets')],
  ['notifications', hostText('settings.settings-navigation.notifications')],
  ['ribbon', hostText('settings.settings-navigation.ribbon')],
  ['tray', hostText('settings.settings-navigation.tray')],
  ['shortcuts', hostText('settings.settings-navigation.shortcuts')],
  ['gestures', hostText('settings.settings-navigation.gestures')],
  ['touchpad-gestures', hostText('settings.settings-navigation.touchpad')],
  ['custom-commands', hostText('settings.settings-navigation.customCommands')],
  ['web-accounts', hostText('settings.settings-navigation.webAccounts')],
  ['permissions', hostText('settings.settings-navigation.permissions')],
  ['tts', 'TTS'],
  ['ai', 'AI'],
  ['codex', hostText('settings.settings-navigation.codex')],
  ['mcp-client', hostText('settings.settings-navigation.mcpClient')],
  ['about', hostText('settings.settings-navigation.about')],
] as const;

export const appletSettingsPageId = (id: string) => `applet:${id}`;
function pageCommand(pageId: string, title: string, id: string) {
  return {
    id,
    title: hostText('settings.settings-navigation.openCommand', { title: title }),
    description: hostText('settings.settings-navigation.openDescription', { title: title }),
    pageId,
    extension: 'AppDock',
    available: true,
  };
}
export const hostSettingsPageCommands = hostSettingsPages.map(([pageId, title]) =>
  pageCommand(
    pageId,
    title,
    pageId === 'ribbon'
      ? 'appdock.ribbon.settings.open'
      : pageId === 'about'
        ? 'appdock.updates.open'
        : `appdock.settings.${pageId}.open`,
  ),
);
/** Opening settings belongs to the host and never starts or enables the Applet. */
export function appletSettingsPageCommands(
  applets: Pick<ExtensionSnapshot, 'id' | 'displayName'>[],
) {
  return applets.map((a) =>
    pageCommand(appletSettingsPageId(a.id), a.displayName, `appdock.settings.applet.${a.id}.open`),
  );
}
export function settingsPageCommands(
  applets: Pick<ExtensionSnapshot, 'id' | 'displayName'>[] = [],
) {
  return [...hostSettingsPageCommands, ...appletSettingsPageCommands(applets)];
}

import { hostText, type HostTextKey } from './i18n';
import type { SettingsPageDefinition } from './settings-catalog';

const descriptions: Record<string, HostTextKey> = {
  'command-triggers': 'settings.commandTriggers.description',
  applets: 'settings.settingsPageLayout.applets',
  'text-palette': 'settings.settingsPageLayout.textPalette',
  notifications: 'settings.settingsPageLayout.notifications',
  tts: 'settings.settingsPageLayout.tts',
  ribbon: 'settings.settingsPageLayout.ribbon',
  tray: 'settings.settingsPageLayout.tray',
  shortcuts: 'settings.settingsPageLayout.shortcuts',
  gestures: 'settings.settingsPageLayout.gestures',
  'touchpad-gestures': 'settings.settingsPageLayout.touchpad',
  'custom-commands': 'settings.settingsPageLayout.customCommands',
  ai: 'settings.settingsPageLayout.ai',
  'image-ai': 'imageAi.description',
  'mcp-client': 'settings.settingsPageLayout.mcpClient',
  'web-accounts': 'settings.settingsPageLayout.webAccounts',
  permissions: 'settings.settingsPageLayout.permissions',
  codex: 'settings.settingsPageLayout.codex',
  about: 'settings.settingsPageLayout.about',
};
export function settingsDescriptionKey(
  page: Pick<SettingsPageDefinition, 'id' | 'kind' | 'collection'>,
): HostTextKey {
  if (page.kind !== 'host')
    return page.collection ? 'settings.collectionDescription' : 'settings.appletDescription';
  if (page.id === 'appearance' || page.id === 'general') return `pages.${page.id}.description`;
  return descriptions[page.id] ?? 'settings.defaultDescription';
}
export function hostDescriptionTexts(page: SettingsPageDefinition): string[] {
  return [
    hostText(settingsDescriptionKey(page)),
    ...(page.id === 'text-palette'
      ? [hostText('inputPalette.description'), hostText('inputPalette.historyDescription')]
      : []),
  ];
}

import type { ExtensionSnapshot } from './contracts';

/** The settings index and its commands share these stable page IDs and labels. */
export const hostSettingsPages = [
  ['appearance', '表示'],
  ['general', '一般'],
  ['applets', 'Applet管理'],
  ['notifications', '通知'],
  ['ribbon', 'リボン'],
  ['tray', 'タスクトレイ'],
  ['shortcuts', 'ショートカットキー'],
  ['gestures', 'マウスジェスチャー'],
  ['custom-commands', 'カスタムコマンド'],
  ['web-accounts', 'Webアカウント'],
  ['permissions', '操作の許可'],
  ['tts', 'TTS'],
  ['ai', 'AI'],
  ['codex', 'MCPサーバー'],
  ['mcp-client', 'MCPクライアント'],
  ['about', 'バージョン情報・更新'],
] as const;

export const appletSettingsPageId = (id: string) => `applet:${id}`;
function pageCommand(pageId: string, title: string, id: string) {
  return {
    id,
    title: `${title}設定を開く`,
    description: `${title}の設定を開きます。`,
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

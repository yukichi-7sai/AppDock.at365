import { defaultHostLanguage, isHostLanguage } from './host-language';
import { hostText } from './i18n';
import { parseMcpRoster } from './mcp-client';
import { defaultZoomFactor, minimumZoomFactor, maximumZoomFactor } from './display-zoom';
import { defaultAccentColor, defaultCustomAccent, isAccentColor, isAccentHex } from './appearance';
import { defaultTtsSettings, parseTtsSettings } from './tts';
import { defaultAiSettings, parseAiSettings } from './ai';
import { parseShellProviders } from './shell';
import { parseNotificationPreferences } from './notification-types';
import {
  parseKeybindings,
  withKeybindings,
  defaultKeybindingOptions,
  parseKeybindingOptions,
} from './keybindings';
import { parseTrayMenu, trayMenuCommandIds, maximumTrayItems } from './tray-menu';
import { parseGestures, defaultGestures } from './gestures';
import { defaultTouchpadGestures, parseTouchpadGestures } from './touchpad-gestures';
import type { Settings } from './contracts';
import { parseImageLibrary } from './registered-images';
import { validateUpdateSource } from './update-sources';
import { validPageId, parseRibbon, defaultRibbon } from './applet-pages';
import { fillSettingDefaults } from './settings-defaults';
import {
  defaultShortcuts,
  defaultGlobalShortcutCommands,
  parseShortcuts,
  validCommandId,
} from './commands';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const createDefaultSettings = (): Settings => ({
  tts: defaultTtsSettings(),
  ai: defaultAiSettings(),
  appletOrder: [],
  touchpadGestures: defaultTouchpadGestures(),
  gestures: defaultGestures(),
  keybindingOptions: defaultKeybindingOptions(),
  gestureDefaultsInitialized: [],
  schemaVersion: 1,
  host: {
    language: defaultHostLanguage,
    shellProviders: {},
    theme: 'light',
    zoomFactor: defaultZoomFactor,
    accentColor: defaultAccentColor,
    customAccentDark: defaultCustomAccent.dark,
    customAccentLight: defaultCustomAccent.light,
    showHints: true,
    soundEnabled: true,
    closeToTray: true,
    startMinimized: false,
    startAtLogon: false,
    runAsAdministrator: false,
    hardwareAcceleration: false,
    trayClickCommand: 'appdock.open',
    trayDoubleClickCommand: null,
  },
  extensions: {},
  updates: {
    hostSource: 'github:yukichi-7sai/AppDock.at365',
    checkHostOnStartup: false,
    checkAppletsOnStartup: false,
    startupDelaySeconds: 10,
    notifyOnStartup: true,
    allowSameVersion: false,
  },
  shortcuts: structuredClone(defaultShortcuts),
  globalShortcutCommands: [...defaultGlobalShortcutCommands],
  trayCommands: [],
  pinnedCommands: [],
  ribbon: defaultRibbon(),
});
export function parseSettings(value: unknown): Settings {
  // Files may omit default-valued fields. Explicit invalid values still reach validation.
  if (object(value) && value.schemaVersion === 1) {
    const raw = value;
    if (
      object(raw.host) &&
      !Object.hasOwn(raw.host, 'shellProviders') &&
      Object.hasOwn(raw.host, 'shellProvider')
    )
      value = { ...raw, host: { ...raw.host, shellProviders: parseShellProviders(raw.host) } };
    value = fillSettingDefaults(value, {
      ...createDefaultSettings(),
      ...(raw.notificationPreferences === undefined
        ? {}
        : { notificationPreferences: { overrides: [] } }),
      ...(raw.mcpServers === undefined ? {} : { mcpServers: { version: 1, items: [] } }),
      ...(raw.imageLibrary === undefined ? {} : { imageLibrary: { groups: [] } }),
    });
  }
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !object(value.host) ||
    !object(value.extensions)
  )
    throw new Error('schemaVersion: 1、host、extensions が必要です。');
  if (
    typeof value.host.theme !== 'string' ||
    !['dark', 'light', 'system'].includes(value.host.theme)
  )
    throw new Error(hostText('validation.theme'));
  if (!isAccentColor(value.host.accentColor)) throw new Error(hostText('validation.accent'));
  if (
    typeof value.host.zoomFactor !== 'number' ||
    !Number.isFinite(value.host.zoomFactor) ||
    value.host.zoomFactor < minimumZoomFactor ||
    value.host.zoomFactor > maximumZoomFactor
  )
    throw new Error(hostText('validation.zoom'));
  for (const key of ['customAccentDark', 'customAccentLight'])
    if (!isAccentHex(value.host[key])) throw new Error(hostText('validation.hostColor', { key }));
  for (const key of ['closeToTray', 'startMinimized'])
    if (typeof value.host[key] !== 'boolean')
      throw new Error(hostText('validation.hostBoolean', { key }));
  const shellProviders = parseShellProviders(value.host);
  const language = value.host.language === undefined ? defaultHostLanguage : value.host.language;
  if (!isHostLanguage(language)) throw new Error(hostText('language.invalid'));
  const showHints = value.host.showHints === undefined ? true : value.host.showHints;
  if (typeof showHints !== 'boolean')
    throw new Error(hostText('validation.hostBoolean', { key: 'showHints' }));
  const soundEnabled = value.host.soundEnabled === undefined ? true : value.host.soundEnabled;
  if (typeof soundEnabled !== 'boolean')
    throw new Error(hostText('validation.hostBoolean', { key: 'soundEnabled' }));
  const {
    shellProvider: legacyShellProvider,
    notifications: legacyNotifications,
    ...host
  } = value.host;
  const hardwareAcceleration =
    value.host.hardwareAcceleration === undefined ? false : value.host.hardwareAcceleration;
  if (typeof hardwareAcceleration !== 'boolean')
    throw new Error(hostText('validation.hostBoolean', { key: 'hardwareAcceleration' }));
  const startAtLogon = value.host.startAtLogon ?? false;
  const runAsAdministrator = value.host.runAsAdministrator ?? false;
  for (const key of ['startAtLogon', 'runAsAdministrator'])
    if (value.host[key] !== undefined && typeof value.host[key] !== 'boolean')
      throw new Error(hostText('validation.hostBoolean', { key }));
  const trayClickCommand =
    value.host.trayClickCommand === undefined ? 'appdock.open' : value.host.trayClickCommand;
  if (!validCommandId(trayClickCommand))
    throw new Error('host.trayClickCommand はコマンドIDです。');
  const trayDoubleClickCommand =
    value.host.trayDoubleClickCommand === undefined ? null : value.host.trayDoubleClickCommand;
  if (trayDoubleClickCommand !== null && !validCommandId(trayDoubleClickCommand))
    throw new Error('host.trayDoubleClickCommand はコマンドIDまたはnullです。');
  const trayMenu = value.trayMenu === undefined ? undefined : parseTrayMenu(value.trayMenu);
  const trayCommands =
    trayMenu !== undefined
      ? trayMenuCommandIds(trayMenu)
      : value.trayCommands === undefined
        ? []
        : value.trayCommands;
  if (
    !Array.isArray(trayCommands) ||
    trayCommands.length > (trayMenu === undefined ? 500 : maximumTrayItems) ||
    trayCommands.some((id) => !validCommandId(id)) ||
    new Set(trayCommands).size !== trayCommands.length
  )
    throw new Error('trayCommands は重複のないコマンドIDの配列です。');
  for (const [id, item] of Object.entries(value.extensions)) {
    if (
      !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) ||
      ['constructor', 'prototype', '__proto__'].includes(id) ||
      !object(item) ||
      typeof item.enabled !== 'boolean' ||
      !object(item.settings)
    )
      throw new Error(`拡張設定 ${id} の形式が正しくありません。`);
    if (
      item.startupDelaySeconds !== undefined &&
      (!Number.isInteger(item.startupDelaySeconds) ||
        Number(item.startupDelaySeconds) < 0 ||
        Number(item.startupDelaySeconds) > 86400)
    )
      throw new Error(`拡張設定 ${id} の開始までの秒数は0～86400の整数です。`);
    if (item.updateSource !== undefined) validateUpdateSource(item.updateSource);
    if (
      item.pages !== undefined &&
      (!object(item.pages) ||
        Object.entries(item.pages).some(
          ([pageId, page]) =>
            !validPageId(pageId) ||
            !object(page) ||
            !['page', 'window'].includes(String(page.display)),
        ))
    )
      throw Error(`拡張設定 ${id} のページ表示方法が不正です。`);
  }
  const appletOrder = value.appletOrder === undefined ? [] : value.appletOrder;
  if (
    !Array.isArray(appletOrder) ||
    appletOrder.length > 500 ||
    appletOrder.some(
      (id) =>
        typeof id !== 'string' ||
        !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) ||
        ['constructor', 'prototype', '__proto__'].includes(id),
    ) ||
    new Set(appletOrder).size !== appletOrder.length
  )
    throw Error('appletOrder は重複のないApplet IDの配列です。');
  const ribbon = parseRibbon(value.ribbon);
  const keybindings =
    value.keybindings === undefined ? undefined : parseKeybindings(value.keybindings);
  const keybindingDefaultsInitialized =
    value.keybindingDefaultsInitialized === undefined ? [] : value.keybindingDefaultsInitialized;
  if (
    !Array.isArray(keybindingDefaultsInitialized) ||
    keybindingDefaultsInitialized.length > 500 ||
    keybindingDefaultsInitialized.some(
      (id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id),
    ) ||
    new Set(keybindingDefaultsInitialized).size !== keybindingDefaultsInitialized.length
  )
    throw Error('既定ショートカット適用済みAppletの一覧が不正です。');
  const shortcuts = keybindings
    ? {}
    : parseShortcuts(value.shortcuts === undefined ? {} : value.shortcuts);
  const globalShortcutCommands = keybindings
    ? []
    : value.globalShortcutCommands === undefined
      ? [...defaultGlobalShortcutCommands]
      : value.globalShortcutCommands;
  if (
    !Array.isArray(globalShortcutCommands) ||
    globalShortcutCommands.length > 500 ||
    globalShortcutCommands.some((id) => !validCommandId(id)) ||
    new Set(globalShortcutCommands).size !== globalShortcutCommands.length
  )
    throw new Error('globalShortcutCommands は重複のないコマンドIDの配列です。');
  const pinnedCommands = value.pinnedCommands === undefined ? [] : value.pinnedCommands;
  if (
    !Array.isArray(pinnedCommands) ||
    pinnedCommands.length > 500 ||
    pinnedCommands.some((id) => !validCommandId(id)) ||
    new Set(pinnedCommands).size !== pinnedCommands.length
  )
    throw new Error('pinnedCommands は重複のないコマンドIDの配列です。');
  const updates = {
    ...createDefaultSettings().updates,
    ...(object(value.updates) ? value.updates : {}),
  };
  if (value.updates !== undefined && !object(value.updates))
    throw Error('updates はオブジェクトです。');
  validateUpdateSource(updates.hostSource);
  for (const key of [
    'checkHostOnStartup',
    'checkAppletsOnStartup',
    'notifyOnStartup',
    'allowSameVersion',
  ] as const)
    if (typeof updates[key] !== 'boolean') throw Error(`updates.${key} は true / false です。`);
  if (
    !Number.isInteger(updates.startupDelaySeconds) ||
    updates.startupDelaySeconds < 0 ||
    updates.startupDelaySeconds > 3600
  )
    throw Error('更新確認の開始までの秒数は0～3600の整数です。');
  const next = {
    ...(value.mcpServers === undefined ? {} : { mcpServers: parseMcpRoster(value.mcpServers) }),
    ...(value.customCommands === undefined
      ? {}
      : { customCommands: parseCustomCommands(value.customCommands) }),
    tts: parseTtsSettings(value.tts),
    ai: parseAiSettings(value.ai),
    touchpadGestures: parseTouchpadGestures(value.touchpadGestures),
    gestures: value.gestures === undefined ? defaultGestures() : parseGestures(value.gestures),
    keybindingOptions: parseKeybindingOptions(value.keybindingOptions),
    gestureDefaultsInitialized: parseGestureInitialized(value.gestureDefaultsInitialized),
    ...(keybindings ? { keybindings } : {}),
    ...(value.keybindingDefaultsInitialized === undefined ? {} : { keybindingDefaultsInitialized }),
    updates,
    schemaVersion: value.schemaVersion,
    extensions: value.extensions,
    host: {
      ...host,
      shellProviders,
      language,
      showHints,
      soundEnabled,
      trayClickCommand,
      trayDoubleClickCommand,
      hardwareAcceleration,
      startAtLogon,
      runAsAdministrator,
    },
    trayCommands,
    ...(trayMenu === undefined ? {} : { trayMenu }),
    shortcuts,
    globalShortcutCommands,
    pinnedCommands,
    appletOrder,
    ...(value.notificationPreferences === undefined
      ? {}
      : { notificationPreferences: parseNotificationPreferences(value.notificationPreferences) }),
    ribbon,
    ...(Object.hasOwn(value, 'profile') ? { profile: structuredClone(value.profile) } : {}),
    ...(value.imageLibrary !== undefined
      ? { imageLibrary: parseImageLibrary(value.imageLibrary) }
      : {}),
  };
  const parsed = structuredClone(next) as unknown as Settings;
  // Saved identity/storage aliases remain readable; no legacy settings are imported.
  if (value.migrations !== undefined) {
    const marker = value.migrations as Settings['migrations'];
    const web = marker?.webApplet;
    if (
      !web ||
      web.version !== 1 ||
      web.owner !== 'at365.web-applet' ||
      !Array.isArray(web.ids) ||
      web.ids.length > 64 ||
      web.ids.some((id) => typeof id !== 'string' || !/^web\.[a-f0-9-]{36}$/.test(id)) ||
      new Set(web.ids).size !== web.ids.length
    )
      throw Error('保存済みページの識別情報が不正です。');
    parsed.migrations = structuredClone(marker);
  }
  const result = keybindings ? withKeybindings(parsed, keybindings) : parsed;
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1024 * 1024)
    throw new Error('設定は1MB以下にしてください。');
  return result;
}
function parseGestureInitialized(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500 || value.some((v) => !validCommandId(v)))
    throw Error('ジェスチャー初期設定の適用済み一覧が不正です。');
  return [...new Set(value)] as string[];
}
import { parseCustomCommands } from './custom-commands';

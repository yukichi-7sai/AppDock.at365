import { hostSettingsDefaults, hostSettingDefinitions } from './host-settings';
import { isStartPage } from './start-page';
import { validateSettingValue } from './setting-definitions';
import { defaultHostLanguage, validHostLanguageCode } from './host-language';
import { hostText } from './i18n';
import { prepareSettingsLookups } from './settings-lookups';
import { parseMcpDeviceSettings } from './mcp-device-settings';
import { minimumZoomFactor, maximumZoomFactor } from './display-zoom';
import { isAccentColor, isAccentHex } from './appearance';
import { defaultTtsConfiguration, parseTtsConfiguration } from './tts';
import { defaultAiSettings, parseAiSettings } from './ai';
import { defaultImageAiSettings, parseImageAiSettings } from './image-ai';
import { parseNotificationPreferences } from './notification-types';
import {
  parseKeybindings,
  withKeybindings,
  defaultKeybindingOptions,
  parseKeybindingOptions,
} from './keybindings';
import { parseTrayMenu, trayMenuCommandIds, defaultTrayMenu } from './tray-menu';
import { parseGestures, defaultGestures } from './gestures';
import { defaultTouchpadGestures, parseTouchpadGestures } from './touchpad-gestures';
import {
  defaultCommandTriggerOptions,
  parseCommandTriggerOptions,
} from './command-trigger-options';
import type { Settings } from './contracts';
import { parseImageLibrary } from './registered-images';
import { parseSoundLibrary } from './sound-library';
import { parseTextLibrary } from './text-library';
import { validateUpdateSource } from './update-sources';
import { validPageId, parseRibbon, defaultRibbon } from './applet-pages';
import { fillSettingDefaults } from './settings-defaults';
import { restoreTriggerStackStorage } from './trigger-stacks';
import { validateAppletCommonValues } from './applet-common-settings';
import {
  defaultShortcuts,
  defaultGlobalShortcutCommands,
  parseShortcuts,
  validCommandId,
} from './commands';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const createDefaultSettings = (): Settings => ({
  tts: defaultTtsConfiguration(),
  ai: defaultAiSettings(),
  imageAi: defaultImageAiSettings(),
  appletOrder: [],
  touchpadGestures: defaultTouchpadGestures(),
  gestures: defaultGestures(),
  keybindingOptions: defaultKeybindingOptions(),
  commandTriggerOptions: defaultCommandTriggerOptions(),
  gestureDefaultsInitialized: [],
  schemaVersion: 1,
  host: hostSettingsDefaults(),
  extensions: {},
  updates: {
    hostSource: 'github:yukichi-7sai/AppDock.at365',
    checkHostOnAboutOpen: false,
    checkHostOnStartup: false,
    checkAppletsOnStartup: false,
    startupDelaySeconds: 10,
    notifyOnStartup: true,
    allowSameVersion: false,
  },
  shortcuts: structuredClone(defaultShortcuts),
  globalShortcutCommands: [...defaultGlobalShortcutCommands],
  trayCommands: ['appdock.open'],
  trayMenu: defaultTrayMenu(),
  pinnedCommands: [],
  ribbon: defaultRibbon(),
});
export function parseSettings(value: unknown): Settings {
  if (object(value)) value = restoreTriggerStackStorage(value);
  // Files may omit default-valued fields. Explicit invalid values still reach validation.
  if (object(value) && value.schemaVersion === 1) {
    const raw = value;
    const defaults = createDefaultSettings();
    if (object(raw.ribbon) && Array.isArray(raw.ribbon.groups)) {
      const children = new Set(
        raw.ribbon.groups.flatMap((group) =>
          object(group) && Array.isArray(group.children) ? group.children : [],
        ),
      );
      // New root defaults must not pull an existing child out of its saved group.
      defaults.ribbon.order = defaults.ribbon.order.filter((id) => !children.has(id));
      defaults.ribbon.bottom = defaults.ribbon.bottom.filter((id) => !children.has(id));
    }
    value = fillSettingDefaults(value, {
      ...defaults,
      // An explicit legacy command list owns its layout until its usual migration.
      ...(raw.trayMenu === undefined && raw.trayCommands !== undefined
        ? { trayMenu: undefined }
        : {}),
      ...(raw.notificationPreferences === undefined
        ? {}
        : { notificationPreferences: { overrides: [] } }),
      ...(raw.imageLibrary === undefined ? {} : { imageLibrary: { groups: [] } }),
      ...(raw.soundLibrary === undefined ? {} : { soundLibrary: { groups: [] } }),
      ...(raw.textLibrary === undefined ? {} : { textLibrary: { groups: [] } }),
      ...(raw.tts === undefined ? {} : { tts: undefined }),
    });
  }
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !object(value.host) ||
    !object(value.extensions)
  )
    throw new Error(hostText('settings.settings-schema.required'));
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
  const language = value.host.language === undefined ? defaultHostLanguage : value.host.language;
  // A shared profile can select a pack installed only on another PC.
  if (!validHostLanguageCode(language)) throw new Error(hostText('language.invalid'));
  const showHints = value.host.showHints === undefined ? true : value.host.showHints;
  if (typeof showHints !== 'boolean')
    throw new Error(hostText('validation.hostBoolean', { key: 'showHints' }));
  const soundEnabled = value.host.soundEnabled === undefined ? true : value.host.soundEnabled;
  if (typeof soundEnabled !== 'boolean')
    throw new Error(hostText('validation.hostBoolean', { key: 'soundEnabled' }));
  const {
    shellProvider: legacyShellProvider,
    shellProviders: legacyShellProviders,
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
    throw new Error(hostText('settings.settings-schema.trayClick'));
  const trayDoubleClickCommand =
    value.host.trayDoubleClickCommand === undefined ? null : value.host.trayDoubleClickCommand;
  if (trayDoubleClickCommand !== null && !validCommandId(trayDoubleClickCommand))
    throw new Error(hostText('settings.settings-schema.trayDoubleClick'));
  for (const field of hostSettingDefinitions)
    // Language and accent IDs are validated above, including unavailable saved selections.
    if (field.key !== 'language' && field.key !== 'accentColor')
      validateSettingValue(field, value.host[field.key]);
  for (const key of ['textPaletteRows', 'clipboardPaletteRows'])
    if (!Number.isSafeInteger(value.host[key])) throw Error(hostText('inputPalette.invalidRows'));
  if (!Number.isSafeInteger(value.host.ribbonHoverCollapseDelayMs))
    throw Error(hostText('settings.ribbonSettings.invalidCollapseDelay'));
  if (!Number.isSafeInteger(value.host.ribbonExpandedWidth))
    throw Error(hostText('settings.ribbonSettings.invalidExpandedWidth'));
  for (const key of ['textPaletteWidth', 'clipboardPaletteWidth'])
    if (!Number.isSafeInteger(value.host[key])) throw Error(hostText('inputPalette.invalidWidth'));
  if (!isStartPage(value.host.startPage)) throw Error(hostText('general.startPage.invalid'));
  const trayMenu = value.trayMenu === undefined ? undefined : parseTrayMenu(value.trayMenu);
  const trayCommands =
    trayMenu !== undefined
      ? trayMenuCommandIds(trayMenu)
      : value.trayCommands === undefined
        ? []
        : value.trayCommands;
  if (
    !Array.isArray(trayCommands) ||
    trayCommands.some((id) => !validCommandId(id)) ||
    new Set(trayCommands).size !== trayCommands.length
  )
    throw new Error(hostText('settings.settings-schema.trayCommands'));
  for (const [id, item] of Object.entries(value.extensions)) {
    if (
      !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) ||
      ['constructor', 'prototype', '__proto__'].includes(id) ||
      !object(item) ||
      typeof item.enabled !== 'boolean' ||
      !object(item.settings)
    )
      throw new Error(hostText('settings.settings-schema.extension', { id: id }));
    validateAppletCommonValues(item);
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
      throw Error(hostText('settings.settings-schema.extensionDisplay', { id: id }));
  }
  const appletOrder = value.appletOrder === undefined ? [] : value.appletOrder;
  if (
    !Array.isArray(appletOrder) ||
    appletOrder.some(
      (id) =>
        typeof id !== 'string' ||
        !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) ||
        ['constructor', 'prototype', '__proto__'].includes(id),
    ) ||
    new Set(appletOrder).size !== appletOrder.length
  )
    throw Error(hostText('settings.settings-schema.appletOrder'));
  const ribbon = parseRibbon(value.ribbon);
  const keybindings =
    value.keybindings === undefined ? undefined : parseKeybindings(value.keybindings);
  const keybindingDefaultsInitialized =
    value.keybindingDefaultsInitialized === undefined ? [] : value.keybindingDefaultsInitialized;
  if (
    !Array.isArray(keybindingDefaultsInitialized) ||
    keybindingDefaultsInitialized.some(
      (id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id),
    ) ||
    new Set(keybindingDefaultsInitialized).size !== keybindingDefaultsInitialized.length
  )
    throw Error(hostText('settings.settings-schema.shortcutsApplied'));
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
    globalShortcutCommands.some((id) => !validCommandId(id)) ||
    new Set(globalShortcutCommands).size !== globalShortcutCommands.length
  )
    throw new Error(hostText('settings.settings-schema.globalShortcuts'));
  const pinnedCommands = value.pinnedCommands === undefined ? [] : value.pinnedCommands;
  if (
    !Array.isArray(pinnedCommands) ||
    pinnedCommands.some((id) => !validCommandId(id)) ||
    new Set(pinnedCommands).size !== pinnedCommands.length
  )
    throw new Error(hostText('settings.settings-schema.pinnedCommands'));
  const updates = {
    ...createDefaultSettings().updates,
    ...(object(value.updates) ? value.updates : {}),
  };
  if (value.updates !== undefined && !object(value.updates))
    throw Error(hostText('settings.settings-schema.updates'));
  validateUpdateSource(updates.hostSource);
  for (const key of [
    'checkHostOnAboutOpen',
    'checkHostOnStartup',
    'checkAppletsOnStartup',
    'notifyOnStartup',
    'allowSameVersion',
  ] as const)
    if (typeof updates[key] !== 'boolean')
      throw Error(hostText('settings.settings-schema.updateBoolean', { key: key }));
  if (
    !Number.isInteger(updates.startupDelaySeconds) ||
    updates.startupDelaySeconds < 0 ||
    updates.startupDelaySeconds > 3600
  )
    throw Error(hostText('settings.settings-schema.updateDelay'));
  const next = {
    ...(value.mcpClient === undefined
      ? {}
      : { mcpClient: parseMcpDeviceSettings(value.mcpClient) }),
    ...(value.customCommands === undefined
      ? {}
      : { customCommands: parseCustomCommands(value.customCommands) }),
    tts: parseTtsConfiguration(value.tts),
    ai: parseAiSettings(value.ai),
    imageAi: parseImageAiSettings(value.imageAi),
    touchpadGestures: parseTouchpadGestures(value.touchpadGestures),
    gestures: value.gestures === undefined ? defaultGestures() : parseGestures(value.gestures),
    keybindingOptions: parseKeybindingOptions(value.keybindingOptions),
    commandTriggerOptions: parseCommandTriggerOptions(value.commandTriggerOptions),
    gestureDefaultsInitialized: parseGestureInitialized(value.gestureDefaultsInitialized),
    ...(keybindings ? { keybindings } : {}),
    ...(value.keybindingDefaultsInitialized === undefined ? {} : { keybindingDefaultsInitialized }),
    updates,
    schemaVersion: value.schemaVersion,
    extensions: value.extensions,
    host: {
      ...host,
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
    ...(value.soundLibrary !== undefined
      ? { soundLibrary: parseSoundLibrary(value.soundLibrary) }
      : {}),
    ...(value.textLibrary !== undefined
      ? { textLibrary: parseTextLibrary(value.textLibrary) }
      : {}),
  };
  const parsed = structuredClone(next) as unknown as Settings;
  const result = keybindings ? withKeybindings(parsed, keybindings) : parsed;
  prepareSettingsLookups(result);
  return result;
}
function parseGestureInitialized(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => !validCommandId(v)))
    throw Error(hostText('settings.settings-schema.gesturesApplied'));
  return [...new Set(value)] as string[];
}
import { parseCustomCommands } from './custom-commands';

import { localizedMetadata } from './translation-metadata';
import type { HostSettings, SettingDefinition } from './contracts';
import { hostText } from './i18n';
import {
  defaultInputPaletteRows,
  defaultInputPaletteWidth,
  minimumInputPaletteWidth,
} from './input-palette';
import { notificationBannerPositions } from './notifications';
import { defaultHostLanguage, hostLanguages, hostLanguageName } from './host-language';
import { defaultZoomFactor, minimumZoomFactor, maximumZoomFactor } from './display-zoom';
import {
  defaultFileWatchAssistanceOptions,
  minimumFileWatchAssistanceIntervalSeconds,
} from './file-watch-assistance';
import {
  accentChoices,
  allAccentPalettes,
  defaultAccentColor,
  defaultCustomAccent,
} from './appearance';

// These fields belong to services with their own validation and application lifecycle.
export const specializedHostDefaults = {
  shellProviders: {},
  startAtLogon: false,
  runAsAdministrator: false,
  trayClickCommand: 'appdock.open',
  trayDoubleClickCommand: null,
} satisfies Partial<HostSettings>;
type OrdinaryHostKey = Exclude<
  keyof HostSettings,
  keyof typeof specializedHostDefaults | 'shellProvider'
>;
export type HostSettingDefinition = SettingDefinition & {
  key: OrdinaryHostKey;
  pageId: 'appearance' | 'general' | 'statusbar' | 'notifications' | 'text-palette' | 'ribbon';
  catalogKey?: string;
  applies?: string;
};
type HostField = Omit<HostSettingDefinition, 'key'>;
const switches = ['on', 'off', 'toggle'] as const;
const definitions = localizedMetadata(() => ({
  ribbonExpandOnHover: {
    pageId: 'ribbon',
    title: hostText('settings.ribbonSettings.expandOnHover'),
    description: hostText('settings.ribbonSettings.expandOnHoverDescription'),
    type: 'boolean',
    default: false,
    automation: true,
    generateCommands: [...switches],
  },
  language: {
    pageId: 'appearance',
    title: hostText('language.label'),
    description: hostText('language.description'),
    type: 'select',
    default: defaultHostLanguage,
    automation: true,
    options: hostLanguages.map((value) => ({ value, label: hostLanguageName(value) })),
  },
  zoomFactor: {
    pageId: 'appearance',
    title: hostText('appearance.zoom.label'),
    description: hostText('appearance.zoom.description'),
    type: 'number',
    default: defaultZoomFactor,
    minimum: minimumZoomFactor,
    maximum: maximumZoomFactor,
    automation: true,
  },
  accentColor: {
    pageId: 'appearance',
    title: hostText('appearance.accent.label'),
    description: hostText('appearance.accent.description'),
    type: 'select',
    default: defaultAccentColor,
    automation: true,
    options: [...allAccentPalettes, accentChoices[accentChoices.length - 1]].map(({ id, title }) => ({
      value: id,
      label: title,
    })),
  },
  customAccentDark: {
    pageId: 'appearance',
    catalogKey: 'accentColor',
    title: hostText('appearance.accent.dark'),
    type: 'string',
    default: defaultCustomAccent.dark,
    automation: true,
  },
  customAccentLight: {
    pageId: 'appearance',
    catalogKey: 'accentColor',
    title: hostText('appearance.accent.light'),
    type: 'string',
    default: defaultCustomAccent.light,
    automation: true,
  },
  theme: {
    pageId: 'appearance',
    title: hostText('appearance.theme.label'),
    description: hostText('appearance.theme.description'),
    type: 'select',
    default: 'light',
    automation: true,
    options: (['dark', 'light', 'system'] as const).map((value) => ({
      value,
      label: hostText(`appearance.theme.${value}`),
    })),
  },
  showHints: {
    pageId: 'appearance',
    title: hostText('appearance.hints.label'),
    description: hostText('appearance.hints.description'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  overlayBackground: {
    pageId: 'appearance',
    title: hostText('appearance.overlayBackground.label'),
    description: hostText('appearance.overlayBackground.description'),
    type: 'select',
    default: 'transparent',
    automation: true,
    options: (['transparent', 'translucent', 'blur'] as const).map((value) => ({
      value,
      label: hostText(`appearance.overlayBackground.${value}`),
    })),
  },
  overlayShadow: {
    pageId: 'appearance',
    title: hostText('appearance.overlayShadow.label'),
    description: hostText('appearance.overlayShadow.description'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  soundEnabled: {
    pageId: 'general',
    title: hostText('general.sound.label'),
    description: hostText('general.sound.description'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  paletteShowGuide: {
    pageId: 'text-palette',
    title: hostText('inputPalette.showGuide'),
    description: hostText('inputPalette.showGuideHint'),
    type: 'boolean',
    default: true,
    automation: false,
    generateCommands: [...switches],
  },
  textPaletteHistory: {
    pageId: 'text-palette',
    title: hostText('inputPalette.history'),
    description: hostText('inputPalette.historyHint'),
    type: 'boolean',
    default: true,
    automation: false,
    generateCommands: [...switches],
  },
  textPaletteRows: {
    pageId: 'text-palette',
    title: hostText('inputPalette.displayRows'),
    description: hostText('inputPalette.displayRowsHint'),
    type: 'number',
    default: defaultInputPaletteRows,
    minimum: 1,
    step: 1,
    automation: false,
  },
  clipboardPaletteRows: {
    pageId: 'text-palette',
    title: hostText('inputPalette.displayRows'),
    description: hostText('inputPalette.displayRowsHint'),
    type: 'number',
    default: defaultInputPaletteRows,
    minimum: 1,
    step: 1,
    automation: false,
  },
  textPaletteWidth: {
    pageId: 'text-palette',
    title: hostText('inputPalette.displayWidth'),
    description: hostText('inputPalette.displayWidthHint'),
    type: 'number',
    default: defaultInputPaletteWidth,
    minimum: minimumInputPaletteWidth,
    step: 1,
    automation: false,
  },
  clipboardPaletteWidth: {
    pageId: 'text-palette',
    title: hostText('inputPalette.displayWidth'),
    description: hostText('inputPalette.displayWidthHint'),
    type: 'number',
    default: defaultInputPaletteWidth,
    minimum: minimumInputPaletteWidth,
    step: 1,
    automation: false,
  },
  notificationBannerPosition: {
    pageId: 'notifications',
    title: hostText('settings.notificationSettings.bannerPosition'),
    description: hostText('settings.notificationSettings.bannerPositionHint'),
    type: 'select',
    default: 'top-center',
    automation: true,
    options: notificationBannerPositions.map((value) => ({
      value,
      label: hostText(`settings.notificationSettings.position.${value}`),
    })),
  },
  notificationBannerShadow: {
    pageId: 'notifications',
    title: hostText('settings.notificationSettings.bannerShadow'),
    description: hostText('settings.notificationSettings.bannerShadowHint'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  notificationDesktopShadow: {
    pageId: 'notifications',
    title: hostText('settings.notificationSettings.desktopShadow'),
    description: hostText('settings.notificationSettings.desktopShadowHint'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  showStatusBar: {
    pageId: 'statusbar',
    title: hostText('statusbar.visible.label'),
    description: hostText('statusbar.visible.description'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
  },
  closeToTray: {
    pageId: 'general',
    title: hostText('general.closeToTray.label'),
    description: hostText('general.closeToTray.description'),
    type: 'boolean',
    default: true,
    automation: true,
    generateCommands: [...switches],
    applies: 'nextClose',
  },
  startMinimized: {
    pageId: 'general',
    title: hostText('general.startMinimized.label'),
    description: hostText('general.startMinimized.description'),
    type: 'boolean',
    default: false,
    automation: true,
    generateCommands: [...switches],
    applies: 'nextStart',
  },
  startPage: {
    pageId: 'general',
    title: hostText('general.startPage.label'),
    description: hostText('general.startPage.description'),
    type: 'select',
    dynamic: true,
    default: 'about',
    automation: true,
    options: [{ value: 'about', label: hostText('settings.aboutSettings.title') }],
    applies: 'nextStart',
  },
  hardwareAcceleration: {
    pageId: 'general',
    title: hostText('general.hardwareAcceleration.label'),
    description: hostText('general.hardwareAcceleration.description'),
    type: 'boolean',
    default: false,
    applies: 'nextStart',
    generateCommands: [...switches],
  },
  fileWatchAssistanceEnabled: {
    pageId: 'general',
    title: hostText('general.fileWatch.enabled'),
    description: hostText('general.fileWatch.description'),
    type: 'boolean',
    default: defaultFileWatchAssistanceOptions.enabled,
    automation: true,
    generateCommands: [...switches],
  },
  fileWatchAssistanceIntervalSeconds: {
    pageId: 'general',
    title: hostText('general.fileWatch.interval'),
    description: hostText('general.fileWatch.intervalDescription'),
    type: 'number',
    default: defaultFileWatchAssistanceOptions.intervalSeconds,
    minimum: minimumFileWatchAssistanceIntervalSeconds,
    automation: true,
  },
} satisfies Record<OrdinaryHostKey, HostField>));

/** Defaults, ordinary validation, UI metadata and MCP publication share this registration. */
export const hostSettingDefinitions = localizedMetadata<HostSettingDefinition[]>(() => Object.entries(definitions).map(
  ([key, definition]) => ({ key: key as OrdinaryHostKey, ...definition }),
));
export function hostSettingsDefaults(): HostSettings {
  return structuredClone({
    ...specializedHostDefaults,
    ...Object.fromEntries(hostSettingDefinitions.map((field) => [field.key, field.default])),
  }) as HostSettings;
}

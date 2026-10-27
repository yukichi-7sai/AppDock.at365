import type { HostSettings, SettingDefinition } from './contracts';
import { hostText } from './i18n';
import { defaultHostLanguage, hostLanguages } from './host-language';
import { defaultZoomFactor, minimumZoomFactor, maximumZoomFactor } from './display-zoom';
import {
  accentChoices,
  legacyAccentPalette,
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
  pageId: 'appearance' | 'general';
  catalogKey?: string;
  applies?: string;
};
type HostField = Omit<HostSettingDefinition, 'key'>;
const switches = ['on', 'off', 'toggle'] as const;
const definitions = {
  language: {
    pageId: 'appearance',
    title: hostText('language.label'),
    description: hostText('language.description'),
    type: 'select',
    default: defaultHostLanguage,
    automation: true,
    options: hostLanguages.map((value) => ({ value, label: hostText(`language.${value}`) })),
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
    options: [...accentChoices, legacyAccentPalette].map(({ id, title }) => ({
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
    options: (['transparent', 'blur'] as const).map((value) => ({
      value,
      label: hostText(`appearance.overlayBackground.${value}`),
    })),
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
  hardwareAcceleration: {
    pageId: 'general',
    title: hostText('general.hardwareAcceleration.label'),
    description: hostText('general.hardwareAcceleration.description'),
    type: 'boolean',
    default: false,
    applies: 'nextStart',
  },
} satisfies Record<OrdinaryHostKey, HostField>;

/** Defaults, ordinary validation, UI metadata and MCP publication share this registration. */
export const hostSettingDefinitions: HostSettingDefinition[] = Object.entries(definitions).map(
  ([key, definition]) => ({ key: key as OrdinaryHostKey, ...definition }),
);
export function hostSettingsDefaults(): HostSettings {
  return structuredClone({
    ...specializedHostDefaults,
    ...Object.fromEntries(hostSettingDefinitions.map((field) => [field.key, field.default])),
  }) as HostSettings;
}

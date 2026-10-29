import { hostText } from './i18n';
import { commandTextPlain, type CommandReference } from './command-text';
import { hostSettingDefinitions } from './host-settings';
import { appletCommonDefinitions, appletCommonKeys } from './applet-common-settings';
import { commandTriggerSettingDefinitions } from './command-trigger-options';
import { getHostTranslator } from './i18n';
import { defaultHostLanguage, type HostLanguage } from './host-language';
import { collectionRecord } from './page-collections';
import { touchpadGestureTypes } from './touchpad-gestures';
import { accentChoices } from './appearance';
import { defaultAppletEnabled } from './applet-state';
import { shellRegions } from './shell';
import { notificationCatalog, notificationSettingKey } from './notification-types';
import type { ExtensionSnapshot, Settings, SettingDefinition } from './contracts';
import { createDefaultSettings, parseSettings } from './settings-schema';
import { validateSettingValue, validateAppletSettings } from './setting-definitions';
import { orderApplets } from './applet-order';
import { getKeybindings } from './keybindings';
import { appletApiPermissionLabels } from './appdock-api';
import { fillSettingDefaults, omitSettingDefaults } from './settings-defaults';
import { hostSettingsPages, appletSettingsPageId } from './settings-navigation';
export { hostSettingsPages, appletSettingsPageId } from './settings-navigation';
import {
  appletConfigurationDefaults,
  compactAppletConfiguration,
  settingsStorageDefaults,
} from './settings-storage';

export type SettingsPath = string[];
export type SettingsResetScope =
  'page' | 'form' | 'triggers' | 'shortcuts' | 'gestures' | 'touchpad-gestures';
export interface SettingsItem {
  id: string;
  pageId: string;
  key: string;
  title: string;
  description: string;
  definition?: SettingDefinition;
  keywords?: string[];
  unavailableReason?: string;
}
export interface SettingsPageDefinition {
  id: string;
  title: string;
  owner?: string;
  kind: 'host' | 'applet';
  collection?: import('./page-collections').CollectionBinding;
  json: boolean;
  items: SettingsItem[];
  unavailableReason?: string;
}
export const settingsItemId = (pageId: string, key: string) =>
  `${encodeURIComponent(pageId)}/${encodeURIComponent(key)}`;
const hostItems: Record<string, [string, string, string?][]> = {
  'command-triggers': [
    [
      'bindings',
      hostText('settings.commandTriggers.title'),
      hostText('settings.commandTriggers.keywords'),
    ],
  ],
  applets: [
    [
      'management',
      hostText('settings.settings-catalog.applets'),
      hostText('settings.settings-catalog.appletsKeywords'),
    ],
  ],
  'mcp-client': [
    [
      'connections',
      hostText('settings.settings-catalog.mcpClient'),
      hostText('settings.settings-catalog.mcpClientKeywords'),
    ],
  ],
  'custom-commands': [
    [
      'definitions',
      hostText('settings.settings-catalog.customCommands'),
      hostText('settings.settings-catalog.customCommandsHint'),
    ],
  ],
  ai: [
    [
      'commonPrompt',
      hostText('settings.settings-catalog.aiPrompt'),
      hostText('settings.settings-catalog.aiPromptHint'),
    ],
    [
      'defaultConnectionId',
      hostText('settings.settings-catalog.aiDefault'),
      hostText('settings.settings-catalog.aiDefaultHint'),
    ],
    [
      'connections',
      hostText('settings.settings-catalog.aiConnections'),
      hostText('settings.settings-catalog.aiKeywords'),
    ],
    [
      'preview',
      hostText('settings.settings-catalog.aiPreview'),
      hostText('settings.settings-catalog.aiPreviewKeywords'),
    ],
  ],

  tts: [
    [
      'baseUrl',
      hostText('settings.settings-catalog.ttsUrl'),
      hostText('settings.settings-catalog.ttsUrlHint'),
    ],
    [
      'apiKey',
      hostText('settings.settings-catalog.ttsKey'),
      hostText('settings.settings-catalog.ttsKeyHint'),
    ],
    [
      'model',
      hostText('settings.settings-catalog.ttsModel'),
      hostText('settings.settings-catalog.ttsModelKeywords'),
    ],
    ['defaultVoice', hostText('settings.settings-catalog.ttsVoice')],
    ['defaultSpeed', hostText('settings.settings-catalog.ttsSpeed')],
    [
      'speedMode',
      hostText('settings.settings-catalog.ttsSpeedMode'),
      hostText('settings.settings-catalog.ttsSpeedModeKeywords'),
    ],
    ['voicesSource', hostText('settings.settings-catalog.ttsVoiceSource')],
    ['voicesPath', hostText('settings.settings-catalog.ttsVoicePath')],
    ['manualVoices', hostText('settings.settings-catalog.ttsManualVoices')],
    [
      'preview',
      hostText('settings.settings-catalog.ttsPreview'),
      hostText('settings.settings-catalog.ttsPreviewHint'),
    ],
  ],
  notifications: [
    [
      'speech.voice',
      hostText('settings.settings-catalog.notificationVoice'),
      hostText('settings.settings-catalog.notificationInherit'),
    ],
    [
      'speech.speed',
      hostText('settings.settings-catalog.notificationSpeed'),
      hostText('settings.settings-catalog.notificationInherit'),
    ],
    [
      'speech.preview',
      hostText('settings.settings-catalog.notificationPreview'),
      hostText('settings.settings-catalog.ttsPreview'),
    ],
  ],
  ribbon: [
    [
      'rightClickCommand',
      hostText('settings.settings-catalog.ribbonRightClick'),
      hostText('settings.settings-catalog.ribbonRightClickKeywords'),
    ],
    [
      'ribbon',
      hostText('settings.settings-catalog.ribbon'),
      hostText('settings.settings-catalog.ribbonKeywords'),
    ],
  ],
  tray: [
    [
      'trayClickCommand',
      hostText('settings.settings-catalog.trayClick'),
      hostText('settings.settings-catalog.trayClickKeywords'),
    ],
    [
      'trayDoubleClickCommand',
      hostText('settings.settings-catalog.trayDoubleClick'),
      hostText('settings.settings-catalog.trayDoubleClickKeywords'),
    ],
    [
      'trayMenu',
      hostText('settings.settings-catalog.trayMenu'),
      hostText('settings.settings-catalog.trayMenuKeywords'),
    ],
  ],
  shortcuts: [
    ['enabled', hostText('settings.settings-catalog.keysEnabled')],
    [
      'executionMode',
      hostText('settings.settings-catalog.executionMode'),
      hostText('settings.settings-catalog.executionModeKeywords'),
    ],
    ['excludedProcesses', hostText('settings.settings-catalog.gesturesExcluded')],
    [
      'commonOptions',
      hostText('settings.commandTriggerOptions.title'),
      hostText('settings.settings-catalog.inputOptionsKeywords'),
    ],
  ],
  'touchpad-gestures': [
    [
      'executionMode',
      hostText('settings.settings-catalog.executionMode'),
      hostText('settings.settings-catalog.executionModeKeywords'),
    ],
    ['excludedProcesses', hostText('settings.settings-catalog.gesturesExcluded')],
    [
      'enabled',
      hostText('settings.settings-catalog.touchpadEnabled'),
      hostText('settings.settings-catalog.touchpadEnabledKeywords'),
    ],
    [
      'commonOptions',
      hostText('settings.commandTriggerOptions.title'),
      hostText('settings.settings-catalog.touchpadOptionsKeywords'),
    ],
    [
      'connections',
      hostText('settings.settings-catalog.touchpadKeys'),
      hostText('settings.settings-catalog.touchpadKeysKeywords'),
    ],
    ...touchpadGestureTypes.map(([id, title]): [string, string, string] => [
      `connection.${id}`,
      hostText('settings.settings-catalog.touchpadKeyLabel', { title: title }),
      hostText('settings.settings-catalog.touchpadKeyKeywords'),
    ]),
  ],
  gestures: [
    ['enabled', hostText('settings.settings-catalog.gesturesEnabled')],
    [
      'activateOnStart',
      hostText('settings.settings-catalog.gesturesInactive'),
      hostText('settings.settings-catalog.gesturesInactiveKeywords'),
    ],
    [
      'commonOptions',
      hostText('settings.commandTriggerOptions.title'),
      hostText('settings.settings-catalog.gesturesOptionsKeywords'),
    ],
    [
      'executionMode',
      hostText('settings.settings-catalog.executionMode'),
      hostText('settings.settings-catalog.executionModeKeywords'),
    ],
    ['excludedProcesses', hostText('settings.settings-catalog.gesturesExcluded')],
    ['distance', hostText('settings.settings-catalog.gesturesDistance')],
    ['wheelDelayMs', hostText('settings.settings-catalog.gesturesWheelDelay')],
    [
      'indicatorPosition',
      hostText('settings.settings-catalog.gesturesPosition'),
      hostText('settings.settings-catalog.gesturesPositionKeywords'),
    ],
    [
      'indicatorStyle',
      hostText('settings.settings-catalog.gesturesStyle'),
      hostText('settings.settings-catalog.gesturesStyleKeywords'),
    ],
    [
      'indicatorOpacity',
      hostText('settings.settings-catalog.gesturesOpacity'),
      hostText('settings.settings-catalog.gesturesIndicatorKeyword'),
    ],
    [
      'indicatorShowNoAction',
      hostText('settings.settings-catalog.gesturesNoAction'),
      hostText('settings.settings-catalog.gesturesNoActionKeywords'),
    ],
  ],
  'web-accounts': [
    [
      'accounts',
      hostText('settings.settings-catalog.webAccounts'),
      hostText('settings.settings-catalog.webAccountsKeywords'),
    ],
  ],
  codex: [
    [
      'connectionScope',
      hostText('settings.settings-catalog.connectionScope'),
      hostText('settings.settings-catalog.connectionScopeKeywords'),
    ],
    [
      'network',
      hostText('settings.settings-catalog.network'),
      hostText('settings.settings-catalog.networkKeywords'),
    ],
    [
      'automation',
      hostText('settings.settings-catalog.automation'),
      hostText('settings.settings-catalog.automationHint'),
    ],
    ['permissions', hostText('settings.settings-catalog.permissions')],
    [
      'registration',
      hostText('settings.settings-catalog.register'),
      hostText('settings.settings-catalog.registerKeywords'),
    ],
    [
      'connection',
      hostText('settings.settings-catalog.registrationDetails'),
      hostText('settings.settings-catalog.registrationKeywords'),
    ],
  ],
  about: [
    [
      'updateActions',
      hostText('settings.settings-catalog.updates'),
      hostText('settings.settings-catalog.updatesKeywords'),
    ],
    [
      'versions',
      hostText('settings.settings-catalog.versions'),
      hostText('settings.settings-catalog.versionsKeywords'),
    ],
    [
      'runtime',
      hostText('settings.settings-catalog.runtime'),
      hostText('settings.settings-catalog.runtimeKeywords'),
    ],
    [
      'updates',
      hostText('settings.settings-catalog.updateSettings'),
      hostText('settings.settings-catalog.updateSettingsHint'),
    ],
    [
      'hostSource',
      hostText('settings.settings-catalog.updateSource'),
      hostText('settings.settings-catalog.updateSourceHint'),
    ],
    [
      'checkHostOnAboutOpen',
      hostText('settings.updateSettings.autoCheckHost'),
      hostText('settings.updateSettings.autoCheckHostHint'),
    ],
    ['checkHostOnStartup', hostText('settings.settings-catalog.checkHost')],
    ['checkAppletsOnStartup', hostText('settings.settings-catalog.checkApplets')],
    ['notifyOnStartup', hostText('settings.settings-catalog.notifyStartup')],
    ['allowSameVersion', hostText('settings.settings-catalog.allowSameVersion')],
    ['startupDelaySeconds', hostText('settings.settings-catalog.updateDelay')],
  ],
  permissions: Object.entries(appletApiPermissionLabels).map(([key, title]) => [
    key,
    title,
    (
      {
        useTts: hostText('settings.settings-catalog.permissionTts'),
        useAi: hostText('settings.settings-catalog.permissionAi'),
        read: hostText('settings.settings-catalog.permissionRead'),
        execute: hostText('settings.settings-catalog.permissionExecute'),
        write: hostText('settings.settings-catalog.permissionWrite'),
        useMcp: hostText('settings.settings-catalog.permissionMcpUse'),
        sendInput: hostText('settings.settings-catalog.permissionInput'),
        runProcesses: hostText('settings.settings-catalog.permissionProcess'),
      } as Record<string, string>
    )[key],
  ]),
};
const localizedHostFields = {
  statusbar: [['showStatusBar', 'statusbar.visible.label', 'statusbar.visible.description']],
  appearance: [
    ['language', 'language.label', 'language.description'],
    ['theme', 'appearance.theme.label', 'appearance.theme.description'],
    ['zoomFactor', 'appearance.zoom.label', 'appearance.zoom.description'],
    ['accentColor', 'appearance.accent.label', 'appearance.accent.description'],
    ['showHints', 'appearance.hints.label', 'appearance.hints.description'],
    [
      'overlayBackground',
      'appearance.overlayBackground.label',
      'appearance.overlayBackground.description',
    ],
  ],
  general: [
    ['soundEnabled', 'general.sound.label', 'general.sound.description'],
    ['startAtLogon', 'general.startAtLogon.label', 'general.startAtLogon.description'],
    [
      'runAsAdministrator',
      'general.runAsAdministrator.label',
      'general.runAsAdministrator.description',
    ],
    ['launch', 'general.launch.label', 'general.launch.keywords'],
    ['closeToTray', 'general.closeToTray.label', 'general.closeToTray.description'],
    [
      'hardwareAcceleration',
      'general.hardwareAcceleration.label',
      'general.hardwareAcceleration.description',
    ],
    ['startMinimized', 'general.startMinimized.label', 'general.startMinimized.description'],
    ['settingsFile', 'general.files.title', 'general.files.keywords'],
  ],
} as const;
function hostRows(
  pageId: string,
  language: HostLanguage = defaultHostLanguage,
): [string, string, string?][] {
  const t = getHostTranslator(language);
  if (pageId !== 'appearance' && pageId !== 'general' && pageId !== 'statusbar')
    return [
      ...(hostItems[pageId] ?? []),
      ...hostSettingDefinitions
        .filter((field) => field.pageId === pageId && !field.catalogKey)
        .map((field): [string, string, string?] => [field.key, field.title, field.description]),
      ...(['shortcuts', 'gestures', 'touchpad-gestures'].includes(pageId)
        ? commandTriggerSettingDefinitions().map((field): [string, string, string?] => [
            field.key,
            field.title,
            field.description,
          ])
        : []),
    ];
  const rows: [string, string, string?][] = [
    ...localizedHostFields[pageId].map(([key, title, description]): [string, string, string] => [
      key,
      t(title),
      t(description),
    ]),
    ...(pageId === 'appearance'
      ? shellRegions.map(({ id }): [string, string] => [
          'shellProviders.' + id,
          t('appearance.shell.label', {
            region: t(`appearance.shell.region.${id}`),
          }),
        ])
      : []),
  ];
  for (const field of hostSettingDefinitions.filter((field) => field.pageId === pageId))
    if (!field.catalogKey && !rows.some((row) => row[0] === field.key))
      rows.push([field.key, field.title, field.description]);
  return rows;
}
export function hostSettingItem(
  pageId: string,
  key: string,
  language: HostLanguage = defaultHostLanguage,
): SettingsItem {
  const row = hostRows(pageId, language).find((row) => row[0] === key);
  if (!row) throw Error('Unknown settings item: ' + pageId + '/' + key);
  return item(
    pageId,
    row[0],
    row[1],
    row[2],
    hostSettingDefinitions.find((field) => field.pageId === pageId && field.key === key),
  );
}
export const appletCommonDescriptions = {
  display: hostText('settings.settings-catalog.appletDisplay'),
  startupDelaySeconds: hostText('settings.settings-catalog.appletDelay'),
};
const generalKeys = () => [
  ...hostSettingDefinitions.filter((field) => field.pageId === 'general').map((field) => field.key),
  'startAtLogon',
  'runAsAdministrator',
];
const updateKeys = [
  'hostSource',
  'checkHostOnAboutOpen',
  'checkHostOnStartup',
  'checkAppletsOnStartup',
  'startupDelaySeconds',
  'notifyOnStartup',
  'allowSameVersion',
];

const item = (
  pageId: string,
  key: string,
  title: string,
  description = '',
  definition?: SettingDefinition,
): SettingsItem => ({
  id: settingsItemId(pageId, key),
  pageId,
  key,
  title,
  description,
  definition,
});
function definitionTerms(definition: SettingDefinition): string[] {
  return [
    ...(definition.aliases ?? []),
    ...(definition.options ?? []).map((o) => o.label),
    ...(definition.fields ?? []).flatMap((f) => [
      f.title,
      f.description ?? '',
      f.key,
      ...definitionTerms(f),
    ]),
  ];
}
export function settingsCatalog(
  applets: ExtensionSnapshot[],
  current: Settings,
  references: readonly CommandReference[] = [],
): SettingsPageDefinition[] {
  const t = getHostTranslator(current.host.language);
  const pages: SettingsPageDefinition[] = [
    ...hostSettingsPages.map(([id, title]) => ({
      id,
      title: id === 'appearance' || id === 'general' ? t(`pages.${id}.title`) : title,
      kind: 'host' as const,
      json: !['applets', 'web-accounts', 'permissions', 'codex'].includes(id),
      items: [
        ...hostRows(id, current.host.language).map(([key, title, description]) => ({
          ...item(
            id,
            key,
            title,
            description,
            hostSettingDefinitions.find((field) => field.pageId === id && field.key === key),
          ),
          keywords:
            id === 'appearance' && key === 'language'
              ? [t('language.ja'), 'ja']
              : id === 'appearance' && key === 'theme'
                ? [
                    t('appearance.theme.dark'),
                    t('appearance.theme.light'),
                    t('appearance.theme.system'),
                  ]
                : id === 'appearance' && key === 'accentColor'
                  ? [
                      ...accentChoices.flatMap((p) => [
                        p.id,
                        t(`appearance.accent.palette.${p.id}`),
                      ]),
                      t('appearance.accent.dark'),
                      t('appearance.accent.light'),
                      'HEX',
                      'customAccentDark',
                      'customAccentLight',
                    ]
                  : undefined,
        })),
        ...(id === 'notifications'
          ? notificationCatalog(orderApplets(applets, current.appletOrder)).map((t) =>
              item(id, notificationSettingKey(t), t.title, t.ownerTitle + ' ' + t.description),
            )
          : []),
      ],
    })),
    ...orderApplets(applets, current.appletOrder).map((a) => {
      const id = appletSettingsPageId(a.id);
      return {
        id,
        title: a.displayName,
        owner: a.id,
        kind: 'applet' as const,
        collection: a.collection,
        json: true,
        items: [
          ...(!a.collection
            ? [
                item(
                  id,
                  'updateSource',
                  hostText('settings.settings-catalog.appletSource'),
                  hostText('settings.settings-catalog.appletSourceKeywords'),
                ),
              ]
            : []),
          ...(!a.collection
            ? [
                item(
                  id,
                  'information',
                  hostText('settings.appletInformation.title'),
                  [a.tagline, a.description].filter(Boolean).join(' '),
                ),
                item(
                  id,
                  'startupTiming',
                  hostText('settings.appletStartup.title'),
                  hostText('settings.appletManagementSettings.startupTimeHint'),
                ),
              ]
            : []),
          ...(!a.collection ? (a.pages ?? []) : []).map((p) =>
            item(
              id,
              `page:${p.id}`,
              hostText('settings.settings-catalog.appletPageDisplay', { title: p.title }),
              appletCommonDescriptions.display,
            ),
          ),
          ...(!a.collection
            ? appletCommonDefinitions(a).map((field) =>
                item(id, field.key, field.title, field.description),
              )
            : []),
          ...(a.settingActions ?? []).map((s) => ({
            ...item(id, `action:${s.command}`, s.title, s.description),
            keywords: (a.settingSections ?? [])
              .filter((section) => section.actions?.includes(s.command))
              .flatMap((section) => [section.title, section.description ?? '']),
            unavailableReason:
              !a.enabled || a.state !== 'running'
                ? hostText('settings.settings-catalog.appletStartRequired')
                : undefined,
          })),
          ...(a.settings ?? []).map((s) => ({
            ...item(id, `setting:${s.key}`, s.title, s.description, s),
            keywords: [
              ...definitionTerms(s),
              ...(a.settingSections ?? [])
                .filter((section) => section.settings?.includes(s.key))
                .flatMap((section) => [section.title, section.description ?? '']),
            ],
          })),
        ],
      };
    }),
  ];
  const byId = new Map(references.map((c) => [c.id, c]));
  return pages.map((page) => ({
    ...page,
    items: page.items.map((field) =>
      !field.description.includes('[command:') &&
      !field.keywords?.some((text) => text.includes('[command:'))
        ? field
        : {
            ...field,
            description: commandTextPlain(field.description, byId),
            keywords: [
              ...(field.keywords ?? []).map((text) => commandTextPlain(text, byId)),
              field.description,
            ],
          },
    ),
  }));
}
export function settingsPaths(
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
): SettingsPath[] {
  if (!page.json) return [];
  if (page.kind === 'applet') {
    const a = applets.find((a) => a.id === page.owner);
    if (!a) throw Error(hostText('settings.settings-catalog.missingTarget'));
    return [
      ['extensions', a.id, 'settings'],
      ...appletCommonKeys().map((key) => ['extensions', a.id, key]),
      ...(!a.collection ? [['extensions', a.id, 'updateSource']] : []),
      ...(!a.collection ? (a.pages ?? []) : []).map((p) => [
        'extensions',
        a.id,
        'pages',
        p.id,
        'display',
      ]),
    ];
  }
  switch (page.id) {
    case 'mcp-client':
      return [['mcpServers']];
    case 'custom-commands':
      return [['customCommands']];
    case 'appearance':
      return [
        ...hostSettingDefinitions
          .filter((field) => field.pageId === 'appearance')
          .map((field) => field.key),
        'shellProviders',
      ].map((key) => ['host', key]);
    case 'tts':
      return [['tts']];
    case 'ai':
      return [['ai']];
    case 'notifications':
      return [['notificationPreferences'], ['host', 'notificationBannerPosition']];
    case 'general':
      return generalKeys().map((k) => ['host', k]);
    case 'statusbar':
      return hostSettingDefinitions
        .filter((field) => field.pageId === page.id)
        .map((field) => ['host', field.key]);
    case 'tray':
      return [['trayMenu'], ['host', 'trayClickCommand'], ['host', 'trayDoubleClickCommand']];
    case 'shortcuts':
      return [
        ['keybindings'],
        ['keybindingOptions', 'enabled'],
        ['keybindingOptions', 'inputExecutionModes'],
        ['keybindingOptions', 'executionMode'],
        ['keybindingOptions', 'excludedProcesses'],
        ['commandTriggerOptions'],
      ];
    case 'command-triggers':
      return [
        ['keybindings'],
        ['gestures', 'bindings'],
        ['touchpadGestures', 'bindings'],
        ['keybindingOptions', 'inputExecutionModes'],
        ['gestures', 'inputExecutionModes'],
        ['touchpadGestures', 'inputExecutionModes'],
      ];
    case 'touchpad-gestures':
      return [
        ['touchpadGestures', 'bindings'],
        ['touchpadGestures', 'inputExecutionModes'],
        ['touchpadGestures', 'enabled'],
        ['touchpadGestures', 'connections'],
        ['touchpadGestures', 'executionMode'],
        ['touchpadGestures', 'excludedProcesses'],
        ['commandTriggerOptions'],
      ];
    case 'gestures':
      return [
        ['gestures', 'bindings'],
        ['gestures', 'inputExecutionModes'],
        ...[
          'enabled',
          'activateOnStart',
          'excludedProcesses',
          'distance',
          'wheelDelayMs',
          'executionMode',
          'indicatorOpacity',
          'indicatorPosition',
          'indicatorStyle',
          'indicatorShowNoAction',
        ].map((key) => ['gestures', key]),
        ['commandTriggerOptions'],
      ];
    case 'ribbon':
      return [
        'order',
        'hidden',
        'bottom',
        'separators',
        'groups',
        'itemOverrides',
        'separatorTitles',
        'buttons',
        'rightClickCommand',
      ].map((k) => ['ribbon', k]);
    case 'about':
      return [...updateKeys.map((k) => ['updates', k])];
    default:
      return [];
  }
}
export const readSettingsPath = (value: unknown, path: SettingsPath): any =>
  path.reduce((v: any, key) => (v != null && Object.hasOwn(v, key) ? v[key] : undefined), value);

/** Resolve a named view on the host; callers cannot supply arbitrary reset paths. */
export function settingsResetPaths(
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
  scope: SettingsResetScope = 'page',
): SettingsPath[] {
  const paths = settingsPaths(page, applets);
  if (scope === 'page') return paths;
  const triggerPath = (path: SettingsPath) =>
    path[0] === 'keybindings' || path[1] === 'bindings' || path[1] === 'inputExecutionModes';
  if (page.id === 'command-triggers') {
    const key =
      scope === 'shortcuts'
        ? 'keybindingOptions'
        : scope === 'gestures'
          ? 'gestures'
          : scope === 'touchpad-gestures'
            ? 'touchpadGestures'
            : undefined;
    if (key)
      return paths.filter(
        (path) => path[0] === key || (scope === 'shortcuts' && path[0] === 'keybindings'),
      );
  } else if (['shortcuts', 'gestures', 'touchpad-gestures'].includes(page.id)) {
    if (scope === 'form' || scope === 'triggers')
      return paths.filter((path) => triggerPath(path) === (scope === 'triggers'));
  }
  throw Error(hostText('settings.inputError.resetScope'));
}

export function resetSettingsPage(
  current: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
  scope: SettingsResetScope = 'page',
): Settings {
  const paths = settingsResetPaths(page, applets, scope);
  if (scope === 'page') return applySettingsJson(current, page, applets, '{}');
  const defaults = settingsPageDefaults(page, applets);
  const next = structuredClone(current);
  for (const path of paths) writePath(next, path, readSettingsPath(defaults, path));
  return next;
}
function writePath(value: any, path: SettingsPath, next: unknown) {
  let parent = value;
  const ancestors: { parent: any; key: string }[] = [];
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(parent, key)) {
      if (next === undefined) return;
      parent[key] = {};
    }
    ancestors.push({ parent, key });
    parent = parent[key];
  }
  const key = path.at(-1)!;
  if (next === undefined) {
    delete parent[key];
    // Removing a display override must not leave an invalid pages[id]: {} behind.
    for (const ancestor of ancestors.reverse()) {
      const child = ancestor.parent[ancestor.key];
      if (!child || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).length)
        break;
      delete ancestor.parent[ancestor.key];
    }
  } else parent[key] = structuredClone(next);
}
export function settingsProjection(
  value: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
): Record<string, unknown> {
  if (!page.json) throw Error(hostText('settings.settings-catalog.jsonUnsupported'));
  if (page.collection) {
    const applet = applets.find((a) => a.id === page.owner);
    const fields = applet?.settings ?? [];
    const source = value.extensions[page.collection.owner]?.settings[page.collection.key];
    const row = Array.isArray(source)
      ? collectionRecord(value, page.collection)
      : (value.extensions[page.owner!]?.settings ?? {});
    return {
      extensions: {
        [page.owner!]: {
          settings: Object.fromEntries(
            fields.map((field) => [field.key, row[field.key] ?? field.default]),
          ),
        },
      },
    };
  }
  const result = {};
  if (page.kind === 'applet') writePath(result, ['extensions', page.owner!, 'settings'], {});
  for (const path of settingsPaths(page, applets)) {
    const part = path[0] === 'keybindings' ? getKeybindings(value) : readSettingsPath(value, path);
    if (part !== undefined) writePath(result, path, part);
  }
  return result;
}
export function settingsPageDefaults(page: SettingsPageDefinition, applets: ExtensionSnapshot[]) {
  const defaults = settingsStorageDefaults();
  for (const applet of applets) {
    defaults.extensions[applet.id] = {
      enabled: defaultAppletEnabled,
      ...appletConfigurationDefaults(applet),
      ...(applet.updateRepository ? { updateSource: `github:${applet.updateRepository}` } : {}),
    };
  }
  if (page.collection) {
    const applet = applets.find((a) => a.id === page.owner);
    return {
      extensions: {
        [page.owner!]: {
          settings: Object.fromEntries(
            (applet?.settings ?? [])
              .filter((field) => field.default !== undefined)
              .map((field) => [field.key, field.default]),
          ),
        },
      },
    };
  }
  return settingsProjection(defaults, page, applets);
}
export function settingsJsonProjection(
  value: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
) {
  return (
    omitSettingDefaults(
      settingsProjection(value, page, applets),
      settingsPageDefaults(page, applets),
    ) ?? {}
  );
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function assertScope(value: unknown, paths: SettingsPath[], prefix: string[] = []) {
  if (paths.some((p) => p.length === prefix.length)) return;
  if (!object(value)) throw Error(hostText('settings.settings-catalog.parentObject'));
  for (const [key, child] of Object.entries(value)) {
    const matching = paths.filter((p) => p[prefix.length] === key);
    if (!matching.length || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error(hostText('settings.settings-catalog.forbiddenKey', { key: key }));
    assertScope(child, matching, [...prefix, key]);
  }
}
/** Validate an isolated page, then merge only its allowed leaves into persisted settings. */
export function applySettingsJson(
  current: Settings,
  page: SettingsPageDefinition,
  applets: ExtensionSnapshot[],
  text: string,
): Settings {
  const value = JSON.parse(text);
  if (!object(value) || !page.json) throw Error(hostText('settings.settings-catalog.jsonObject'));
  const next = structuredClone(current);
  if (page.collection) {
    const applet = applets.find((a) => a.id === page.owner);
    const fields = applet?.settings ?? [];
    assertScope(
      value,
      fields.map((field) => ['extensions', page.owner!, 'settings', field.key]),
    );
    const input = value.extensions?.[page.owner!]?.settings;
    if (input !== undefined && !object(input))
      throw Error(hostText('settings.settings-catalog.pageRequired'));
    const row = collectionRecord(next, page.collection);
    for (const field of fields) {
      const part = input?.[field.key] === undefined ? field.default : input[field.key];
      if (part !== undefined) validateSettingValue(field, part);
      if (part === undefined) delete row[field.key];
      else row[field.key] = structuredClone(part);
    }
    return next;
  }
  const paths = settingsPaths(page, applets);
  assertScope(value, paths);
  const check = createDefaultSettings();
  const defaults = settingsPageDefaults(page, applets);
  for (const p of paths)
    if (p[0] === 'extensions')
      check.extensions[p[1]] ??= { enabled: defaultAppletEnabled, settings: {} };
  for (const p of paths)
    writePath(
      check,
      p,
      fillSettingDefaults(readSettingsPath(value, p), readSettingsPath(defaults, p)),
    );
  const normalized = parseSettings(check);
  validateAppletSettings(
    normalized,
    page.kind === 'applet' ? applets.filter((a) => a.id === page.owner) : [],
  );
  for (const p of paths) {
    if (p[0] === 'extensions')
      next.extensions[p[1]] ??= { enabled: defaultAppletEnabled, settings: {} };
    writePath(next, p, readSettingsPath(normalized, p));
  }
  if (page.id === 'tray') next.trayCommands = normalized.trayCommands;
  if (page.kind === 'applet') {
    const compact = compactAppletConfiguration(
      next.extensions[page.owner!],
      applets.find((a) => a.id === page.owner),
    );
    for (const key of ['settings', ...appletCommonKeys(), 'pages'] as const) {
      delete next.extensions[page.owner!][key];
      if (compact[key] !== undefined) (next.extensions[page.owner!] as any)[key] = compact[key];
    }
  }
  return next;
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
export function searchSettings(pages: SettingsPageDefinition[], query: string): SettingsItem[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages
    .flatMap((page) => page.items.map((field) => ({ field, page })))
    .map(({ field, page }, order) => ({
      field,
      order,
      name: normalize(field.title),
      text: normalize(
        [
          field.title,
          field.description,
          field.key,
          page.title,
          page.owner,
          ...(field.keywords ?? []),
          ...(field.definition?.options?.map((o) => o.label) ?? []),
        ].join(' '),
      ),
    }))
    .filter((row) => words.every((w) => row.text.includes(w)))
    .map((row) => ({
      ...row,
      rank:
        row.name === normalize(query).trim() ? 0 : words.every((w) => row.name.includes(w)) ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((row) => row.field);
}

import type { Settings, SettingDefinition, ExtensionSnapshot } from '../../shared/contracts';
import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import {
  parseAiSettings,
  newAiConnection,
  aiOutputTokenLimits,
  aiTimeoutLimits,
  type AiConnectionSettings,
} from '../../shared/ai';
import { defaultTtsSettings, parseTtsSettings } from '../../shared/tts';
import { replaceNotificationPreference } from '../../shared/notification-preference-edit';
import {
  notificationTypeKey,
  notificationSettingKey,
  resolveNotificationPolicy,
  resolveNotificationSpeech,
  type NotificationTypeEntry,
  type NotificationPreference,
} from '../../shared/notification-types';
import { sameSetting } from '../../shared/settings-defaults';
import { settingInputSchema } from '../../shared/settings-commands';
import { hostSettingItem, appletCommonDescriptions } from '../../shared/settings-catalog';
import { createDefaultSettings } from '../../shared/settings-schema';
import {
  validateMcpSetting,
  mcpSettingPublished,
  mcpSettingSupported,
} from '../../shared/mcp-setting-fields';
import { appletCommonDefinitions } from '../../shared/applet-common-settings';
import { appletEnabled, defaultAppletEnabled } from '../../shared/applet-state';
import { managedApplets, reorderManagedApplets } from '../../shared/applet-management';
import { AppletManagement, AppletManagementError } from './applet-management';
import {
  commandTriggerSettingDefinitions,
  getCommandTriggerOptions,
  parseCommandTriggerOptions,
} from '../../shared/command-trigger-options';
import { defaultShellId, shellRegions, shellProviderCandidates } from '../../shared/shell';
import type { SettingsStore } from './settings';
import {
  SettingsTargetError,
  type SettingsFieldTarget,
  type SettingsListTarget,
  type SettingsTarget,
} from './settings-target-types';
import type { AiSettingsController } from './ai-settings';
import type { TtsSecrets } from './tts-secrets';
import type { McpClientSettings } from './mcp-client-settings';
import { mcpClientSettingsTarget } from './settings-mcp-client-target';
import type { WindowsLaunch } from './windows-launch';
import { launchSettingsTarget } from './settings-launch-target';
import {
  settingsUiFields,
  settingsUiGroup,
  type SettingsUiBinding,
} from '../../shared/settings-mcp-access';

type RecordValue = Record<string, unknown>;
interface Field extends SettingDefinition {
  schema?: RecordValue;
  writable?: boolean;
  resettable?: boolean;
  inherit?: boolean;
}
interface Target {
  ui?: SettingsUiBinding;
  id: string;
  title: string;
  category: string;
  ownerId?: string;
  fields: Field[];
  values(settings: Settings): RecordValue;
  overrides(raw: RecordValue): RecordValue;
  stored?(): RecordValue;
  rewriteScope?: 'shared' | 'device' | (() => 'shared' | 'device');
  replace(settings: Settings, changes: RecordValue, reset: string[]): Settings;
  guard?(next: Settings): void;
  normalize?(changes: RecordValue): RecordValue;
  context?: unknown;
  guardRevision?(): string;
  applies?(key: string): string;
}
const fail = (code = 'INVALID_ARGUMENT'): never => {
  throw new SettingsTargetError(
    code,
    hostText(
      code === 'LOCAL_ACTION_REQUIRED'
        ? 'services.settingsTargets.localAction'
        : 'services.settingsTargets.invalid',
    ),
  );
};
const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
const at = (value: unknown, path: string[]) =>
  path.reduce<unknown>((node, key) => object(node)[key], value);
function assign(value: RecordValue, path: string[], next: unknown) {
  let node = value;
  for (const key of path.slice(0, -1)) {
    node[key] = { ...object(node[key]) };
    node = object(node[key]);
  }
  const key = path[path.length - 1];
  if (next === undefined) delete node[key];
  else node[key] = structuredClone(next);
}
const options = (values: string[]) => values.map((value) => ({ value, label: value }));
const project = (value: unknown, fields: Field[], prefix: string[] = []) =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const saved = at(value, [...prefix, ...field.key.split('.')]);
      return saved === undefined ? [] : [[field.key, saved]];
    }),
  );
function updateRecord(value: RecordValue, changes: RecordValue, reset: string[], fields: Field[]) {
  for (const [key, next] of Object.entries(changes))
    assign(value, fields.find((field) => field.key === key)!.key.split('.'), next);
  for (const key of reset)
    assign(value, fields.find((field) => field.key === key)!.key.split('.'), undefined);
}

/** Host-owned projections use existing parsers, preference editing, storage and service guards. */
export class SettingsServiceTargets {
  constructor(
    private options: {
      settings: SettingsStore;
      revision(): string;
      checkRevision(revision: string): void;
      validate(value: Settings): Settings;
      save(value: Settings, revision: number, rewrite: ('shared' | 'device')[]): unknown;
      ai: AiSettingsController;
      tts: TtsSecrets;
      notifications(): NotificationTypeEntry[];
      applets?(): ExtensionSnapshot[];
      appletManagement?: AppletManagement;
      mcpSettings?(): McpClientSettings;
      launch?: WindowsLaunch;
      assertWritable?(): void;
    },
  ) {}
  targets(): SettingsTarget[] {
    return [
      ...[
        this.shell(),
        this.updates(),
        this.commandTriggerOptions(),
        ...(this.options.applets?.() ?? [])
          .filter((applet) => !applet.collection && applet.sourceKind !== 'builtin')
          .map((applet) => this.appletUpdateSource(applet)),
        ...(this.options.applets?.() ?? [])
          .filter((applet) => !applet.collection && applet.sourceKind !== 'builtin')
          .map((applet) => this.appletCommon(applet)),
        this.aiGeneral(),
        ...parseAiSettings(this.options.settings.value.ai).connections.map((connection) =>
          this.aiConnection(connection.id),
        ),
        this.tts(),
        this.speech(),
        ...this.options.notifications().map((type) => this.notification(type)),
      ].map((target) => this.target(target)),
      this.aiConnections(),
      this.ttsVoices(),
      this.appletOrder(),
      ...(this.options.mcpSettings
        ? [mcpClientSettingsTarget(this.options.mcpSettings(), this.options.checkRevision)]
        : []),
      ...(this.options.launch
        ? [launchSettingsTarget({ ...this.options, launch: this.options.launch })]
        : []),
    ];
  }
  private shell(): Target {
    const providers = this.options.applets?.() ?? [];
    const fields: Field[] = shellRegions.map(({ id, title }) => ({
      key: id,
      title: hostText('appearance.shell.label', { region: title }),
      type: 'select',
      default: defaultShellId,
      options: [
        { value: defaultShellId, label: hostText('appearance.shell.defaultOption') },
        ...shellProviderCandidates(providers, id).map((provider) => ({
          value: provider.id,
          label:
            provider.displayName +
            (provider.enabled ? '' : hostText('appearance.shell.disabledSuffix')),
        })),
      ],
    }));
    const projectProviders = (value: unknown) =>
      Object.fromEntries(
        fields.flatMap(({ key }) =>
          Object.hasOwn(object(value), key) ? [[key, object(value)[key]]] : [],
        ),
      );
    return {
      id: 'service.shell',
      ui: settingsUiFields('appearance', (field) => 'shellProviders.' + field.key),
      title: hostText('appearance.shell.section'),
      category: 'shell',
      fields,
      stored: () => this.options.settings.storedSettingOverrides('appdock'),
      rewriteScope: () => this.options.settings.settingScope(['host', 'shellProviders']),
      context: fields.map(({ key, options }) => ({ key, options })),
      applies: () => 'shellProvidersChanged',
      values: (settings) =>
        Object.fromEntries(
          fields.map(({ key }) => [key, settings.host.shellProviders?.[key] ?? defaultShellId]),
        ),
      overrides: (raw) => projectProviders(raw.shellProviders),
      replace: (settings, changes, reset) => {
        const assignments = { ...settings.host.shellProviders, ...changes } as Record<
          string,
          string
        >;
        for (const key of reset) delete assignments[key];
        settings.host.shellProviders = assignments;
        return settings;
      },
    };
  }
  private target(spec: Target): SettingsFieldTarget {
    const applies = (key: string) =>
      spec.applies?.(key) ??
      (spec.category === 'ai'
        ? 'aiSettingsChanged'
        : spec.category === 'tts'
          ? 'ttsSettingsChanged'
          : 'notificationPreferencesChanged');
    const readOverrides = (): RecordValue | undefined => {
      try {
        const raw = spec.overrides(
          spec.stored ? spec.stored() : this.options.settings.storedValue(),
        );
        return { ...raw, ...(spec.guardRevision ? { $guard: spec.guardRevision() } : {}) };
      } catch {
        return undefined;
      }
    };
    return {
      targetId: spec.id,
      ui: spec.ui,
      ownerId: spec.ownerId ?? 'appdock',
      title: spec.title,
      category: spec.category,
      available: true,
      fields: spec.fields,
      values: () => spec.values(this.options.settings.value),
      overrides: readOverrides,
      inputSchema: (field) => (field as Field).schema ?? settingInputSchema(field),
      writable: (field) => (field as Field).writable !== false,
      resettable: (field) => (field as Field).resettable !== false,
      inheritable: (field) => (field as Field).inherit !== false,
      schemaContext: () => spec.context,
      applies,
      plan: (changes, reset, revision) => {
        this.options.checkRevision(revision);
        const store = this.options.settings,
          before = spec.values(store.value),
          original = readOverrides();
        let actual: RecordValue;
        try {
          actual = spec.normalize?.(changes) ?? { ...changes };
        } catch {
          return fail();
        }
        const resets = new Set(reset);
        for (const field of spec.fields) {
          if (Object.hasOwn(actual, field.key)) {
            if (
              field.type === 'select' &&
              !field.options?.some((option) => option.value === actual[field.key])
            )
              fail();
            if (field.writable === false && !sameSetting(before[field.key], actual[field.key]))
              fail('LOCAL_ACTION_REQUIRED');
            if (
              field.inherit !== false &&
              field.default !== undefined &&
              sameSetting(actual[field.key], field.default)
            ) {
              delete actual[field.key];
              resets.add(field.key);
            }
          }
          if (resets.has(field.key) && field.resettable === false) fail();
        }
        let next: Settings;
        try {
          next = this.options.validate(
            spec.replace(structuredClone(store.value), actual, [...resets]),
          );
          spec.guard?.(next);
        } catch (error) {
          if (error instanceof SettingsTargetError) throw error;
          return fail();
        }
        const after = spec.values(next),
          keys = [...new Set([...Object.keys(changes), ...reset])];
        const changed = keys.filter(
          (key) =>
            !sameSetting(before[key], after[key]) ||
            (resets.has(key) &&
              spec.fields.find((field) => field.key === key)?.inherit !== false &&
              original !== undefined &&
              Object.hasOwn(original, key)),
        );
        const overrides = original === undefined ? undefined : { ...original };
        if (overrides)
          for (const key of keys) {
            if (resets.has(key)) delete overrides[key];
            else overrides[key] = after[key];
          }
        const commit = () => {
          this.options.checkRevision(revision);
          spec.guard?.(next);
          if (!changed.length) return;
          try {
            this.options.save(
              next,
              store.revision,
              [...resets].some((key) => original !== undefined && Object.hasOwn(original, key))
                ? [
                    typeof spec.rewriteScope === 'function'
                      ? spec.rewriteScope()
                      : (spec.rewriteScope ?? 'shared'),
                  ]
                : [],
            );
          } catch (error) {
            if (error instanceof SettingsTargetError) throw error;
            throw new SettingsTargetError(
              'SAVE_FAILED',
              hostText('services.settingsCommands.saveFailed'),
            );
          }
        };
        return {
          changed,
          before,
          values: after,
          overrides,
          applies: Object.fromEntries(changed.map((key) => [key, applies(key)])),
          commit,
        };
      },
    };
  }
  private updates(): Target {
    const defaults = createDefaultSettings().updates;
    const fields: Field[] = Object.entries(defaults)
      .filter(([, value]) => ['boolean', 'string', 'number'].includes(typeof value))
      .map(([key, value]) => ({
        key,
        title: hostSettingItem('about', key).title,
        description: hostSettingItem('about', key).description,
        type: typeof value as 'boolean' | 'string' | 'number',
        default: value,
        ...(key === 'hostSource' ? { maxLength: 4096 } : {}),
        ...(key === 'startupDelaySeconds'
          ? { schema: { type: 'integer', minimum: 0, maximum: 3600 } }
          : {}),
      }));
    return {
      id: 'service.updates',
      rewriteScope: () => this.options.settings.settingScope(['updates', 'hostSource']),
      ui: settingsUiFields('about'),
      title: hostSettingItem('about', 'updates').title,
      category: 'updates',
      fields,
      values: (settings) => project(settings.updates, fields),
      overrides: (raw) => project(raw.updates, fields),
      replace: (settings, changes, reset) => {
        for (const [key, value] of Object.entries(changes))
          validateMcpSetting(
            fields.find((field) => field.key === key)!,
            value,
          );
        updateRecord(settings.updates as unknown as RecordValue, changes, reset, fields);
        return settings;
      },
      applies: (key) =>
        key === 'checkHostOnAboutOpen'
          ? 'nextAboutOpen'
          : ['hostSource', 'allowSameVersion'].includes(key)
            ? 'nextUpdateCheck'
            : key === 'startupDelaySeconds'
              ? 'nextStart'
              : 'nextStartupCheck',
    };
  }
  private commandTriggerOptions(): Target {
    const fields: Field[] = commandTriggerSettingDefinitions()
      .filter(
        (field) =>
          mcpSettingPublished(field) &&
          (field.type === 'string-list' || mcpSettingSupported(field)),
      )
      .map((field) => ({
        ...field,
        ...(field.type === 'string-list'
          ? {
              schema: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
              },
            }
          : {}),
      }));
    return {
      id: 'service.command-triggers',
      ui: settingsUiFields(['shortcuts', 'gestures', 'touchpad-gestures']),
      title: hostText('settings.commandTriggerOptions.title'),
      category: 'command-triggers',
      fields,
      applies: () => 'commandTriggerOptionsChanged',
      values: (settings) => project(getCommandTriggerOptions(settings), fields),
      overrides: (raw) => project(raw.commandTriggerOptions, fields),
      normalize: (changes) => {
        const normalized = parseCommandTriggerOptions({
          ...getCommandTriggerOptions(this.options.settings.value),
          ...changes,
        });
        return Object.fromEntries(
          Object.keys(changes).map((key) => [key, (normalized as Record<string, unknown>)[key]]),
        );
      },
      replace: (settings, changes, reset) => {
        const value = { ...getCommandTriggerOptions(settings) };
        updateRecord(value, changes, reset, fields);
        settings.commandTriggerOptions = parseCommandTriggerOptions(value);
        return settings;
      },
    };
  }
  private appletUpdateSource(applet: ExtensionSnapshot): Target {
    const defaults = applet.updateRepository ? `github:${applet.updateRepository}` : undefined;
    const fields: Field[] = [
      {
        key: 'updateSource',
        title: hostText('settings.updateSettings.sources'),
        type: 'string',
        maxLength: 4096,
        default: defaults,
      },
    ];
    return {
      id: 'service.updates.applet.' + Buffer.from(applet.id).toString('base64url'),
      ui: settingsUiFields('applet:' + applet.id),
      ownerId: applet.id,
      title: applet.displayName,
      category: 'updates',
      fields,
      values: (settings) => ({
        updateSource: settings.extensions[applet.id]?.updateSource ?? defaults,
      }),
      overrides: (raw) => project(object(raw.extensions)[applet.id], fields),
      replace: (settings, changes, reset) => {
        const entry = settings.extensions[applet.id] ?? { enabled: applet.enabled, settings: {} };
        updateRecord(entry as unknown as RecordValue, changes, reset, fields);
        settings.extensions[applet.id] = entry;
        return settings;
      },
      applies: () => 'nextUpdateCheck',
    };
  }
  private appletCommon(applet: ExtensionSnapshot): Target {
    const pages = applet.pages ?? [];
    const ordinary = appletCommonDefinitions(applet).filter(
      (field) => mcpSettingPublished(field) && mcpSettingSupported(field),
    );
    const pageIds = new Map(pages.map((page) => ['page:' + page.id, page.id]));
    const fields: Field[] = [
      ...(this.options.appletManagement
        ? [
            {
              key: 'enabled',
              title: hostText('settings.appletManagementSettings.enabled'),
              type: 'boolean' as const,
              default: defaultAppletEnabled,
              inherit: false,
              resettable: false,
              writable: this.options.appletManagement.canEditEnabled(applet.id),
            },
          ]
        : []),
      ...ordinary.map((field) => ({
        ...field,
        ...(field.integer
          ? { schema: { type: 'integer', minimum: field.minimum, maximum: field.maximum } }
          : {}),
      })),
      ...pages.map((page): Field => ({
        key: 'page:' + page.id,
        title: hostText('settings.appletSettingsForm.displayLabel', { title: page.title }),
        description: appletCommonDescriptions.display,
        type: 'select',
        default: page.defaultDisplay ?? 'page',
        resettable: !Object.keys(
          object(this.options.settings.value.extensions[applet.id]?.pages?.[page.id]),
        ).some((key) => key !== 'display'),
        options: [
          { value: 'page', label: hostText('settings.appletSettingsForm.hostPage') },
          { value: 'window', label: hostText('settings.appletSettingsForm.window') },
        ],
      })),
    ];
    const scope = this.options.settings.appletConfigurationScope(applet.id);
    const projectCommon = (entry: RecordValue, defaults: boolean) =>
      Object.fromEntries(
        fields.flatMap((field) => {
          const value = pageIds.has(field.key)
            ? object(object(entry.pages)[pageIds.get(field.key)!]).display
            : entry[field.key];
          return value === undefined && !defaults ? [] : [[field.key, value ?? field.default]];
        }),
      );
    return {
      id: 'service.applets.common.' + Buffer.from(applet.id).toString('base64url'),
      ui: (field) => [
        ...settingsUiFields('applet:' + applet.id)(field),
        ...(field?.key === 'enabled' ? [{ pageId: 'applets', key: 'enabled:' + applet.id }] : []),
      ],
      ownerId: applet.id,
      title: applet.displayName,
      category: 'applet-common',
      fields,
      stored: () => this.options.settings.storedAppletConfiguration(applet.id),
      rewriteScope: scope,
      context: { scope },
      values: (settings) => projectCommon(object(settings.extensions[applet.id]), true),
      overrides: (raw) => projectCommon(raw, false),
      applies: (key) =>
        key === 'enabled'
          ? 'appletEnabledChanged'
          : pageIds.has(key)
            ? 'pageDisplayChanged'
            : (ordinary.find((field) => field.key === key)?.applies ??
              'appletConfigurationChanged'),
      replace: (settings, changes, reset) => {
        if (Object.hasOwn(changes, 'enabled'))
          this.prepareAppletEnabled(applet.id, changes.enabled as boolean, settings);
        const entry = settings.extensions[applet.id] ?? { enabled: applet.enabled, settings: {} };
        for (const field of ordinary) {
          if (Object.hasOwn(changes, field.key))
            (entry as unknown as RecordValue)[field.key] = changes[field.key];
          if (reset.includes(field.key)) delete (entry as unknown as RecordValue)[field.key];
        }
        for (const page of pages) {
          const key = 'page:' + page.id;
          if (!Object.hasOwn(changes, key) && !reset.includes(key)) continue;
          const rows = { ...entry.pages };
          if (reset.includes(key)) delete rows[page.id];
          else rows[page.id] = { ...rows[page.id], display: changes[key] as 'page' | 'window' };
          if (Object.keys(rows).length) entry.pages = rows;
          else delete entry.pages;
        }
        settings.extensions[applet.id] = entry;
        return settings;
      },
      guard: (next) => {
        if (
          this.options.appletManagement &&
          appletEnabled(next, applet.id) !== appletEnabled(this.options.settings.value, applet.id)
        )
          this.prepareAppletEnabled(applet.id, appletEnabled(next, applet.id), next);
      },
    };
  }
  private prepareAppletEnabled(id: string, enabled: boolean, next: Settings) {
    try {
      return this.options.appletManagement!.prepareEnabled(id, enabled, next);
    } catch (error) {
      if (error instanceof AppletManagementError)
        throw new SettingsTargetError(error.code, error.message);
      throw error;
    }
  }
  private appletOrder(): SettingsListTarget {
    const applets = this.options.applets?.() ?? [];
    const rows = () =>
      managedApplets(applets, this.options.settings.value.appletOrder).map((applet) => ({
        id: applet.id,
        name: applet.displayName,
      }));
    const fields: Field[] = [
      { key: 'id', title: hostText('settings.appletManagementSettings.appletId'), type: 'string' },
      { key: 'name', title: hostText('settings.appletManagementSettings.name'), type: 'string' },
    ];
    const definition: SettingDefinition = {
      key: 'appletOrder',
      title: hostText('settings.appletManagementSettings.displayOrder'),
      type: 'object-list',
      fields,
      list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
    };
    return {
      kind: 'list',
      targetId: 'service.applets.order',
      ui: settingsUiGroup('applets', 'order'),
      ownerId: 'appdock',
      title: definition.title,
      category: 'applet-management',
      available: true,
      operations: ['reorder'],
      definition,
      fields,
      rows,
      applies: () => 'appletDisplayOrderChanged',
      schemaContext: () =>
        managedApplets(applets)
          .map((applet) => applet.id)
          .sort(),
      writable: () => false,
      itemWritable: () => false,
      removable: () => false,
      overrides: () => {
        try {
          return { appletOrder: this.options.settings.storedValue().appletOrder };
        } catch {
          return undefined;
        }
      },
      plan: (updated, revision) => {
        this.options.checkRevision(revision);
        const store = this.options.settings,
          original = rows().map((row) => row.id);
        const ordered = updated.map((row) => row.id);
        const replace = () => {
          try {
            return this.options.validate({
              ...structuredClone(store.value),
              appletOrder: reorderManagedApplets(
                this.options.applets?.() ?? [],
                store.value.appletOrder,
                ordered,
                original,
              ),
            });
          } catch {
            return fail();
          }
        };
        replace();
        const changed = sameSetting(original, ordered) ? [] : ['appletOrder'];
        return {
          changed,
          before: { appletOrder: original },
          values: { appletOrder: ordered },
          applies: { appletOrder: 'appletDisplayOrderChanged' },
          commit: () => {
            this.options.checkRevision(revision);
            if (!changed.length) return;
            const current = replace();
            try {
              this.options.save(current, store.revision, []);
            } catch (error) {
              if (error instanceof SettingsTargetError) throw error;
              throw new SettingsTargetError(
                'SAVE_FAILED',
                hostText('services.settingsCommands.saveFailed'),
              );
            }
          },
        };
      },
    };
  }
  private aiGeneral(): Target {
    const fields: Field[] = [
      {
        key: 'commonPrompt',
        title: hostText('settings.aiSettings.prompt'),
        type: 'string',
        maxLength: 2048,
        default: '',
      },
      {
        key: 'defaultConnectionId',
        title: hostText('settings.aiSettings.defaultConnection'),
        type: 'select',
        options: parseAiSettings(this.options.settings.value.ai).connections.map((connection) => ({
          value: connection.id,
          label: connection.name,
        })),
      },
    ];
    return {
      id: 'service.ai',
      ui: settingsUiFields('ai'),
      title: hostText('settings.aiSettings.common'),
      category: 'ai',
      fields,
      values: (settings) => project(parseAiSettings(settings.ai), fields),
      overrides: (raw) => project(raw.ai, fields),
      replace: (settings, changes, reset) => {
        const ai = { ...parseAiSettings(settings.ai) };
        updateRecord(ai as unknown as RecordValue, changes, reset, fields);
        settings.ai = parseAiSettings(ai);
        return settings;
      },
      guard: (settings) => this.options.ai.validatePublic(parseAiSettings(settings.ai)),
    };
  }
  private aiConnection(id: string): Target {
    const connection = (settings: Settings) =>
      parseAiSettings(settings.ai).connections.find((connection) => connection.id === id) ??
      fail('NOT_FOUND');
    const current = connection(this.options.settings.value),
      fields = this.aiConnectionFields(current, this.options.ai.configurationState(id).protected);
    return {
      id: 'service.ai.connection.' + Buffer.from(id).toString('base64url'),
      title: current.name,
      category: 'ai',
      fields,
      values: (settings) =>
        Object.fromEntries(
          fields.map((field) => [
            field.key,
            at(connection(settings), field.key.split('.')) ?? field.default,
          ]),
        ),
      overrides: (raw) =>
        project(
          (object(raw.ai).connections as unknown[] | undefined)?.find(
            (value) => object(value).id === id,
          ),
          fields,
        ),
      replace: (settings, changes, reset) => {
        const ai = parseAiSettings(settings.ai),
          value = ai.connections.find((connection) => connection.id === id)!;
        updateRecord(value as unknown as RecordValue, changes, reset, fields);
        for (const key of reset) {
          const field = fields.find((field) => field.key === key)!;
          if (field.default !== undefined)
            assign(value as unknown as RecordValue, key.split('.'), field.default);
        }
        Object.assign(
          value,
          this.options.ai.preparePublicConnection(
            value,
            Object.hasOwn(changes, 'name') || reset.includes('name'),
          ),
        );
        settings.ai = parseAiSettings(ai);
        return settings;
      },
      guard: (settings) => this.options.ai.validatePublic(parseAiSettings(settings.ai)),
      guardRevision: () => this.options.ai.configurationState(id).revision,
    };
  }
  private aiConnectionFields(current: AiConnectionSettings, protectedKey: boolean): Field[] {
    const defaults = newAiConnection(current.id, current.preset);
    return [
      {
        key: 'name',
        title: hostText('settings.aiConnectionDialog.name'),
        type: 'string',
        maxLength: 160,
        default: defaults.name,
      },
      {
        key: 'preset',
        title: hostText('settings.aiConnectionDialog.kind'),
        type: 'select',
        options: options(['ollama', 'lm-studio', 'llama-cpp', 'openai', 'custom']),
        default: 'ollama',
      },
      {
        key: 'baseUrl',
        title: hostText('settings.aiConnectionDialog.url'),
        type: 'string',
        maxLength: 2048,
        writable: !protectedKey,
        resettable: false,
      },
      {
        key: 'authentication',
        title: hostText('settings.aiConnectionDialog.auth'),
        type: 'select',
        options: [
          { value: 'none', label: hostText('settings.aiConnectionDialog.noAuth') },
          { value: 'bearer', label: hostText('settings.aiConnectionDialog.bearer') },
        ],
        default: 'none',
        writable: !protectedKey && current.authentication === 'bearer',
      },
      {
        key: 'defaultModel',
        title: hostText('settings.aiConnectionDialog.model'),
        type: 'string',
        maxLength: 200,
        default: '',
      },
      {
        key: 'defaultMaxOutputTokens',
        title: hostText('settings.aiConnectionDialog.maxTokens'),
        type: 'number',
        default: aiOutputTokenLimits.default,
        schema: {
          type: 'integer',
          minimum: aiOutputTokenLimits.minimum,
          maximum: aiOutputTokenLimits.maximum,
        },
      },
      {
        key: 'defaultTimeoutSeconds',
        title: hostText('settings.aiConnectionDialog.timeout'),
        type: 'number',
        default: aiTimeoutLimits.defaultSeconds,
        schema: {
          type: 'integer',
          minimum: aiTimeoutLimits.minimumSeconds,
          maximum: aiTimeoutLimits.maximumSeconds,
        },
      },
      {
        key: 'compatibility.tokenLimitField',
        title: hostText('settings.aiConnectionDialog.tokenFormat'),
        type: 'select',
        options: options(['max_tokens', 'max_completion_tokens']),
        default: defaults.compatibility.tokenLimitField,
      },
      {
        key: 'compatibility.temperature',
        title: hostText('settings.aiConnectionDialog.temperatureLabel'),
        type: 'number',
        minimum: 0,
        maximum: 2,
      },
      {
        key: 'compatibility.reasoningEffort',
        title: hostText('settings.aiConnectionDialog.reasoning'),
        type: 'string',
        schema: { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' },
      },
      {
        key: 'compatibility.store',
        title: hostText('settings.aiConnectionDialog.store'),
        type: 'select',
        options: options(['omit', 'false']),
        default: defaults.compatibility.store,
      },
    ].map((field) => ({ ...field, inherit: false }) as Field);
  }
  private aiConnections(): SettingsListTarget {
    const rows = () =>
      parseAiSettings(this.options.settings.value.ai).connections as unknown as RecordValue[];
    const protectedKey = (row: RecordValue) =>
      this.options.ai.configurationState(String(row.id)).protected;
    const fields: Field[] = [
      { key: 'id', title: hostText('settings.aiSettings.connectionId'), type: 'string' },
      ...this.aiConnectionFields(newAiConnection('defaults'), false).map((field) => ({
        ...field,
        propertyPath: field.key.split('.'),
      })),
    ];
    const definition: SettingDefinition = {
      key: 'connections',
      title: hostText('settings.aiSettings.connections'),
      type: 'object-list',
      fields,
      list: { idKey: 'id', titleKey: 'name', columns: ['name', 'baseUrl'] },
    };
    return {
      kind: 'list',
      targetId: 'service.ai.connections',
      ui: settingsUiGroup('ai', 'connections'),
      ownerId: 'appdock',
      title: definition.title,
      category: 'ai',
      available: true,
      definition,
      fields,
      rows,
      applies: () => 'aiSettingsChanged',
      inputSchema: (field) => (field as Field).schema ?? settingInputSchema(field),
      writable: (field) => field.key !== 'id',
      removable: (row) => !protectedKey(row),
      itemWritable: (row, field) =>
        field.key !== 'id' &&
        (field.key === 'baseUrl'
          ? !protectedKey(row)
          : field.key !== 'authentication' ||
            (!protectedKey(row) && row.authentication === 'bearer')),
      overrides: () => {
        try {
          return {
            connections: object(this.options.settings.storedValue().ai).connections,
            $guard: rows().map(
              (row) => this.options.ai.configurationState(String(row.id)).revision,
            ),
          };
        } catch {
          return undefined;
        }
      },
      createRow: (values) => {
        const preset = values.preset ?? 'ollama';
        if (!['ollama', 'lm-studio', 'llama-cpp', 'openai', 'custom'].includes(String(preset)))
          fail();
        return newAiConnection(
          randomUUID(),
          preset as AiConnectionSettings['preset'],
        ) as unknown as RecordValue;
      },
      prepareRow: (row, keys) => {
        try {
          Object.assign(
            row,
            this.options.ai.preparePublicConnection(
              row as unknown as AiConnectionSettings,
              keys.includes('name'),
            ),
          );
        } catch {
          fail();
        }
      },
      plan: (connections, revision) => {
        this.options.checkRevision(revision);
        const store = this.options.settings,
          before = parseAiSettings(store.value.ai);
        let next: Settings;
        try {
          const ai = this.options.ai.preparePublicConnections(connections);
          next = this.options.validate({ ...structuredClone(store.value), ai });
        } catch (error) {
          if (error instanceof SettingsTargetError) throw error;
          return fail();
        }
        const changed = sameSetting(before, next.ai) ? [] : ['connections'];
        return {
          changed,
          before: { connections: before.connections },
          values: { connections: next.ai!.connections },
          applies: Object.fromEntries(changed.map((key) => [key, 'aiSettingsChanged'])),
          commit: () => {
            this.options.checkRevision(revision);
            this.options.ai.validatePublic(next.ai!);
            if (!changed.length) return;
            try {
              this.options.save(next, store.revision, []);
            } catch (error) {
              if (error instanceof SettingsTargetError) throw error;
              throw new SettingsTargetError(
                'SAVE_FAILED',
                hostText('services.settingsCommands.saveFailed'),
              );
            }
          },
        };
      },
    };
  }
  private tts(): Target {
    const defaults = defaultTtsSettings(),
      protectedKey = this.options.tts.configurationState().protected;
    const fields: Field[] = [
      {
        key: 'baseUrl',
        title: hostText('settings.ttsSettings.url'),
        type: 'string',
        maxLength: 2048,
        default: defaults.baseUrl,
        writable: !protectedKey,
      },
      {
        key: 'model',
        title: hostText('settings.ttsSettings.model'),
        type: 'string',
        maxLength: 200,
        default: defaults.model,
      },
      {
        key: 'defaultVoice',
        title: hostText('settings.ttsSettings.defaultVoice'),
        type: 'string',
        maxLength: 200,
        default: defaults.defaultVoice,
      },
      {
        key: 'defaultSpeed',
        title: hostText('settings.ttsSettings.speed'),
        type: 'number',
        minimum: 0.25,
        maximum: 4,
        default: defaults.defaultSpeed,
      },
      {
        key: 'speedMode',
        title: hostText('settings.ttsSettings.speedMode'),
        type: 'select',
        options: options(['playback', 'server']),
        default: defaults.speedMode,
      },
      {
        key: 'voicesSource',
        title: hostText('settings.ttsSettings.voiceMode'),
        type: 'select',
        options: options(['endpoint', 'manual']),
        default: defaults.voicesSource,
      },
      {
        key: 'voicesPath',
        title: hostText('settings.ttsSettings.voicePath'),
        type: 'string',
        maxLength: 256,
        default: defaults.voicesPath,
      },
    ];
    return {
      id: 'service.tts',
      ui: settingsUiFields('tts'),
      title: hostText('settings.ttsSettings.title'),
      category: 'tts',
      fields,
      values: (settings) => project(parseTtsSettings(settings.tts), fields),
      overrides: (raw) => project(raw.tts, fields),
      replace: (settings, changes, reset) => {
        const tts = parseTtsSettings(settings.tts);
        updateRecord(tts as unknown as RecordValue, changes, reset, fields);
        settings.tts = parseTtsSettings(tts);
        return settings;
      },
      guard: (next) => {
        if (
          parseTtsSettings(next.tts).baseUrl !==
            parseTtsSettings(this.options.settings.value.tts).baseUrl &&
          this.options.tts.configurationState().protected
        )
          fail('LOCAL_ACTION_REQUIRED');
      },
      guardRevision: () => this.options.tts.configurationState().revision,
    };
  }
  private ttsVoices(): SettingsListTarget {
    const fields: Field[] = [
      {
        key: 'id',
        title: hostText('settings.ttsSettings.voiceId'),
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      {
        key: 'name',
        title: hostText('settings.ttsSettings.voiceName'),
        type: 'string',
        maxLength: 200,
      },
    ];
    const definition: Field = {
      key: 'manualVoices',
      title: hostText('settings.ttsSettings.manualList'),
      type: 'object-list',
      default: [],
      fields,
      list: { titleKey: 'name', columns: ['id', 'name'] },
    };
    const owner = this.target({
      id: 'service.tts.manual-voices',
      title: definition.title,
      category: 'tts',
      fields: [definition],
      values: (settings) => ({ manualVoices: parseTtsSettings(settings.tts).manualVoices }),
      overrides: (raw) => project(raw.tts, [definition]),
      replace: (settings, changes) => {
        settings.tts = parseTtsSettings({
          ...parseTtsSettings(settings.tts),
          manualVoices: changes.manualVoices ?? [],
        });
        return settings;
      },
    });
    return {
      kind: 'list',
      targetId: owner.targetId,
      ui: settingsUiGroup('tts', 'manualVoices'),
      ownerId: owner.ownerId,
      title: owner.title,
      category: owner.category,
      available: true,
      fields,
      definition,
      rows: () =>
        parseTtsSettings(this.options.settings.value.tts).manualVoices as unknown as RecordValue[],
      // Voice IDs identify the server's voices and are edited explicitly, never generated.
      createRow: (values) => (values.name === undefined ? { name: values.id } : {}),
      overrides: owner.overrides,
      applies: owner.applies,
      plan: (rows, revision) => owner.plan({ manualVoices: rows }, [], revision),
    };
  }
  private speech(): Target {
    const defaults = resolveNotificationSpeech({
      ...this.options.settings.value,
      notificationPreferences: { overrides: [] },
    });
    const fields: Field[] = [
      {
        key: 'voice',
        title: hostText('settings.notificationSettings.voice'),
        type: 'string',
        minLength: 1,
        maxLength: 200,
        default: defaults.voice,
      },
      {
        key: 'speed',
        title: hostText('settings.notificationSettings.speed'),
        type: 'number',
        minimum: 0.25,
        maximum: 4,
        default: defaults.speed,
      },
    ];
    return {
      id: 'service.notifications.speech',
      rewriteScope: () => this.options.settings.settingScope(['notificationPreferences']),
      ui: settingsUiFields('notifications', (field) => 'speech.' + field.key),
      title: hostText('settings.notificationSettings.speechSettings'),
      category: 'notifications',
      fields,
      values: (settings) => resolveNotificationSpeech(settings),
      overrides: (raw) => project(object(raw.notificationPreferences).speech, fields),
      replace: (settings, changes, reset) => {
        const speech = { ...settings.notificationPreferences?.speech };
        updateRecord(speech, changes, reset, fields);
        settings.notificationPreferences = {
          ...settings.notificationPreferences,
          overrides: settings.notificationPreferences?.overrides ?? [],
          ...(Object.keys(speech).length ? { speech } : { speech: undefined }),
        };
        return settings;
      },
    };
  }
  private notification(type: NotificationTypeEntry): Target {
    const key = notificationTypeKey(type),
      identity = { ownerKind: type.ownerKind, ownerId: type.ownerId, typeId: type.typeId };
    const row = (settings: Settings) =>
      settings.notificationPreferences?.overrides.find((row) => notificationTypeKey(row) === key);
    const defaults = resolveNotificationPolicy(type, {
      ...this.options.settings.value,
      notificationPreferences: { overrides: [] },
    });
    const fields: Field[] = [
      {
        key: 'targets',
        title: hostText('settings.notificationSettings.targets'),
        type: 'string-list',
        default: defaults.selectedTargets,
        schema: {
          type: 'array',
          maxItems: 3,
          uniqueItems: true,
          items: { type: 'string', enum: type.allowedTargets },
          allOf: type.requiredTargets.map((value) => ({ contains: { const: value } })),
        },
      },
      {
        key: 'durationSeconds',
        title: hostText('settings.notificationSettings.durationTitle'),
        type: 'number',
        default: defaults.durationSeconds,
        writable: type.lifetimePolicy === 'userDuration',
        schema: { type: ['integer', 'null'], minimum: 1, maximum: 86400 },
      },
      {
        key: 'speak',
        title: hostText('settings.notificationSettings.speech'),
        type: 'boolean',
        default: false,
      },
      { key: 'mcpEvents', title: 'MCP Events', type: 'boolean', default: false },
    ];
    return {
      id: 'service.notification.' + Buffer.from(key).toString('base64url'),
      rewriteScope: () => this.options.settings.settingScope(['notificationPreferences']),
      ui: settingsUiGroup('notifications', notificationSettingKey(type)),
      ownerId: type.ownerKind === 'host' ? 'appdock' : type.ownerId,
      title: type.ownerTitle + ' / ' + type.title,
      category: 'notifications',
      fields,
      values: (settings) => {
        const policy = resolveNotificationPolicy(type, settings),
          current = row(settings);
        return {
          targets: policy.selectedTargets,
          durationSeconds: policy.durationSeconds,
          speak: current?.speak ?? false,
          mcpEvents: current?.mcpEvents ?? false,
        };
      },
      overrides: (raw) =>
        project(
          (object(raw.notificationPreferences).overrides as unknown[] | undefined)?.find(
            (value) => notificationTypeKey(value as NotificationPreference) === key,
          ),
          fields,
        ),
      replace: (settings, changes, reset) => {
        const current = row(settings),
          draft = { ...identity, ...current, ...changes };
        for (const field of reset) delete (draft as RecordValue)[field];
        return replaceNotificationPreference(
          settings,
          this.options.notifications(),
          type,
          current ?? null,
          draft,
        );
      },
      context: [
        type.allowedTargets,
        type.defaultTargets,
        type.requiredTargets,
        type.lifetimePolicy,
        type.defaultDurationSeconds,
        type.history,
      ],
    };
  }
}

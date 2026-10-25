import type { Settings, SettingDefinition } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import {
  parseAiSettings,
  newAiConnection,
  aiOutputTokenLimits,
  aiTimeoutLimits,
} from '../../shared/ai';
import { defaultTtsSettings, parseTtsSettings } from '../../shared/tts';
import { replaceNotificationPreference } from '../../shared/notification-preference-edit';
import {
  notificationTypeKey,
  resolveNotificationPolicy,
  resolveNotificationSpeech,
  type NotificationTypeEntry,
  type NotificationPreference,
} from '../../shared/notification-types';
import { sameSetting } from '../../shared/settings-defaults';
import { settingInputSchema } from '../../shared/settings-commands';
import type { SettingsStore } from './settings';
import { SettingsTargetError, type SettingsFieldTarget } from './settings-target-types';
import type { AiSettingsController } from './ai-settings';
import type { TtsSecrets } from './tts-secrets';

type RecordValue = Record<string, unknown>;
interface Field extends SettingDefinition {
  schema?: RecordValue;
  writable?: boolean;
  resettable?: boolean;
  inherit?: boolean;
}
interface Target {
  id: string;
  title: string;
  category: string;
  ownerId?: string;
  fields: Field[];
  values(settings: Settings): RecordValue;
  overrides(raw: RecordValue): RecordValue;
  replace(settings: Settings, changes: RecordValue, reset: string[]): Settings;
  guard?(next: Settings): void;
  context?: unknown;
  guardRevision?(): string;
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
    },
  ) {}
  targets(): SettingsFieldTarget[] {
    return [
      this.aiGeneral(),
      ...parseAiSettings(this.options.settings.value.ai).connections.map((connection) =>
        this.aiConnection(connection.id),
      ),
      this.tts(),
      this.speech(),
      ...this.options.notifications().map((type) => this.notification(type)),
    ].map((target) => this.target(target));
  }
  private target(spec: Target): SettingsFieldTarget {
    const readOverrides = (): RecordValue | undefined => {
      try {
        const raw = spec.overrides(this.options.settings.storedValue());
        return { ...raw, ...(spec.guardRevision ? { $guard: spec.guardRevision() } : {}) };
      } catch {
        return undefined;
      }
    };
    return {
      targetId: spec.id,
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
      applies: () =>
        spec.category === 'ai'
          ? 'aiSettingsChanged'
          : spec.category === 'tts'
            ? 'ttsSettingsChanged'
            : 'notificationPreferencesChanged',
      plan: (changes, reset, revision) => {
        this.options.checkRevision(revision);
        const store = this.options.settings,
          before = spec.values(store.value),
          original = readOverrides();
        const actual = { ...changes },
          resets = new Set(reset);
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
                ? ['shared']
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
          applies: Object.fromEntries(
            changed.map((key) => [
              key,
              spec.category === 'ai'
                ? 'aiSettingsChanged'
                : spec.category === 'tts'
                  ? 'ttsSettingsChanged'
                  : 'notificationPreferencesChanged',
            ]),
          ),
          commit,
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
      defaults = newAiConnection(id, current.preset),
      protectedKey = this.options.ai.configurationState(id).protected;
    const fields: Field[] = [
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

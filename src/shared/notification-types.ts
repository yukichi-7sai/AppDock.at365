import { hostText } from './i18n';
import { soundLibraryReference } from './library-assets';
import type { ExtensionSnapshot, Settings } from './contracts';
import type { NotificationLevel, NotificationLifetime, NotificationTarget } from './notifications';
export interface NotificationOwner {
  ownerKind: 'host' | 'applet';
  ownerId: string;
}
export interface NotificationTypeDefinition {
  typeId: string;
  title: string;
  description: string;
  levels: NotificationLevel[];
  defaultLevel: NotificationLevel;
  allowedTargets: NotificationTarget[];
  defaultTargets: NotificationTarget[];
  requiredTargets: NotificationTarget[];
  lifetimePolicy: 'userDuration' | 'fixedManual' | 'condition';
  defaultDurationSeconds?: number | null;
  history: 'persistent' | 'session' | 'none';
}
export interface NotificationTypeEntry extends NotificationTypeDefinition, NotificationOwner {
  ownerTitle: string;
  ownerState: string;
}
export interface NotificationPreference extends NotificationOwner {
  typeId: string;
  targets?: NotificationTarget[];
  durationSeconds?: number | null;
  speak?: boolean;
  sound?: boolean;
  mcpEvents?: boolean;
}
export interface NotificationSpeechSettings {
  connectionId?: string;
  instructions?: string;
}
export interface NotificationPreferences {
  speech?: NotificationSpeechSettings;
  sound?: { file: string; name: string };
  overrides: NotificationPreference[];
}
export interface NotificationPolicy {
  enabled: boolean;
  selectedTargets: NotificationTarget[];
  targets: NotificationTarget[];
  lifetime: NotificationLifetime;
  dismissible: boolean;
  durationSeconds: number | null;
  reason?: string;
}
export interface TypedNotificationInput {
  typeId: string;
  title: string;
  body: string;
  level?: NotificationLevel;
  dedupeKey?: string;
  historyText?: { title: string; body: string };
  actions?: {
    key: string;
    label: string;
    primary?: boolean;
    disabled?: boolean;
    command: string;
  }[];
  restartTimer?: boolean;
  silent?: boolean;
}
export type NotificationPublishResult =
  { status: 'accepted'; notificationId: string } | { status: 'suppressed'; reason: string };
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9._-]{0,100}$/.test(v) &&
  !['constructor', 'prototype', '__proto__'].includes(v);
const targetNames = ['banner', 'desktop', 'windows'];
const targets = (v: unknown): v is NotificationTarget[] =>
  Array.isArray(v) &&
  v.length <= 3 &&
  v.every((t) => targetNames.includes(t)) &&
  new Set(v).size === v.length;
const duration = (v: unknown) =>
  v === null || (Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 86400);
export const notificationTypeKey = (v: NotificationOwner & { typeId: string }) =>
  JSON.stringify([v.ownerKind, v.ownerId, v.typeId]);
export const notificationSettingKey = (v: NotificationOwner & { typeId: string }) =>
  encodeURIComponent(notificationTypeKey(v));
export function parseNotificationTypes(value: unknown, host = false): NotificationTypeDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64)
    throw Error(hostText('settings.notification-types.limit'));
  const keys = [
    'typeId',
    'title',
    'description',
    'levels',
    'defaultLevel',
    'defaultEnabled',
    'canDisable',
    'disabledControlReason',
    'allowedTargets',
    'defaultTargets',
    'requiredTargets',
    'lifetimePolicy',
    'defaultDurationSeconds',
    'history',
  ];
  const result = value.map((v) => {
    if (
      !object(v) ||
      Object.keys(v).some((k) => !keys.includes(k)) ||
      !id(v.typeId) ||
      (!host && v.typeId === 'appdock.legacy') ||
      typeof v.title !== 'string' ||
      !v.title.trim() ||
      v.title.length > 100 ||
      typeof v.description !== 'string' ||
      v.description.length > 1000 ||
      !Array.isArray(v.levels) ||
      !v.levels.length ||
      v.levels.length > 3 ||
      new Set(v.levels).size !== v.levels.length ||
      v.levels.some((l: unknown) => !['info', 'warning', 'error'].includes(String(l))) ||
      !v.levels.includes(v.defaultLevel) ||
      (v.defaultEnabled !== undefined && typeof v.defaultEnabled !== 'boolean') ||
      (v.canDisable !== undefined && typeof v.canDisable !== 'boolean') ||
      (v.disabledControlReason !== undefined &&
        (typeof v.disabledControlReason !== 'string' || v.disabledControlReason.length > 1000)) ||
      !targets(v.allowedTargets) ||
      !targets(v.defaultTargets) ||
      !targets(v.requiredTargets) ||
      [...v.defaultTargets, ...v.requiredTargets].some((t) => !v.allowedTargets.includes(t)) ||
      v.requiredTargets.some((t) => !v.defaultTargets.includes(t)) ||
      !['userDuration', 'fixedManual', 'condition'].includes(v.lifetimePolicy) ||
      !['persistent', 'session', 'none'].includes(v.history) ||
      (v.defaultDurationSeconds !== undefined &&
        (v.lifetimePolicy !== 'userDuration' || !duration(v.defaultDurationSeconds)))
    )
      throw Error(hostText('settings.notification-types.definition'));
    // Accept obsolete manifest fields without using them to suppress notifications.
    const { defaultEnabled, canDisable, disabledControlReason, ...definition } = v;
    return structuredClone(definition) as NotificationTypeDefinition;
  });
  if (new Set(result.map((v) => v.typeId)).size !== result.length)
    throw Error(hostText('settings.notification-types.duplicateType'));
  return result;
}
export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (value === undefined) return { overrides: [] };
  if (
    !object(value) ||
    Object.keys(value).some((k) => !['overrides', 'speech', 'sound'].includes(k)) ||
    !Array.isArray(value.overrides)
  )
    throw Error(hostText('settings.notification-types.format'));
  const rows = value.overrides.map((v: unknown) => {
    if (
      !object(v) ||
      Object.keys(v).some(
        (k) =>
          ![
            'ownerKind',
            'ownerId',
            'typeId',
            'enabled',
            'targets',
            'durationSeconds',
            'speak',
            'sound',
            'mcpEvents',
          ].includes(k),
      ) ||
      !['host', 'applet'].includes(v.ownerKind) ||
      !id(v.ownerId) ||
      !id(v.typeId) ||
      (v.enabled !== undefined && typeof v.enabled !== 'boolean') ||
      (v.speak !== undefined && typeof v.speak !== 'boolean') ||
      (v.sound !== undefined && typeof v.sound !== 'boolean') ||
      (v.mcpEvents !== undefined && typeof v.mcpEvents !== 'boolean') ||
      (v.targets !== undefined && !targets(v.targets)) ||
      (v.durationSeconds !== undefined && !duration(v.durationSeconds))
    )
      throw Error(hostText('settings.notification-types.value'));
    // Old ON/OFF values are readable but no longer participate in delivery or persistence.
    const { enabled, ...preference } = v;
    return structuredClone(preference) as NotificationPreference;
  });
  if (new Set(rows.map(notificationTypeKey)).size !== rows.length)
    throw Error(hostText('settings.notification-types.duplicate'));
  const speech = value.speech;
  if (
    speech !== undefined &&
    (!object(speech) ||
      Object.keys(speech).some(
        (k) => !['connectionId', 'instructions', 'voice', 'speed'].includes(k),
      ) ||
      (speech.connectionId !== undefined &&
        (typeof speech.connectionId !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(speech.connectionId))) ||
      (speech.instructions !== undefined && typeof speech.instructions !== 'string') ||
      (speech.voice !== undefined &&
        (typeof speech.voice !== 'string' || !speech.voice.trim() || speech.voice.length > 200)))
  )
    throw Error(hostText('settings.notification-types.speech'));
  const sound = value.sound;
  if (
    sound !== undefined &&
    (!object(sound) ||
      Object.keys(sound).some((key) => !['file', 'name'].includes(key)) ||
      !soundLibraryReference(sound.file) ||
      typeof sound.name !== 'string' ||
      !sound.name.trim() ||
      sound.name.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(sound.name))
  )
    throw Error(hostText('settings.notificationSettings.invalidSound'));
  return {
    overrides: rows,
    // Retired voice/speed overrides do not invalidate other notification preferences.
    ...(speech === undefined
      ? {}
      : {
          speech: {
            ...(speech.connectionId === undefined ? {} : { connectionId: speech.connectionId }),
            ...(speech.instructions?.trim() ? { instructions: speech.instructions } : {}),
          },
        }),
    ...(sound === undefined ? {} : { sound: structuredClone(sound) }),
  };
}
export function notificationCatalog(applets: ExtensionSnapshot[]): NotificationTypeEntry[] {
  return [
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      ownerId: 'errors',
      typeId: 'operation-failed',
      title: hostText('settings.notification-types.error'),
      description: hostText('settings.notification-types.errorHint'),
      levels: ['error'],
      defaultLevel: 'error',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: ['banner'],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: null,
      history: 'persistent',
    },
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      ownerId: 'warnings',
      typeId: 'attention-required',
      title: hostText('settings.notification-types.warning'),
      description: hostText('settings.notification-types.warningHint'),
      levels: ['warning'],
      defaultLevel: 'warning',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: ['banner'],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: null,
      history: 'persistent',
    },
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      ownerId: 'information',
      typeId: 'operation-completed',
      title: hostText('settings.notification-types.information'),
      description: hostText('settings.notification-types.informationHint'),
      levels: ['info'],
      defaultLevel: 'info',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: ['banner'],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: 6,
      history: 'persistent',
    },
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      ownerId: 'settings',
      typeId: 'restart-required',
      title: hostText('settings.notification-types.restart'),
      description: hostText('settings.notification-types.restartHint'),
      levels: ['warning'],
      defaultLevel: 'warning',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: ['banner'],
      requiredTargets: [],
      lifetimePolicy: 'condition',
      history: 'persistent',
    },
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      history: 'persistent',
      defaultTargets: ['banner'],
      ownerId: 'updates',
      typeId: 'applied',
      title: hostText('settings.notification-types.updated'),
      description: hostText('settings.notification-types.updatedHint'),
      levels: ['info'],
      defaultLevel: 'info',
      allowedTargets: ['banner', 'desktop', 'windows'],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: 6,
    },
    {
      ownerKind: 'host',
      ownerTitle: 'AppDock',
      ownerState: 'running',
      history: 'persistent',
      ownerId: 'updates',
      typeId: 'available',
      title: hostText('settings.notification-types.updateAvailable'),
      description: hostText('settings.notification-types.updateAvailableHint'),
      levels: ['info'],
      defaultLevel: 'info',
      allowedTargets: ['banner', 'desktop', 'windows'],
      defaultTargets: ['banner'],
      requiredTargets: [],
      lifetimePolicy: 'userDuration',
      defaultDurationSeconds: 6,
    },
    ...applets.flatMap((a) =>
      (a.notificationTypes ?? []).map((t) => ({
        ...t,
        ownerKind: 'applet' as const,
        ownerId: a.id,
        ownerTitle: a.displayName,
        ownerState: a.state,
      })),
    ),
  ];
}
export function resolveNotificationPolicy(
  type: NotificationTypeEntry,
  settings: Settings,
): NotificationPolicy {
  const row = settings.notificationPreferences?.overrides.find(
    (r) => notificationTypeKey(r) === notificationTypeKey(type),
  );
  const invalidTargets = row?.targets?.some((t) => !type.allowedTargets.includes(t));
  const selectedTargets = [
    ...new Set([
      ...(row?.targets ?? type.defaultTargets).filter((t) => type.allowedTargets.includes(t)),
      ...type.requiredTargets,
    ]),
  ];
  const seconds =
    type.lifetimePolicy === 'userDuration'
      ? row?.durationSeconds !== undefined
        ? row.durationSeconds
        : (type.defaultDurationSeconds ?? null)
      : null;
  const reason = invalidTargets ? 'type-definition-changed' : undefined;
  return {
    enabled: !reason,
    selectedTargets,
    targets: [...selectedTargets],
    durationSeconds: seconds,
    lifetime:
      type.lifetimePolicy === 'condition'
        ? { type: 'condition' }
        : seconds === null
          ? { type: 'manual' }
          : { type: 'timed', milliseconds: seconds * 1000 },
    dismissible: type.lifetimePolicy !== 'condition',
    reason,
  };
}
export function validateNotificationPreferenceChanges(
  next: Settings,
  previous: Settings,
  catalog: NotificationTypeEntry[],
) {
  for (const row of next.notificationPreferences?.overrides ?? []) {
    const prior = previous.notificationPreferences?.overrides.find(
      (r) => notificationTypeKey(r) === notificationTypeKey(row),
    );
    if (JSON.stringify(prior) === JSON.stringify(row)) continue;
    const type = catalog.find((t) => notificationTypeKey(t) === notificationTypeKey(row));
    if (!type) continue;
    if (
      (row.durationSeconds !== undefined && type.lifetimePolicy !== 'userDuration') ||
      row.targets?.some((t) => !type.allowedTargets.includes(t)) ||
      type.requiredTargets.some((t) => row.targets !== undefined && !row.targets.includes(t))
    )
      throw Error(hostText('settings.notification-types.constraintMessage', { title: type.title }));
  }
}

export function resolveNotificationSpeech(settings: Settings) {
  const override = settings.notificationPreferences?.speech;
  return {
    connectionId: override?.connectionId ?? settings.tts?.defaultConnectionId,
    ...(override?.instructions?.trim() ? { instructions: override.instructions } : {}),
  };
}
export function notificationSpeechEnabled(
  type: NotificationTypeEntry,
  settings: Settings,
): boolean {
  return (
    resolveNotificationPolicy(type, settings).enabled &&
    settings.notificationPreferences?.overrides.find(
      (r) => notificationTypeKey(r) === notificationTypeKey(type),
    )?.speak === true
  );
}
export function notificationSoundEnabled(type: NotificationTypeEntry, settings: Settings): boolean {
  return (
    !!settings.notificationPreferences?.sound &&
    resolveNotificationPolicy(type, settings).enabled &&
    settings.notificationPreferences.overrides.find(
      (row) => notificationTypeKey(row) === notificationTypeKey(type),
    )?.sound === true
  );
}

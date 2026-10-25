import type { Settings } from './contracts';
import type { NotificationTypeEntry } from './notification-types';
import {
  notificationTypeKey,
  parseNotificationPreferences,
  validateNotificationPreferenceChanges,
} from './notification-types';
import { hostText } from './i18n';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Runtime availability and translated labels can change without invalidating an edit.
const rules = (type: NotificationTypeEntry) => [
  type.allowedTargets,
  type.defaultTargets,
  type.requiredTargets,
  type.lifetimePolicy,
  type.defaultDurationSeconds,
  type.history,
];

/** Replace one notification preference against its opening values, preserving other rows. */
export function replaceNotificationPreference(
  settings: Settings,
  catalog: NotificationTypeEntry[],
  type: unknown,
  original: unknown,
  draft: unknown,
): Settings {
  if (!type || typeof type !== 'object')
    throw Error(hostText('settings.notificationSettings.editConflict'));
  const expectedType = type as NotificationTypeEntry;
  const key = notificationTypeKey(expectedType);
  const currentType = catalog.find((item) => notificationTypeKey(item) === key);
  const overrides = settings.notificationPreferences?.overrides ?? [];
  const current = overrides.find((item) => notificationTypeKey(item) === key) ?? null;
  if (!currentType || !equal(rules(expectedType), rules(currentType)) || !equal(original, current))
    throw Error(hostText('settings.notificationSettings.editConflict'));
  const row = parseNotificationPreferences({ overrides: [draft] }).overrides[0];
  if (notificationTypeKey(row) !== key)
    throw Error(hostText('settings.notificationSettings.editConflict'));
  // An untouched dialog must not turn inherited defaults into explicit preferences.
  if (equal(row, current) || (!current && Object.keys(row).length === 3)) return settings;
  const next = {
    ...settings,
    notificationPreferences: {
      ...settings.notificationPreferences,
      overrides: current
        ? overrides.map((item) => (notificationTypeKey(item) === key ? row : item))
        : [...overrides, row],
    },
  };
  validateNotificationPreferenceChanges(next, settings, catalog);
  return next;
}

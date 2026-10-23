import { hostText } from '../../shared/i18n';
export type SettingsIssueKind =
  | 'read-invalid'
  | 'read-unavailable'
  | 'save-failed'
  | 'backup-failed'
  | 'apply-failed'
  | 'launch-save-failed';

export const settingsIssueMessages: Record<SettingsIssueKind, string> = {
  'read-invalid': hostText('health.readInvalid'),
  'read-unavailable': hostText('health.readUnavailable'),
  'save-failed': hostText('health.saveFailed'),
  'backup-failed': hostText('health.backupFailed'),
  'apply-failed': hostText('health.applyFailed'),
  'launch-save-failed': hostText('health.launchSaveFailed'),
};
const applyMessages: Record<string, string> = {
  'apply-hotkeys': hostText('health.hotkeysFailed'),
  'apply-window': hostText('health.windowFailed'),
  'apply-applets': hostText('health.appletsFailed'),
  'apply-services': hostText('health.servicesFailed'),
};

export interface SettingsIssue {
  key: string;
  kind: SettingsIssueKind;
  message: string;
  since: number;
  immediate: boolean;
}

/** Operational state only. Never retains settings values or unfinished UI input. */
export class SettingsHealth {
  private issues = new Map<string, SettingsIssue>();
  private generations = new Map<string, number>();
  constructor(
    private changed: () => void,
    private now = Date.now,
  ) {}
  all() {
    return [...this.issues.values()].map((issue) => ({ ...issue }));
  }
  has(key: string) {
    return this.issues.has(key);
  }
  set(key: string, kind: SettingsIssueKind, generation = 0, immediate = true, message?: string) {
    if (generation < (this.generations.get(key) ?? 0)) return;
    this.generations.set(key, generation);
    const previous = this.issues.get(key);
    if (
      previous?.kind === kind &&
      previous.message ===
        (message ||
          (kind === 'apply-failed' && applyMessages[key]) ||
          settingsIssueMessages[kind]) &&
      (previous.immediate || !immediate)
    )
      return;
    this.issues.set(key, {
      key,
      kind,
      message:
        message || (kind === 'apply-failed' && applyMessages[key]) || settingsIssueMessages[kind],
      since: previous?.since ?? this.now(),
      immediate,
    });
    this.changed();
  }
  clear(key: string, generation = 0) {
    if (generation < (this.generations.get(key) ?? 0)) return;
    this.generations.set(key, generation);
    if (this.issues.delete(key)) this.changed();
  }
}

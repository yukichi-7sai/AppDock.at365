import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type { SettingsIssue } from './settings-health';
import type { ErrorReporter, ErrorEpisode } from './error-reporter';
import type { NotificationInput } from './notification-service';
import type { TypedNotifications } from './typed-notifications';

export const settingsRestartReason = hostText('health.restartReason');

/** Notification episodes are separate from health: hiding a notice never clears a failure. */
export class SettingsHealthNotifications {
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private error?: { id: string; episode: ErrorEpisode };
  private restart?: { attempted: boolean; id?: string; key: string; publication?: string };
  constructor(
    private options: {
      notifications: TypedNotifications;
      errors: ErrorReporter;
      issues(): SettingsIssue[];
      restartRequired(): boolean;
      actions(error: boolean): NotificationInput['actions'];
      now?(): number;
      failed?(): void;
    },
  ) {}
  refresh() {
    if (this.closed) return;
    try {
      this.refreshNotifications();
    } catch {
      try {
        this.options.failed?.();
      } catch {
        /* Never fail a settings operation from reporting. */
      }
    }
  }
  private refreshNotifications() {
    clearTimeout(this.timer);
    const now = (this.options.now ?? Date.now)();
    const all = this.options.issues();
    const pending = all.filter((i) => !i.immediate && now - i.since < 2000);
    if (pending.length)
      this.timer = setTimeout(
        () => this.refresh(),
        Math.max(1, Math.min(...pending.map((i) => i.since + 2000 - now))),
      );
    const issues = all.filter((i) => !pending.includes(i));
    if (issues.length) {
      this.error ??= { id: randomUUID(), episode: this.options.errors.episode() };
      this.error.episode.update(
        {
          eventId: this.error.id,
          source: 'settings',
          title: hostText('health.errorTitle'),
          code: [...new Set(issues.map((i) => i.kind))].sort().join(', '),
          message: [...new Set(issues.map((i) => i.message))].join('\n'),
        },
        this.options.actions(true),
      );
    } else if (!all.length) {
      this.error?.episode.resolve();
      this.error = undefined;
    }
    const owner = { ownerKind: 'host', ownerId: 'settings' } as const;
    if (!this.options.restartRequired()) {
      if (this.restart?.id && this.options.notifications.isActive(owner, this.restart.id))
        this.options.notifications.end(owner, this.restart.id);
      this.restart = undefined;
      return;
    }
    this.restart ??= { attempted: false, key: randomUUID() };
    if (
      this.restart.attempted &&
      (!this.restart.id || !this.options.notifications.isActive(owner, this.restart.id))
    )
      return;
    this.restart.attempted = true;
    const actions = this.options.actions(false);
    const publication = JSON.stringify(
      actions?.map(({ key, label, primary, disabled }) => [key, label, primary, disabled]),
    );
    if (this.restart.publication === publication) return;
    this.restart.publication = publication;
    const title = hostText('health.restartTitle'),
      body = settingsRestartReason;
    const result = this.options.notifications.publish(owner, 'restart-required', {
      title,
      body,
      level: 'warning',
      historyText: { title, body },
      dedupeKey: this.restart.key,
      actions,
    });
    if (result.status === 'accepted') this.restart.id = result.notificationId;
  }
  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
  }
}

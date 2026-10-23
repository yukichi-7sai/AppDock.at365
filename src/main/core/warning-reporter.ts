import { hostText } from '../../shared/i18n';
import { createHash } from 'node:crypto';
import type { TypedNotifications } from './typed-notifications';
import type { NotificationInput } from './notification-service';

/** Callers supply only safe explanations and local diagnostic paths, never file contents. */
export interface ReportableWarning {
  eventId: string;
  source: string;
  title: string;
  code: string;
  message: string;
  logDetails?: string[];
}
export interface WarningEpisode {
  update(warning: ReportableWarning, actions?: NotificationInput['actions']): void;
  resolve(): void;
}

/** A continuing condition logs changes without resurrecting a dismissed or disabled notice. */
export class WarningReporter {
  constructor(
    private options: {
      notifications(): TypedNotifications | undefined;
      log(source: string, message: string): void;
    },
  ) {}
  episode(): WarningEpisode {
    const owner = { ownerKind: 'host', ownerId: 'warnings' } as const;
    let attempted = false,
      resolved = false,
      failed = false,
      id: string | undefined,
      fingerprint = '',
      publication = '';
    const write = (source: string, message: string) => {
      try {
        this.options.log(source, message);
      } catch {
        /* Diagnostics must not change the operation result. */
      }
    };
    return {
      update: (warning, actions) => {
        if (resolved) return;
        const title = warning.title.slice(0, 200);
        const body = hostText('services.warningReporter.bodyWithCode', {
          message: String(warning.message),
          code: String(warning.code),
        }).slice(0, 2000);
        const next = JSON.stringify([title, body, warning.logDetails]);
        if (next !== fingerprint) {
          fingerprint = next;
          const prefix = `[WARNING] eventId=${warning.eventId}`;
          write(warning.source, `${prefix} ${title}\n${body}`);
          for (const detail of warning.logDetails ?? [])
            write(warning.source, `${prefix} ${detail}`);
        }
        if (failed) return;
        try {
          const notifications = this.options.notifications();
          if (!notifications || (attempted && (!id || !notifications.isActive(owner, id)))) return;
          const nextPublication = JSON.stringify([
            title,
            body,
            actions?.map(({ key, label, primary, disabled }) => [key, label, primary, disabled]),
          ]);
          if (publication === nextPublication) return;
          publication = nextPublication;
          attempted = true;
          const result = notifications.publish(owner, 'attention-required', {
            title,
            body,
            level: 'warning',
            historyText: { title, body },
            actions,
            dedupeKey: createHash('sha256')
              .update(JSON.stringify([warning.source, warning.eventId]))
              .digest('hex'),
          });
          if (result.status === 'accepted') id = result.notificationId;
        } catch {
          failed = true;
          write(warning.source, hostText('services.warningReporter.notificationFailed'));
        }
      },
      resolve: () => {
        if (resolved) return;
        resolved = true;
        try {
          const notifications = this.options.notifications();
          if (id && notifications?.isActive(owner, id)) notifications.end(owner, id);
        } catch {
          /* The notice may already have ended. */
        }
      },
    };
  }
}

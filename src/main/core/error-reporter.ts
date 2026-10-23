import { hostText } from '../../shared/i18n';
import { createHash } from 'node:crypto';
import type { TypedNotifications } from './typed-notifications';
import type { NotificationInput } from './notification-service';

export interface ErrorEpisode {
  update(error: ReportableError, actions?: NotificationInput['actions']): void;
  resolve(): void;
}

/** Only explicitly sanitized, user-facing messages belong in this shared reporting path. */
export interface ReportableError {
  eventId: string;
  source: string;
  title: string;
  code: string;
  message: string;
}

/** One log and one configurable notification per failure; reporting never changes its outcome. */
export class ErrorReporter {
  private seen = new Set<string>();
  constructor(
    private options: {
      notifications(): TypedNotifications | undefined;
      log(source: string, message: string): void;
    },
  ) {}

  /** Updates one failure episode without resurrecting an expired, dismissed or disabled notice. */
  episode(): ErrorEpisode {
    const owner = { ownerKind: 'host', ownerId: 'errors' } as const;
    let attempted = false,
      resolved = false,
      id: string | undefined,
      fingerprint = '',
      publication = '';
    return {
      update: (error, actions) => {
        if (resolved) return;
        const title = error.title.slice(0, 200);
        const body = hostText('services.errorReporter.bodyWithCode', {
          message: String(error.message),
          code: String(error.code),
        }).slice(0, 2000);
        const next = JSON.stringify([title, body]);
        if (next !== fingerprint) {
          fingerprint = next;
          try {
            this.options.log(error.source, `[ERROR] eventId=${error.eventId} ${title}\n${body}`);
          } catch {
            /* Reporting must not change the operation result. */
          }
        }
        try {
          const notifications = this.options.notifications();
          if (!notifications || (attempted && (!id || !notifications.isActive(owner, id)))) return;
          const nextPublication = JSON.stringify([
            next,
            actions?.map(({ key, label, primary, disabled }) => [key, label, primary, disabled]),
          ]);
          if (publication === nextPublication) return;
          publication = nextPublication;
          attempted = true;
          const result = notifications.publish(owner, 'operation-failed', {
            title,
            body,
            level: 'error',
            historyText: { title, body },
            actions,
            dedupeKey: createHash('sha256')
              .update(JSON.stringify([error.source, error.eventId]))
              .digest('hex'),
          });
          if (result.status === 'accepted') id = result.notificationId;
        } catch {
          /* A broken notification sink cannot recursively report itself. */
        }
      },
      resolve: () => {
        if (resolved) return;
        resolved = true;
        try {
          const notifications = this.options.notifications();
          if (id && notifications?.isActive(owner, id)) notifications.end(owner, id);
        } catch {
          /* The notification may already have ended. */
        }
      },
    };
  }

  report(error: ReportableError): void {
    const key = JSON.stringify([error.source, error.eventId]);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    const title = error.title.slice(0, 200),
      body = hostText('services.errorReporter.bodyWithCode', {
        message: String(error.message),
        code: String(error.code),
      }).slice(0, 2000);
    const write = (message: string) => {
      try {
        this.options.log(error.source, message);
      } catch {
        // Do not recursively report a broken logging sink.
      }
    };
    write(`[ERROR] eventId=${error.eventId} ${title}\n${body}`);
    try {
      this.options
        .notifications()
        ?.publish({ ownerKind: 'host', ownerId: 'errors' }, 'operation-failed', {
          level: 'error',
          title,
          body,
          historyText: { title, body },
          dedupeKey: createHash('sha256').update(key).digest('hex'),
        });
    } catch {
      write(hostText('services.errorReporter.notificationFailed'));
    }
  }
}

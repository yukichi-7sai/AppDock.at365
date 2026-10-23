import { hostText } from '../../shared/i18n';
import { createHash, randomUUID } from 'node:crypto';
import type { TypedNotifications } from './typed-notifications';
import type { NotificationInput } from './notification-service';

/** Host-only entry point. Callers supply safe, user-facing text, never raw exceptions or input. */
export class InformationReporter {
  private seen = new Set<string>();
  constructor(
    private options: {
      notifications(): TypedNotifications | undefined;
      log(source: string, message: string): void;
    },
  ) {}

  report(
    source: string,
    title: string,
    message: string,
    eventId: string = randomUUID(),
    actions?: NotificationInput['actions'],
  ): void {
    const key = JSON.stringify([source, eventId]);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    title = title.slice(0, 200);
    const body = message.slice(0, 2000);
    const log = (text: string) => {
      try {
        this.options.log(source, text);
      } catch {
        /* Preserve the operation result. */
      }
    };
    log(`[INFO] eventId=${eventId} ${title}\n${body}`);
    try {
      this.options
        .notifications()
        ?.publish({ ownerKind: 'host', ownerId: 'information' }, 'operation-completed', {
          level: 'info',
          title,
          body,
          historyText: { title, body },
          actions,
          dedupeKey: createHash('sha256').update(key).digest('hex'),
        });
    } catch {
      log(hostText('services.informationReporter.notificationFailed'));
    }
  }
}

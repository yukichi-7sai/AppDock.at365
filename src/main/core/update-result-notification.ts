import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { TypedNotifications } from './typed-notifications';
/** A PC-local receipt prevents replaying the same updater result after another ordinary restart. */
export function publishUpdateResult(
  bytes: string,
  options: {
    typed: TypedNotifications;
    receiptFile: string;
    openDetails(): Promise<void>;
    warn(message: string): void;
  },
) {
  const result = JSON.parse(bytes);
  if (result?.ok !== true) return false;
  const hash = createHash('sha256').update(bytes).digest('hex');
  let writable = true;
  if (fs.existsSync(options.receiptFile)) {
    try {
      const previous = JSON.parse(fs.readFileSync(options.receiptFile, 'utf8'));
      if (previous.schemaVersion === 1 && previous.lastHash === hash) return true;
      if (previous.schemaVersion !== 1) {
        writable = false;
        options.warn(hostText('services.updateResultNotification.unsupportedRecord'));
      }
    } catch {
      options.warn(hostText('services.updateResultNotification.readFailed'));
    }
  }
  options.typed.publish({ ownerKind: 'host', ownerId: 'updates' }, 'applied', {
    level: 'info',
    title: hostText('services.updateResultNotification.title'),
    body: hostText('services.updateResultNotification.completed'),
    dedupeKey: hash,
    historyText: {
      title: hostText('services.updateResultNotification.title'),
      body: hostText('services.updateResultNotification.historyCompleted'),
    },
    actions: [
      {
        key: 'details',
        label: hostText('services.updateResultNotification.openUpdates'),
        run: options.openDetails,
      },
    ],
  });
  // Suppressed results are consumed too, so switching preferences back on does not replay old updates.
  if (!writable) return true;
  let temp = '';
  try {
    fs.mkdirSync(path.dirname(options.receiptFile), { recursive: true });
    temp = options.receiptFile + '.tmp-' + randomUUID();
    fs.writeFileSync(temp, JSON.stringify({ schemaVersion: 1, lastHash: hash }), 'utf8');
    fs.renameSync(temp, options.receiptFile);
  } catch {
    options.warn(hostText('services.updateResultNotification.saveFailed'));
  } finally {
    if (temp && fs.existsSync(temp))
      try {
        fs.unlinkSync(temp);
      } catch {}
  }
  return true;
}

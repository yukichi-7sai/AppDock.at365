import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NotificationHistoryEntry } from '../../shared/notifications';

const limit = 5 * 1024 * 1024;
const statuses = ['active', 'resolved', 'dismissed', 'expired', 'withdrawn', 'interrupted'];
function valid(entry: NotificationHistoryEntry) {
  return (
    entry &&
    typeof entry.id === 'string' &&
    entry.id.length <= 100 &&
    typeof entry.source === 'string' &&
    entry.source.length <= 200 &&
    ['info', 'warning', 'error'].includes(entry.level) &&
    statuses.includes(entry.status) &&
    typeof entry.title === 'string' &&
    entry.title.length <= 200 &&
    typeof entry.body === 'string' &&
    entry.body.length <= 2000 &&
    [entry.createdAt, entry.updatedAt].every(Number.isFinite) &&
    (entry.endedAt === undefined || Number.isFinite(entry.endedAt)) &&
    typeof entry.read === 'boolean' &&
    (entry.ownerKind === undefined || ['host', 'applet'].includes(entry.ownerKind)) &&
    [entry.ownerId, entry.typeId, entry.endReason].every(
      (v) => v === undefined || (typeof v === 'string' && v.length <= 101),
    ) &&
    Array.isArray(entry.targets) &&
    entry.targets.every((t) => ['banner', 'desktop', 'windows'].includes(t)) &&
    entry.delivery &&
    typeof entry.delivery === 'object'
  );
}
/** PC-local display history, never executable state. */
export class NotificationHistoryStore {
  private records = new Map<string, NotificationHistoryEntry>();
  private timer?: ReturnType<typeof setTimeout>;
  private writable = true;
  private reported = false;
  constructor(
    readonly file: string,
    private failed: (message: string) => void,
    private now = Date.now,
  ) {
    if (!fs.existsSync(file)) return;
    try {
      if (fs.statSync(file).size > limit) throw Error('History too large');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || data.schemaVersion !== 1) {
        this.writable = false;
        this.report(hostText('services.notificationHistory.unsupportedRead'));
        return;
      }
      if (!Array.isArray(data.entries) || data.entries.length > 1200 || !data.entries.every(valid))
        throw Error('Invalid history');
      for (const raw of data.entries as NotificationHistoryEntry[]) {
        // Explicit projection strips unexpected fields, including any serialized operation.
        const e: NotificationHistoryEntry = {
          id: raw.id,
          revision: 1,
          source: raw.source,
          ...(raw.ownerKind && raw.ownerId && raw.typeId
            ? { ownerKind: raw.ownerKind, ownerId: raw.ownerId, typeId: raw.typeId }
            : {}),
          ...(typeof raw.endReason === 'string' && raw.endReason.length <= 100
            ? { endReason: raw.endReason }
            : {}),
          level: raw.level,
          title: raw.title,
          body: raw.body,
          status: raw.status === 'active' ? 'interrupted' : raw.status,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          endedAt: raw.status === 'active' ? now() : raw.endedAt,
          read: raw.read,
          targets: raw.targets,
          delivery: Object.fromEntries(raw.targets.map((t) => [t, 'ended'])),
        };
        this.records.set(e.id, e);
      }
      this.prune();
      this.schedule();
    } catch {
      try {
        fs.renameSync(file, file + '.corrupt-' + randomUUID());
      } catch {
        this.writable = false;
      }
      this.report(hostText('services.notificationHistory.readFailed'));
    }
  }
  private report(message: string) {
    if (!this.reported) {
      this.reported = true;
      this.failed(message);
    }
  }
  get status() {
    return { writable: this.writable, saveError: this.reported };
  }
  private edit(ids: string[], deleting: boolean) {
    if (!this.writable) throw Error(hostText('services.notificationHistory.unsupportedWrite'));
    const prior = new Map([...this.records].map(([id, e]) => [id, structuredClone(e)]));
    for (const id of ids) {
      const entry = this.records.get(id);
      if (!entry) continue;
      if (deleting) {
        if (entry.status !== 'active') this.records.delete(id);
      } else entry.read = true;
    }
    if (!this.flush()) {
      this.records = prior;
      throw Error(hostText('services.notificationHistory.changeFailed'));
    }
  }
  markRead(ids: string[]) {
    this.edit(ids, false);
  }
  deleteEnded(ids: string[]) {
    this.edit(ids, true);
  }
  list() {
    this.prune();
    return structuredClone([...this.records.values()]);
  }
  put(entry: NotificationHistoryEntry) {
    this.records.set(entry.id, structuredClone(entry));
    this.prune();
    this.schedule();
  }
  private prune() {
    const ended = [...this.records.values()]
      .filter((e) => e.status !== 'active')
      .sort((a, b) => (a.endedAt ?? a.updatedAt) - (b.endedAt ?? b.updatedAt));
    let remaining = ended.length;
    for (const e of ended) {
      if (remaining > 1000 || (e.endedAt ?? e.updatedAt) < this.now() - 30 * 86400000) {
        this.records.delete(e.id);
        remaining--;
      }
    }
    while (
      Buffer.byteLength(JSON.stringify([...this.records.values()])) > limit - 100 &&
      ended.length
    ) {
      const e = ended.shift()!;
      if (e.status !== 'active') this.records.delete(e.id);
    }
  }
  private schedule() {
    if (!this.writable || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 150);
    this.timer.unref();
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.writable) return false;
    let success = false;
    let temp = '';
    try {
      this.prune();
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      temp = this.file + '.tmp-' + randomUUID();
      fs.writeFileSync(temp, JSON.stringify({ schemaVersion: 1, entries: this.list() }), 'utf8');
      fs.renameSync(temp, this.file);
      this.reported = false;
      success = true;
    } catch {
      this.report(hostText('services.notificationHistory.saveFailed'));
    } finally {
      if (temp && fs.existsSync(temp))
        try {
          fs.unlinkSync(temp);
        } catch {}
    }
    return success;
  }
}

import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import {
  notificationCatalog,
  notificationTypeKey,
  notificationSpeechEnabled,
  resolveNotificationSpeech,
} from '../../shared/notification-types';
import type { NotificationPublication } from './typed-notifications';
import type { NotificationService } from './notification-service';
import type { NotificationAvailability } from './notification-availability';
import type { TtsService } from './tts-service';
export const notificationSpeechStartMs = 60000;
type Record = Omit<NotificationPublication, 'title' | 'body'> & {
  input?: import('../../shared/tts').TtsSpeakInput;
  jobId?: string;
  done: boolean;
  ended: boolean;
  timer?: ReturnType<typeof setTimeout>;
  waitingSound?: boolean;
};
export class NotificationSpeechService {
  private records = new Map<string, Record>();
  private closed = false;
  private signature: string;
  private stops: (() => void)[];
  constructor(
    private options: {
      settings(): Settings;
      applets(): ExtensionSnapshot[];
      generation(id: string): string | undefined;
      ready(): boolean;
      service: NotificationService;
      tts: TtsService;
      availability: NotificationAvailability;
      failed(id: string, code: string): void;
      startMs?: number;
    },
  ) {
    this.signature = JSON.stringify(options.settings().tts);
    this.stops = [
      options.service.subscribeEnded((id, status) => {
        const r = this.records.get(id);
        if (!r) return;
        r.ended = true;
        if (status !== 'expired') this.cancel(r);
        if (r.done) this.records.delete(id);
      }),
      options.availability.subscribe(() => this.reconcile()),
      options.tts.subscribe((owner, job) => {
        const r = this.records.get(owner.slice('notification:'.length));
        if (!owner.startsWith('notification:') || !r || r.jobId !== job.jobId) return;
        if (job.state === 'playing') clearTimeout(r.timer);
        if (['completed', 'failed', 'canceled'].includes(job.state)) {
          r.done = true;
          clearTimeout(r.timer);
          if (job.state === 'failed')
            options.failed(r.notificationId, job.error?.code ?? 'TTS_PLAYBACK_FAILED');
          if (r.ended) this.records.delete(r.notificationId);
          this.updateUse();
        }
      }),
    ];
  }
  allows(owner: string) {
    if (!owner.startsWith('notification:')) return false;
    const r = this.records.get(owner.slice('notification:'.length));
    return !!r && !r.done && this.valid(r) && this.options.ready();
  }
  private valid(r: Record) {
    if (this.closed) return false;
    const type = notificationCatalog(this.options.applets()).find(
      (t) => notificationTypeKey(t) === notificationTypeKey({ ...r.owner, typeId: r.typeId }),
    );
    return (
      !!type &&
      notificationSpeechEnabled(type, this.options.settings()) &&
      (r.owner.ownerKind !== 'applet' ||
        (!!r.generation && this.options.generation(r.owner.ownerId) === r.generation))
    );
  }
  private updateUse() {
    this.options.availability.use(
      'speech',
      [...this.records.values()].some((r) => !r.done),
    );
  }
  publish(event: NotificationPublication, soundQueued?: Promise<void>) {
    if (this.closed || this.records.has(event.notificationId)) return;
    const { title, body, ...identity } = event;
    const r: Record = { ...identity, done: false, ended: false };
    this.records.set(r.notificationId, r);
    if (!this.valid(r)) {
      r.done = true;
      return;
    }
    const text = [title, body]
      .map((s) => s.replace(/\s+/gu, ' ').trim())
      .filter(Boolean)
      .join('。');
    if (!text) {
      r.done = true;
      return;
    }
    if ([...this.records.values()].filter((v) => !v.done).length > 16) {
      r.done = true;
      this.options.failed(r.notificationId, 'TTS_QUEUE_FULL');
      return;
    }
    r.input = {
      text,
      ...resolveNotificationSpeech(this.options.settings()),
      requestId: 'notification:' + r.notificationId,
    };
    r.timer = setTimeout(() => this.cancel(r), Math.max(0, this.deadline(r) - Date.now()));
    if (soundQueued) {
      r.waitingSound = true;
      // Capture speech settings and its deadline now, but enqueue the chime first.
      void soundQueued
        .catch(() => {})
        .then(() => {
          r.waitingSound = false;
          this.reconcile();
        });
    }
    this.updateUse();
    this.options.availability.prepareDelivery();
    this.reconcile();
  }
  private deadline(r: Record) {
    return r.createdAt + (this.options.startMs ?? notificationSpeechStartMs);
  }
  private cancel(r: Record) {
    if (r.done) return;
    r.done = true;
    r.input = undefined;
    clearTimeout(r.timer);
    if (r.jobId)
      void this.options.tts.stop('notification:' + r.notificationId, r.jobId).catch(() => {});
    if (r.ended) this.records.delete(r.notificationId);
    this.updateUse();
  }
  reconcile(keyChanged = false) {
    const signature = JSON.stringify(this.options.settings().tts);
    const changed = keyChanged || signature !== this.signature;
    this.signature = signature;
    const status = this.options.availability.status();
    for (const r of [...this.records.values()]) {
      if (r.done) continue;
      if (
        changed &&
        (!r.jobId ||
          this.options.tts.get('notification:' + r.notificationId, r.jobId).state !== 'playing')
      ) {
        this.cancel(r);
        continue;
      }
      if (!this.valid(r) || status === 'blocked' || status === 'failed') {
        this.cancel(r);
        continue;
      }
      if (r.jobId) {
        const job = this.options.tts.get('notification:' + r.notificationId, r.jobId);
        if (job.state === 'playing') clearTimeout(r.timer);
        continue;
      }
      if (Date.now() >= this.deadline(r)) {
        this.cancel(r);
        continue;
      }
      if (!this.options.ready() || status !== 'allowed' || !r.input || r.waitingSound) continue;
      try {
        const job = this.options.tts.speak('notification:' + r.notificationId, r.input, {
          startBefore: this.deadline(r),
          canStart: () => {
            // Only previously authorized jobs reach this guard. Another notice's
            // fresh query must not revoke them before suppression is confirmed.
            const current = this.options.availability.status();
            return this.valid(r) && (current === 'allowed' || current === 'unknown');
          },
        });
        r.jobId = job.jobId as string;
        r.input = undefined;
      } catch (error) {
        this.options.failed(
          r.notificationId,
          typeof (error as any)?.code === 'string' ? (error as any).code : 'TTS_PLAYBACK_FAILED',
        );
        this.cancel(r);
      }
    }
  }
  stopAll() {
    for (const r of [...this.records.values()]) this.cancel(r);
  }
  dispose() {
    this.closed = true;
    for (const stop of this.stops) stop();
    for (const r of [...this.records.values()]) this.cancel(r);
    this.records.clear();
    this.options.availability.use('speech', false);
  }
}

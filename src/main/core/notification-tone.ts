import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import {
  notificationCatalog,
  notificationTypeKey,
  notificationSoundEnabled,
} from '../../shared/notification-types';
import type { NotificationPublication } from './typed-notifications';
import type { NotificationService } from './notification-service';
import type { NotificationAvailability } from './notification-availability';
import type { AudioPlaybackRequest } from './audio-playback';

type Tone = NotificationPublication & {
  file: string;
  controller: AbortController;
  loading: boolean;
  started: boolean;
  done: boolean;
  ended: boolean;
  deferred: boolean;
  queued: Promise<void>;
  release(): void;
  timer?: ReturnType<typeof setTimeout>;
};

/** Notification admission/lifetime only; prepared audio goes to the single host FIFO. */
export class NotificationToneService {
  private records = new Map<string, Tone>();
  private closed = false;
  private stops: (() => void)[];
  constructor(
    private options: {
      settings(): Settings;
      applets(): ExtensionSnapshot[];
      generation(id: string): string | undefined;
      ready(): boolean;
      service: NotificationService;
      availability: NotificationAvailability;
      read(file: string): Promise<Buffer>;
      play(request: AudioPlaybackRequest): Promise<void>;
      failed(id: string, code: string): void;
      startMs?: number;
    },
  ) {
    this.stops = [
      options.service.subscribeEnded((id, status) => {
        const tone = this.records.get(id);
        if (!tone) return;
        tone.ended = true;
        if (status !== 'expired') this.cancel(tone);
        if (tone.done) this.records.delete(id);
      }),
      options.availability.subscribe(() => this.reconcile()),
    ];
  }
  private valid(tone: Tone) {
    const settings = this.options.settings();
    const type = notificationCatalog(this.options.applets()).find(
      (type) =>
        notificationTypeKey(type) === notificationTypeKey({ ...tone.owner, typeId: tone.typeId }),
    );
    return (
      !this.closed &&
      settings.host.soundEnabled &&
      !!type &&
      notificationSoundEnabled(type, settings) &&
      (tone.owner.ownerKind !== 'applet' ||
        (!!tone.generation && this.options.generation(tone.owner.ownerId) === tone.generation))
    );
  }
  private updateUse() {
    this.options.availability.use(
      'notification-sound',
      [...this.records.values()].some((r) => !r.done && !r.deferred),
    );
  }
  publish(event: NotificationPublication): Promise<void> {
    const previous = this.records.get(event.notificationId);
    if (previous) {
      if (previous.deferred && !previous.done && !this.options.service.isPaused()) {
        previous.deferred = false;
        previous.createdAt = event.createdAt;
        this.admit(previous);
      }
      return previous.queued;
    }
    if (this.closed) return Promise.resolve();
    let release!: () => void;
    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tone: Tone = {
      ...event,
      file: this.options.settings().notificationPreferences?.sound?.file ?? '',
      controller: new AbortController(),
      loading: false,
      started: false,
      done: false,
      ended: false,
      deferred: this.options.service.isPaused(),
      queued,
      release,
    };
    this.records.set(event.notificationId, tone);
    if (!this.valid(tone)) {
      this.finish(tone);
      return queued;
    }
    if (!tone.deferred) this.admit(tone);
    return queued;
  }
  private admit(tone: Tone) {
    tone.timer = setTimeout(
      () => this.cancel(tone),
      Math.max(0, tone.createdAt + (this.options.startMs ?? 60000) - Date.now()),
    );
    this.updateUse();
    this.options.availability.prepareDelivery();
    this.reconcile();
  }
  private finish(tone: Tone) {
    tone.done = true;
    clearTimeout(tone.timer);
    tone.release();
    if (tone.ended) this.records.delete(tone.notificationId);
    this.updateUse();
  }
  private cancel(tone: Tone) {
    if (tone.done) return;
    tone.controller.abort();
    this.finish(tone);
  }
  reconcile() {
    const status = this.options.availability.status();
    for (const tone of this.records.values()) {
      if (tone.done) continue;
      if (!this.valid(tone) || (!tone.deferred && (status === 'blocked' || status === 'failed'))) {
        this.cancel(tone);
        continue;
      }
      if (tone.deferred) continue;
      if (!tone.started && Date.now() >= tone.createdAt + (this.options.startMs ?? 60000)) {
        this.cancel(tone);
        continue;
      }
      if (!tone.loading && this.options.ready() && status === 'allowed') {
        tone.loading = true;
        void this.start(tone);
      }
    }
  }
  private async start(tone: Tone) {
    const live = () =>
      !tone.done &&
      !tone.controller.signal.aborted &&
      this.valid(tone) &&
      this.options.ready() &&
      ['allowed', 'unknown'].includes(this.options.availability.status());
    try {
      const bytes = await this.options.read(tone.file);
      if (!live()) return;
      const playback = this.options.play({
        bytes,
        signal: tone.controller.signal,
        playbackTimeoutMs: 30000,
        beforePlay: () => {
          if (!live()) tone.controller.abort();
          else {
            tone.started = true;
            clearTimeout(tone.timer);
          }
        },
      });
      // Speech may generate now. Its prepared bytes will follow this entry in the FIFO.
      tone.release();
      await playback;
    } catch {
      if (live()) this.options.failed(tone.notificationId, 'NOTIFICATION_SOUND_FAILED');
    } finally {
      this.finish(tone);
    }
  }
  stopAll() {
    for (const tone of this.records.values()) this.cancel(tone);
  }
  dispose() {
    this.closed = true;
    for (const stop of this.stops) stop();
    this.stopAll();
    this.records.clear();
    this.options.availability.use('notification-sound', false);
  }
}

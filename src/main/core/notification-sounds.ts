import { hostText } from '../../shared/i18n';
/** Deferred Applet notification sounds; the host audio FIFO still owns playback. */
export class NotificationSounds {
  private paused = false;
  private closed = false;
  private enabled = true;
  private pending: { file: string; alive(): boolean; failed(): void }[] = [];
  private active?: { controller: AbortController; started: boolean; discarded: boolean };
  constructor(
    private options: {
      read(file: string): Promise<Buffer>;
      play(bytes: Buffer, signal: AbortSignal, beforePlay: () => void): Promise<void>;
    },
  ) {}
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.pending = [];
      if (this.active) {
        this.active.discarded = true;
        this.active.controller.abort();
      }
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.active?.controller.abort();
    else this.pump();
  }
  enqueue(file: string, alive: () => boolean, failed: () => void) {
    if (this.closed || !this.enabled || !alive()) return;
    this.pending = this.pending.filter((job) => job.alive());
    if (this.pending.length + (this.active ? 1 : 0) >= 32)
      throw Error(hostText('services.notificationSounds.queueLimit'));
    this.pending.push({ file, alive, failed });
    this.pump();
  }
  private pump() {
    if (this.paused || this.closed || !this.enabled || this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    if (!job.alive()) {
      this.pump();
      return;
    }
    const active = { controller: new AbortController(), started: false, discarded: false };
    this.active = active;
    const watch = setInterval(() => {
      if (!job.alive()) active.controller.abort();
    }, 100);
    void (async () => {
      try {
        const bytes = await this.options.read(job.file);
        if (job.alive() && !active.controller.signal.aborted)
          await this.options.play(bytes, active.controller.signal, () => {
            if (!job.alive() || this.paused) active.controller.abort();
            else active.started = true;
          });
      } catch {
        if (job.alive() && !active.controller.signal.aborted) job.failed();
      } finally {
        clearInterval(watch);
        if (
          !active.started &&
          !active.discarded &&
          active.controller.signal.aborted &&
          job.alive() &&
          !this.closed
        )
          this.pending.unshift(job);
        this.active = undefined;
        this.pump();
      }
    })();
  }
  dispose() {
    this.closed = true;
    this.pending = [];
    this.active?.controller.abort();
  }
}

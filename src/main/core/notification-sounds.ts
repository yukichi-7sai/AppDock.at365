import { hostText } from '../../shared/i18n';
type SoundJob = {
  file: string;
  alive(): boolean;
  failed(): void;
  release(): void;
};
/** Deferred Applet notification sounds; the host audio FIFO still owns playback. */
export class NotificationSounds {
  private paused = false;
  private closed = false;
  private enabled = true;
  private pending: SoundJob[] = [];
  private sources = new Map<AbortSignal, { jobs: Set<SoundJob>; abort(): void }>();
  private active?: {
    job: SoundJob;
    controller: AbortController;
    started: boolean;
    discarded: boolean;
  };
  constructor(
    private options: {
      read(file: string): Promise<Buffer>;
      play(bytes: Buffer, signal: AbortSignal, beforePlay: () => void): Promise<void>;
    },
  ) {}
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      for (const job of [...this.pending]) this.discard(job);
      if (this.active) this.discard(this.active.job);
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.active?.controller.abort();
    else this.pump();
  }
  enqueue(file: string, alive: () => boolean, failed: () => void, signal?: AbortSignal) {
    if (this.closed || !this.enabled || !alive() || signal?.aborted) return;
    for (const job of [...this.pending]) if (!job.alive()) this.discard(job);
    if (this.pending.length + (this.active ? 1 : 0) >= 32)
      throw Error(hostText('services.notificationSounds.queueLimit'));
    const job: SoundJob = { file, alive, failed, release: () => {} };
    job.release = this.watch(job, signal);
    this.pending.push(job);
    this.pump();
  }
  private watch(job: SoundJob, signal?: AbortSignal): () => void {
    if (!signal) return () => {};
    let source = this.sources.get(signal);
    if (!source) {
      const jobs = new Set<SoundJob>();
      const abort = () => {
        for (const queued of [...jobs]) this.discard(queued);
      };
      source = { jobs, abort };
      this.sources.set(signal, source);
      signal.addEventListener('abort', abort, { once: true });
    }
    const watched = source;
    watched.jobs.add(job);
    let watching = true;
    return () => {
      if (!watching) return;
      watching = false;
      watched.jobs.delete(job);
      if (!watched.jobs.size) {
        signal.removeEventListener('abort', watched.abort);
        this.sources.delete(signal);
      }
    };
  }
  private discard(job: SoundJob) {
    this.pending = this.pending.filter((queued) => queued !== job);
    if (this.active?.job === job) {
      this.active.discarded = true;
      this.active.controller.abort();
    }
    job.release();
  }
  private pump() {
    if (this.paused || this.closed || !this.enabled || this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    if (!job.alive()) {
      job.release();
      this.pump();
      return;
    }
    const active = { job, controller: new AbortController(), started: false, discarded: false };
    this.active = active;
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
        if (
          !active.started &&
          !active.discarded &&
          active.controller.signal.aborted &&
          job.alive() &&
          !this.closed
        )
          this.pending.unshift(job);
        else job.release();
        this.active = undefined;
        this.pump();
      }
    })();
  }
  dispose() {
    this.closed = true;
    for (const job of [...this.pending]) this.discard(job);
    if (this.active) this.discard(this.active.job);
  }
}

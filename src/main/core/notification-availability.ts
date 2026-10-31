/** Shared lazy OS eligibility query, independent of any notification Window. */
export class NotificationAvailability {
  private consumers = new Set<string>();
  private listeners = new Set<() => void>();
  private blocked = new Set<string>();
  private value: 'unknown' | 'allowed' | 'blocked' | 'failed' = 'unknown';
  private timer?: ReturnType<typeof setTimeout>;
  private paused = false;
  private querying = false;
  private epoch = 0;
  private disposed = false;
  constructor(private options: { query(): Promise<boolean>; close(): void; failed(): void }) {}
  status() {
    return this.paused || this.blocked.size ? 'blocked' : this.value;
  }
  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  private changed() {
    for (const callback of this.listeners) callback();
  }
  use(id: string, enabled: boolean) {
    if (this.disposed) return;
    const active = this.consumers.size > 0;
    if (enabled) this.consumers.add(id);
    else this.consumers.delete(id);
    if (!this.consumers.size && active) {
      this.stopQuery();
      if (this.value !== 'failed') this.value = 'unknown';
    } else if (this.consumers.size && !active) void this.check();
  }
  /** A cached permission must not authorize a new delivery after the OS changed state. */
  prepareDelivery() {
    if (!this.eligible() || this.querying || this.value === 'blocked' || this.value === 'failed')
      return;
    if (this.value !== 'unknown') {
      this.value = 'unknown';
      this.changed();
    }
    void this.check();
  }
  setPaused(paused: boolean) {
    if (this.disposed || this.paused === paused) return;
    const old = this.status();
    this.paused = paused;
    this.stopQuery();
    if (this.value !== 'failed') this.value = 'unknown';
    if (old !== this.status()) this.changed();
    if (!paused) void this.check();
  }
  setBlocked(reason: string, blocked: boolean) {
    if (this.disposed || this.blocked.has(reason) === blocked) return;
    const old = this.status();
    if (blocked) this.blocked.add(reason);
    else this.blocked.delete(reason);
    this.stopQuery();
    if (this.value !== 'failed') this.value = 'unknown';
    if (old !== this.status()) this.changed();
    if (!blocked) void this.check();
  }
  private eligible() {
    return !this.disposed && !this.paused && !this.blocked.size && this.consumers.size > 0;
  }
  private stopQuery() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.epoch++;
    this.querying = false;
    this.options.close();
  }
  private schedule() {
    if (!this.eligible() || this.querying || this.timer || this.value === 'failed') return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.check();
    }, 60000);
    this.timer.unref();
  }
  async check() {
    if (!this.eligible() || this.querying || this.value === 'failed') return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.querying = true;
    const epoch = this.epoch;
    try {
      const allowed = await this.options.query();
      if (epoch !== this.epoch || this.disposed) return;
      const value = allowed ? 'allowed' : 'blocked';
      if (value !== this.value) {
        this.value = value;
        this.changed();
      }
    } catch {
      if (epoch !== this.epoch || this.disposed) return;
      this.value = 'failed';
      this.options.failed();
      this.changed();
    } finally {
      if (epoch === this.epoch) {
        this.querying = false;
        this.schedule();
      }
    }
  }
  retry() {
    if (this.disposed) return;
    this.value = 'unknown';
    this.changed();
    void this.check();
  }
  dispose() {
    this.disposed = true;
    this.stopQuery();
    this.listeners.clear();
    this.consumers.clear();
  }
}

export interface AssistanceOptions {
  enabled: boolean;
  intervalSeconds: number;
}
export type AssistanceCheck = (context: { signal: AbortSignal }) => Promise<void>;
export interface AssistanceClock {
  /** Monotonic nanoseconds, independent of wall-clock adjustments. */
  now(): bigint;
  schedule(callback: () => void, delayMilliseconds: number): { cancel(): void };
}
export const defaultFileWatchAssistanceOptions: Readonly<AssistanceOptions> = Object.freeze({
  enabled: false,
  intervalSeconds: 300,
});
export const minimumFileWatchAssistanceIntervalSeconds = 2;
const nanosecondsPerSecond = 1_000_000_000n;
const nanosecondsPerMillisecond = 1_000_000n;
const maximumTimerDelayMilliseconds = 2_147_483_647n;
const nativeClock: AssistanceClock = {
  now: () => process.hrtime.bigint(),
  schedule(callback, delayMilliseconds) {
    const timer = setTimeout(callback, delayMilliseconds);
    timer.unref();
    return { cancel: () => clearTimeout(timer) };
  },
};
interface Registration {
  id: string;
  check: AssistanceCheck;
  controller: AbortController;
}
interface Wait {
  deadline: bigint;
  timer?: { cancel(): void };
}

/** Optional sequential checks; never owns filesystem watchers or reads. */
export class FileWatchAssistance {
  private options: AssistanceOptions = { ...defaultFileWatchAssistanceOptions };
  private registrations = new Map<string, Registration>();
  private started = false;
  private disposed = false;
  private round?: { cancelled: boolean };
  private wait?: Wait;
  private readonly clock: AssistanceClock;
  constructor(
    private dependencies: {
      failed(error: unknown): void | Promise<void>;
      clock?: AssistanceClock;
    },
  ) {
    this.clock = dependencies.clock ?? nativeClock;
  }
  configure(options: AssistanceOptions) {
    if (
      typeof options?.enabled !== 'boolean' ||
      typeof options.intervalSeconds !== 'number' ||
      !Number.isFinite(options.intervalSeconds) ||
      options.intervalSeconds < minimumFileWatchAssistanceIntervalSeconds
    )
      throw new TypeError('Invalid file watch assistance options.');
    if (
      this.disposed ||
      (options.enabled === this.options.enabled &&
        options.intervalSeconds === this.options.intervalSeconds)
    )
      return;
    const intervalChanged = options.intervalSeconds !== this.options.intervalSeconds;
    this.options = { enabled: options.enabled, intervalSeconds: options.intervalSeconds };
    if (!options.enabled) {
      this.cancelWait();
      if (this.round) this.round.cancelled = true;
      return;
    }
    if (intervalChanged) this.cancelWait();
    this.ensureWait();
  }
  start() {
    if (this.disposed || this.started) return;
    this.started = true;
    this.ensureWait();
  }
  register(id: string, check: AssistanceCheck): () => void {
    if (this.disposed) throw new Error('File watch assistance is disposed.');
    if (typeof id !== 'string' || !id.trim() || typeof check !== 'function')
      throw new TypeError('Invalid file watch assistance registration.');
    if (this.registrations.has(id))
      throw new Error('Duplicate file watch assistance registration.');
    const registration = { id, check, controller: new AbortController() };
    this.registrations.set(id, registration);
    this.ensureWait();
    return () => {
      if (this.registrations.get(id) !== registration) return;
      this.registrations.delete(id);
      if (!this.registrations.size) {
        this.cancelWait();
        if (this.round) this.round.cancelled = true;
      }
      registration.controller.abort();
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelWait();
    if (this.round) this.round.cancelled = true;
    const registrations = [...this.registrations.values()];
    this.registrations.clear();
    for (const registration of registrations) registration.controller.abort();
  }
  private eligible() {
    return this.started && !this.disposed && this.options.enabled && this.registrations.size > 0;
  }
  private cancelWait() {
    const wait = this.wait;
    this.wait = undefined;
    wait?.timer?.cancel();
  }
  private ensureWait() {
    if (!this.eligible() || this.round || this.wait) return;
    // Convert the integer and fractional parts separately: finite seconds may overflow
    // when multiplied by 1,000 before the native timer limit is applied.
    const seconds = this.options.intervalSeconds;
    const duration =
      BigInt(Math.trunc(seconds)) * nanosecondsPerSecond +
      BigInt(Math.ceil((seconds % 1) * Number(nanosecondsPerSecond)));
    const wait = { deadline: this.clock.now() + duration };
    this.wait = wait;
    this.scheduleWait(wait);
  }
  private scheduleWait(wait: Wait) {
    if (this.wait !== wait) return;
    const remaining = wait.deadline - this.clock.now();
    if (remaining <= 0n) {
      this.wait = undefined;
      void this.run();
      return;
    }
    const milliseconds = (remaining + nanosecondsPerMillisecond - 1n) / nanosecondsPerMillisecond;
    const delay = Number(
      milliseconds > maximumTimerDelayMilliseconds ? maximumTimerDelayMilliseconds : milliseconds,
    );
    wait.timer = this.clock.schedule(() => {
      if (this.wait !== wait) return;
      wait.timer = undefined;
      this.scheduleWait(wait);
    }, delay);
  }
  private async run() {
    if (!this.eligible() || this.round) return;
    const round = { cancelled: false };
    this.round = round;
    const registrations = [...this.registrations.values()];
    try {
      for (const registration of registrations) {
        if (round.cancelled || !this.eligible()) break;
        if (this.registrations.get(registration.id) !== registration) continue;
        try {
          await registration.check({ signal: registration.controller.signal });
        } catch (error) {
          if (this.disposed || registration.controller.signal.aborted) continue;
          try {
            await this.dependencies.failed(error);
          } catch {
            // A reporting failure must not terminate checks for other registrations.
          }
        }
      }
    } finally {
      this.round = undefined;
      this.ensureWait();
    }
  }
}

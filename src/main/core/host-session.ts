/** Shared lock/suspend state, snapshotted before input and Applet startup. */
export class HostSession {
  private locked = true;
  private suspended = false;
  private retry?: ReturnType<typeof setTimeout>;
  private stops: (() => void)[] = [];
  constructor(
    private options: {
      state(): string;
      on(
        event: 'lock-screen' | 'unlock-screen' | 'suspend' | 'resume',
        callback: () => void,
      ): () => void;
      changed(paused: boolean): void;
    },
  ) {
    for (const event of ['lock-screen', 'unlock-screen', 'suspend', 'resume'] as const)
      this.stops.push(
        options.on(event, () => {
          clearTimeout(this.retry);
          if (event === 'lock-screen') this.locked = true;
          if (event === 'unlock-screen') this.locked = false;
          if (event === 'suspend') this.suspended = true;
          if (event === 'resume') {
            this.suspended = false;
            this.snapshot();
            return;
          }
          this.update();
        }),
      );
    this.snapshot();
  }
  private snapshot() {
    let state = 'unknown';
    try {
      state = this.options.state();
    } catch {}
    this.locked = state !== 'active' && state !== 'idle';
    this.update();
    if (state === 'unknown') {
      this.retry = setTimeout(() => this.snapshot(), 1000);
      this.retry.unref();
    }
  }
  private update() {
    this.options.changed(this.locked || this.suspended);
  }
  dispose() {
    clearTimeout(this.retry);
    for (const stop of this.stops) stop();
  }
}

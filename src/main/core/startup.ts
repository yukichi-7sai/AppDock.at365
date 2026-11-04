/** Initial host content and the visible built-in surfaces have independent readiness signals. */
export class StartupUiBarrier {
  private rendered = false;
  private cancelled = false;
  private waiting?: Promise<boolean>;
  private resolve?: (ready: boolean) => void;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private surfacesReady: () => boolean) {}
  get ready() {
    return !this.cancelled && this.rendered && this.surfacesReady();
  }
  rendererReady() {
    this.rendered = true;
    this.check();
  }
  resetRenderer() {
    this.rendered = false;
  }
  check() {
    if (this.resolve && this.ready) this.finish(true);
  }
  wait(timeoutMs = 30000): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    if (this.waiting) return this.waiting;
    if (this.ready) return Promise.resolve(true);
    this.waiting = new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => this.finish(false), timeoutMs);
    });
    return this.waiting;
  }
  cancel() {
    this.cancelled = true;
    this.finish(false);
  }
  private finish(ready: boolean) {
    clearTimeout(this.timer);
    this.resolve?.(ready);
    this.resolve = undefined;
  }
}

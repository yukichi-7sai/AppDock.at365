import type { InputPauseKind, SwitchAction } from '../../shared/host-action-commands';

/** Temporary command state never changes saved settings or Windows touchpad connections. */
export class HostCommandSession {
  private input = { mouse: false, keyboard: false, touchpad: false, all: false };
  private deadline = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private changed: () => void,
    private now = Date.now,
  ) {}
  inputPaused(kind: InputPauseKind) {
    return this.input.all || this.input[kind];
  }
  inputSelected(kind: InputPauseKind) {
    return this.input[kind];
  }
  setInput(kind: InputPauseKind, action: SwitchAction) {
    const next = action === 'toggle' ? !this.input[kind] : action === 'on';
    if (next === this.input[kind]) return;
    this.input[kind] = next;
    this.changed();
  }
  get notificationsPaused() {
    return this.deadline > this.now();
  }
  get notificationsUntil() {
    return this.notificationsPaused ? this.deadline : null;
  }
  setNotifications(action: SwitchAction, durationMs = 30 * 60 * 1000) {
    const pause = action === 'toggle' ? !this.notificationsPaused : action === 'on';
    clearTimeout(this.timer);
    this.timer = undefined;
    this.deadline = pause ? this.now() + durationMs : 0;
    if (pause) {
      const expire = () => {
        const remaining = this.deadline - this.now();
        if (remaining > 0) {
          this.timer = setTimeout(expire, remaining);
          this.timer.unref();
          return;
        }
        this.deadline = 0;
        this.timer = undefined;
        this.changed();
      };
      this.timer = setTimeout(expire, durationMs);
      this.timer.unref();
    }
    this.changed();
  }
  dispose() {
    clearTimeout(this.timer);
  }
}

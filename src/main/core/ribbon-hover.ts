import type { RibbonDisplayMode } from '../../shared/ribbon';

/** Transient display state. Hover never writes the remembered manual mode. */
export class RibbonHover {
  private active = false;
  private expanded = false;
  private poll?: ReturnType<typeof setInterval>;
  private leave?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(
    private options: {
      enabled(): boolean;
      collapseDelayMs(): number;
      available(): boolean;
      containsCursor(): boolean;
      canExpand?(): boolean;
      manualMode(): RibbonDisplayMode;
      changed(): void;
    },
  ) {}
  get displayMode(): RibbonDisplayMode {
    return this.options.enabled()
      ? this.expanded
        ? 'expanded'
        : 'compact'
      : this.options.manualMode();
  }
  refresh() {
    const active = !this.disposed && this.options.enabled() && this.options.available();
    if (active === this.active) return;
    this.active = active;
    if (!active) this.reset();
    else if (this.options.containsCursor()) this.pointer(true);
  }
  pointer(inside: boolean) {
    this.refresh();
    if (!this.active) return;
    if (inside) {
      this.cancelLeave();
      // A group opened by keyboard keeps its anchor until that interaction ends.
      if (this.options.canExpand?.() !== false) this.setExpanded(true);
    } else if (this.expanded && this.leave === undefined) {
      // Capture the setting at departure; repeated leave/poll events never restart the wait.
      const delay = this.options.collapseDelayMs();
      if (delay === 0) {
        if (!this.options.containsCursor()) this.setExpanded(false);
      } else this.scheduleLeave(delay);
    }
  }
  private scheduleLeave(remaining: number) {
    // Node timers overflow above this value. Split long waits without limiting the setting.
    const delay = Math.min(remaining, 2 ** 31 - 1);
    this.leave = setTimeout(() => {
      this.leave = undefined;
      this.refresh();
      if (!this.active || this.options.containsCursor()) return;
      if (remaining > delay) this.scheduleLeave(remaining - delay);
      else this.setExpanded(false);
    }, delay);
    this.leave.unref?.();
  }
  reset() {
    this.cancelLeave();
    this.setExpanded(false);
  }
  private cancelLeave() {
    if (this.leave) clearTimeout(this.leave);
    this.leave = undefined;
  }
  private setExpanded(expanded: boolean) {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    if (this.poll) clearInterval(this.poll);
    this.poll = undefined;
    if (expanded) {
      // Only the automatic expanded state needs the missed-leave fallback.
      this.poll = setInterval(() => {
        this.refresh();
        if (this.active) this.pointer(this.options.containsCursor());
      }, 1000);
      this.poll.unref?.();
    } else this.cancelLeave();
    this.options.changed();
  }
  dispose() {
    this.disposed = true;
    this.active = false;
    this.reset();
  }
}

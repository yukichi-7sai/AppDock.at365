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
    } else if (this.expanded && !this.leave) {
      // Let native child surfaces and brief boundary crossings settle first.
      this.leave = setTimeout(() => {
        this.leave = undefined;
        this.refresh();
        if (this.active && !this.options.containsCursor()) this.setExpanded(false);
      }, 200);
      this.leave.unref?.();
    }
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
        if (this.active && !this.options.containsCursor()) this.reset();
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

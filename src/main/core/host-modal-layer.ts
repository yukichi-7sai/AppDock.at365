import type { BrowserWindow } from 'electron';

/** Tracks body dialogs; independent Shell views retain visibility, order and input. */
export class HostModalLayer {
  private active = false;
  constructor(
    window: BrowserWindow,
    private changed?: () => void,
  ) {
    const reset = () => this.setActive(false);
    window.webContents.on('did-start-loading', reset);
    window.webContents.on('render-process-gone', reset);
    window.once('closed', reset);
  }
  get isActive() {
    return this.active;
  }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.changed?.();
  }
}

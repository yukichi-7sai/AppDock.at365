import type { BrowserWindow } from 'electron';

/** Tracks body dialogs; independent host views retain visibility, order and input. */
export class HostModalLayer {
  private state: 'none' | 'open' | 'confirm' = 'none';
  constructor(
    window: BrowserWindow,
    private changed?: () => void,
  ) {
    const reset = () => this.setState('none');
    window.webContents.on('did-start-loading', reset);
    window.webContents.on('render-process-gone', reset);
    window.once('closed', reset);
  }
  get isActive() {
    return this.state !== 'none';
  }
  get hasConfirm() {
    return this.state === 'confirm';
  }
  setState(state: 'none' | 'open' | 'confirm') {
    if (this.state === state) return;
    this.state = state;
    this.changed?.();
  }
}

import { hostText } from '../../shared/i18n';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { HostSettings } from '../../shared/contracts';

const executeFile = promisify(execFile);
export const DEFAULT_DOUBLE_CLICK_TIME_MS = 500;
export async function readDoubleClickTime(executable: string): Promise<number> {
  const { stdout } = await executeFile(executable, ['--double-click-time'], {
    windowsHide: true,
    timeout: 3000,
    maxBuffer: 1024,
  });
  const delay = Number(stdout.trim());
  if (!Number.isInteger(delay) || delay < 1 || delay > 5000)
    throw new Error(hostText('services.trayClicks.intervalFailed'));
  return delay;
}

export class TrayClickDispatcher {
  private pending = new Map<symbol, ReturnType<typeof setTimeout> | undefined>();
  private closed = false;
  constructor(
    private settings: () => HostSettings,
    private execute: (id: string) => void,
    private delay: () => Promise<number>,
  ) {}
  click() {
    if (this.closed) return;
    const { trayClickCommand, trayDoubleClickCommand } = this.settings();
    if (!trayDoubleClickCommand) {
      this.execute(trayClickCommand);
      return;
    }
    const token = Symbol();
    this.pending.set(token, undefined);
    // Start the window at mouse-down; the native query runs without blocking Electron.
    const started = performance.now();
    void this.delay()
      .catch(() => DEFAULT_DOUBLE_CLICK_TIME_MS)
      .then((delay) => {
        if (!this.pending.has(token)) return;
        this.pending.set(
          token,
          setTimeout(
            () => {
              this.pending.delete(token);
              this.execute(trayClickCommand);
            },
            Math.max(0, delay + 25 - (performance.now() - started)),
          ),
        );
      });
  }
  doubleClick() {
    if (this.closed) return;
    const id = this.settings().trayDoubleClickCommand;
    if (!id) return;
    // Windows emits click on the first mouse-down, then double-click on the second.
    const token = [...this.pending.keys()].at(-1);
    if (token) {
      clearTimeout(this.pending.get(token));
      this.pending.delete(token);
    }
    this.execute(id);
  }
  cancel() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
  close() {
    this.closed = true;
    this.cancel();
  }
}

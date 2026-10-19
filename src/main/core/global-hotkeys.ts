import { getKeybindings, globalShortcutInputs } from '../../shared/keybindings';
import type { GlobalHotKeyStatus, Settings } from '../../shared/contracts';
import type {
  InputCaptureManager,
  NativeShortcutStatus,
  ShortcutInput,
  ShortcutPress,
} from './gestures';

export interface HotKeyBackend {
  sync(
    shortcuts: string[],
    inputs?: ShortcutInput[],
    retry?: boolean,
  ): Promise<NativeShortcutStatus[]>;
  close(): Promise<void>;
}
export class InputCaptureHotKeyBackend implements HotKeyBackend {
  constructor(private capture: () => InputCaptureManager | undefined) {}
  sync(shortcuts: string[], inputs?: ShortcutInput[], retry = false) {
    const capture = this.capture();
    if (!capture) return Promise.reject(new Error('入力ホストを初期化中です。'));
    return capture.syncShortcuts(
      inputs ?? shortcuts.map((shortcut) => ({ shortcut, blockOriginalInput: true })),
      retry,
    );
  }
  async close() {
    await this.capture()?.syncShortcuts([]);
  }
}
export class GlobalHotKeyManager {
  statuses: GlobalHotKeyStatus[] = [];
  private signature = '';
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private executing = new Set<string>();
  private desired: { commandId: string; shortcut: string }[] = [];
  constructor(
    private backend: HotKeyBackend,
    private execute: (id: string) => Promise<unknown>,
    private changed: () => void,
    private report: (message: string) => void,
    private dispatch?: (shortcut: string, press?: ShortcutPress) => Promise<unknown>,
  ) {}
  sync(settings: Settings, available: string[], suspended = false, retry = false): Promise<void> {
    const desired = suspended
      ? []
      : getKeybindings(settings)
          .filter(
            (row) => row.enabled && row.when.scope === 'global' && available.includes(row.command),
          )
          .map((row) => ({ commandId: row.command, shortcut: row.key }));
    const inputs = suspended ? [] : globalShortcutInputs(getKeybindings(settings), available);
    this.queue = this.queue.then(async () => {
      if (this.stopped) return;
      const signature = JSON.stringify([desired, inputs]);
      if (!retry && signature === this.signature) return;
      this.signature = signature;
      this.desired = desired;
      this.statuses = [];
      try {
        this.applied(
          await this.backend.sync(
            inputs.map((row) => row.shortcut),
            inputs,
            retry,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.signature = '';
        this.statuses = desired.map((item) => ({ ...item, registered: false, error: message }));
        this.report(message);
        this.changed();
      }
    });
    return this.queue;
  }
  applied(result: NativeShortcutStatus[]) {
    if (this.stopped) return;
    this.statuses = this.desired.map((item) => {
      const status = result.find((entry) => entry.shortcut === item.shortcut);
      return { ...item, ...status, registered: status?.registered ?? false };
    });
    for (const status of this.statuses) if (status.error) this.report(status.error);
    this.changed();
  }
  failed(error: Error) {
    this.statuses = this.statuses.map((status) => ({
      ...status,
      registered: false,
      error: error.message,
    }));
    this.changed();
  }
  async pressed(input: string | ShortcutPress) {
    if (this.stopped) return;
    const keys = typeof input === 'string' ? [input] : input.shortcuts;
    const commands = [
      ...new Set(
        this.statuses
          .filter((status) => status.registered && keys.includes(status.shortcut))
          .map((status) => status.commandId),
      ),
    ];
    if (!commands.length) return;
    if (this.dispatch) {
      await this.dispatch(keys[0], typeof input === 'string' ? undefined : input);
      return;
    }
    for (const commandId of commands) {
      if (this.executing.has(commandId)) continue;
      this.executing.add(commandId);
      try {
        await this.execute(commandId);
      } catch (error) {
        this.report(String(error));
      } finally {
        this.executing.delete(commandId);
      }
    }
  }
  async close() {
    this.stopped = true;
    await this.queue;
    this.statuses = [];
    await this.backend.close();
  }
}

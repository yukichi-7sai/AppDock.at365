import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { JsonLinePeer } from './rpc';
import { defaultGestures, nativeGestureRows, type GestureContext } from '../../shared/gestures';
import type { Settings } from '../../shared/contracts';
import type { ShortcutDispatcher } from './shortcut-dispatcher';

export interface GestureInvocation {
  session: string;
  window: string;
  process: string;
  source: string;
}
export class GestureManager {
  private peer?: JsonLinePeer;
  private child?: ChildProcessWithoutNullStreams;
  private fingerprint = '';
  private syncing = false;
  private stopped = false;
  private revision = 0;
  private timer?: ReturnType<typeof setInterval>;
  private active = new Map<string, AbortController>();
  paused = false;
  constructor(
    private executable: string,
    private state: () => {
      settings: Settings;
      context: GestureContext;
      commands: { id: string; title: string; extensionId?: string | null }[];
      recording: boolean;
    },
    private dispatcher: ShortcutDispatcher,
    private execute: (id: string, invocation: GestureInvocation) => Promise<unknown>,
    private cancelCommand: (session: string) => void,
    private report: (message: string) => void,
  ) {}
  async start() {
    await this.sync();
    this.timer = setInterval(() => {
      void this.sync();
    }, 40);
  }
  togglePause() {
    this.paused = !this.paused;
    void this.sync();
  }
  private async sync() {
    if (this.stopped || this.syncing) return;
    const state = this.state(),
      settings = state.settings.gestures ?? defaultGestures();
    const rows = nativeGestureRows(settings, state.context, state.commands);
    const context = JSON.stringify(state.context);
    const config = {
      ...settings,
      rows,
      context,
      enabled: settings.enabled && !this.paused && !state.recording,
    };
    const fingerprint = JSON.stringify(config);
    if (fingerprint === this.fingerprint) return;
    if (!this.peer && (!config.enabled || !rows.length)) return;
    this.syncing = true;
    try {
      if (!this.peer) {
        const child = spawn(this.executable, [], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child = child;
        const peer = new JsonLinePeer(child.stdout, child.stdin, async (method, p) => {
          if (method === 'gestures.cancel') {
            this.active.get(p.session)?.abort();
            this.cancelCommand(p.session);
            return;
          }
          if (method !== 'gestures.invoke') throw Error('Unknown gesture event.');
          if (p.revision !== this.revision || this.stopped || this.paused) return;
          const current = this.state();
          if (current.recording || JSON.stringify(current.context) !== p.context) return;
          if (typeof p.session !== 'string' || !Array.isArray(p.rowIds)) return;
          const allowed = nativeGestureRows(
            current.settings.gestures ?? defaultGestures(),
            current.context,
            current.commands,
          );
          const commands = [
            ...new Set(
              allowed
                .filter((r) => p.rowIds.includes(r.id) && r.gesture === p.gesture)
                .map((r) => r.command),
            ),
          ];
          if (current.settings.gestures?.executionMode === 'first') commands.splice(1);
          const controller = new AbortController();
          this.active.set(p.session, controller);
          try {
            await this.dispatcher.dispatch('gesture:' + p.gesture, commands, {
              valid: async () =>
                !controller.signal.aborted &&
                !this.stopped &&
                !this.paused &&
                p.revision === this.revision &&
                JSON.stringify(this.state().context) === p.context &&
                !!(await peer.request('gestures.valid', { session: p.session, window: p.window })),
              execute: async (id) => {
                try {
                  return await this.execute(id, {
                    session: p.session,
                    window: p.window,
                    process: p.process,
                    source: 'gesture',
                  });
                } catch (error) {
                  if (!controller.signal.aborted) throw error;
                }
              },
            });
          } finally {
            this.active.delete(p.session);
          }
        });
        this.peer = peer;
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (data) => this.report(String(data).slice(0, 2000).trim()));
        child.on('error', (error) => {
          this.report(error.message);
          peer.close();
        });
        child.on('exit', () => peer.close());
        peer.on('closed', () => {
          child.kill();
          for (const [session, controller] of this.active) {
            controller.abort();
            this.cancelCommand(session);
          }
          if (!this.stopped)
            this.report(
              'ジェスチャー入力プロセスが停止しました。設定を保存するかAppDockを再起動してください。',
            );
          // No automatic restart loop; a configuration change can retry.
        });
      }
      this.revision++;
      for (const [session, controller] of this.active) {
        controller.abort();
        this.cancelCommand(session);
      }
      if (this.peer.closed) {
        this.peer = undefined;
        return;
      }
      await this.peer.request('gestures.sync', { ...config, revision: this.revision });
      this.fingerprint = fingerprint;
    } catch (error) {
      this.fingerprint = fingerprint;
      this.report(String(error));
    } finally {
      this.syncing = false;
    }
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const [session, controller] of this.active) {
      controller.abort();
      this.cancelCommand(session);
    }
    this.peer?.close();
    this.child?.kill();
  }
}

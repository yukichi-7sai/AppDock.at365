import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JsonLinePeer } from './rpc';
import {
  defaultGestures,
  nativeGestureRows,
  planGestureCommands,
  type GestureContext,
} from '../../shared/gestures';
import { readCommandTarget } from '../../shared/command-conditions';
import type { GlobalHotKeyStatus, Settings } from '../../shared/contracts';
import type { CommandDispatcher } from './command-dispatcher';

const configurationKey = (settings: Settings['gestures'], commands: unknown) =>
  createHash('sha256')
    .update(JSON.stringify([settings, commands]))
    .digest('hex');

export interface GestureInvocation {
  session: string;
  window: string;
  process: string;
  source: string;
}
export interface ShortcutInput {
  shortcut: string;
  blockOriginalInput: boolean;
}
export type NativeShortcutStatus = Omit<GlobalHotKeyStatus, 'commandId'>;
export interface ShortcutPress {
  shortcuts: string[];
  window: string;
  context: string;
  revision: number;
  pressId: number;
}
export class InputCaptureManager {
  private peer?: JsonLinePeer;
  private child?: ChildProcessWithoutNullStreams;
  private fingerprint = '';
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private revision = 0;
  private shortcutRevision = 0;
  private inputs: ShortcutInput[] = [];
  private statuses: NativeShortcutStatus[] = [];
  private recording?: { token: string; window: string; allowWin: boolean };
  private faultSettings?: string;
  private timer?: ReturnType<typeof setInterval>;
  private active = new Map<string, AbortController>();
  private recordSequence = 0;
  private endedRecordings = new Set<string>();
  paused = false;
  private refreshing = false;
  private foregroundWindow?: string;
  constructor(
    private executable: string,
    private readState: (foregroundWindow?: string) => {
      settings: Settings;
      context: GestureContext;
      commands: { id: string; title: string; extensionId?: string | null }[];
      recording: boolean;
    },
    private dispatcher: CommandDispatcher,
    private execute: (id: string, invocation: GestureInvocation) => Promise<unknown>,
    private cancelCommand: (session: string) => void,
    private report: (message: string) => void,
    private shortcuts: {
      pressed(event: ShortcutPress): void;
      applied(statuses: NativeShortcutStatus[]): void;
      failed(error: Error): void;
      ownership(keys: string[]): Promise<void>;
      recorded(event: { token: string; key: string; sequence: number }): void;
    },
  ) {}
  private state() {
    return this.readState(this.foregroundWindow);
  }
  async start() {
    await this.refresh();
    this.timer = setInterval(() => {
      if (this.refreshing) return;
      this.refreshing = true;
      void this.refresh()
        .catch(() => {})
        .finally(() => {
          this.refreshing = false;
        });
    }, 40);
  }
  togglePause() {
    this.paused = !this.paused;
    void this.refresh().catch(() => {});
  }
  refresh(force = false): Promise<NativeShortcutStatus[]> {
    const work = this.queue.then(() => this.sync(force));
    this.queue = work.catch(() => {});
    return work;
  }
  async syncShortcuts(inputs: ShortcutInput[], force = false) {
    if (JSON.stringify(inputs) !== JSON.stringify(this.inputs) || force) {
      this.inputs = structuredClone(inputs);
      this.shortcutRevision++;
    }
    return this.refresh(force);
  }
  async record(request: { token: string; active: boolean; allowWin: boolean }, window: string) {
    if (request.active && !this.endedRecordings.has(request.token))
      this.recording = { token: request.token, window, allowWin: request.allowWin };
    else if (!request.active) {
      this.endedRecordings.add(request.token);
      if (this.endedRecordings.size > 256)
        this.endedRecordings.delete(this.endedRecordings.values().next().value!);
      if (this.recording?.token === request.token) this.recording = undefined;
    }
    await this.refresh();
  }
  async endRecording() {
    this.recording = undefined;
    await this.refresh();
  }
  async activate(pressId: number, window: string) {
    if (!this.peer || this.peer.closed || this.stopped) return false;
    return !!(await this.peer.request('capture.activate', { pressId, window }));
  }
  async activateGesture(
    invocation: Pick<GestureInvocation, 'session' | 'window'>,
    window: string,
    show: () => void,
  ) {
    const peer = this.peer;
    const active = this.active.get(invocation.session);
    if (
      invocation.window === window ||
      this.stopped ||
      this.paused ||
      !peer ||
      peer.closed ||
      !active ||
      active.signal.aborted
    ) {
      show();
      return false;
    }
    const request = {
      session: invocation.session,
      source: invocation.window,
      window,
    };
    let prepared: unknown;
    try {
      prepared = await peer.request('gestures.prepareActivation', request);
    } finally {
      show();
    }
    return !!prepared && !!(await peer.request('gestures.activate', request));
  }
  async activateProcess(pressId: number, processId: number) {
    if (!this.peer || this.peer.closed || this.stopped) return false;
    return !!(await this.peer.request('capture.activateProcess', { pressId, processId }));
  }
  private async event(method: string, p: any) {
    if (method === 'capture.foreground') {
      if (typeof p.window !== 'string' || !/^\d{1,20}$/.test(p.window) || this.stopped) return;
      this.foregroundWindow = p.window;
      await this.refresh();
      return;
    }
    if (method === 'gestures.prepare') {
      if (typeof p.window !== 'string' || typeof p.hostWindow !== 'boolean') return false;
      // Wait only for the focus event caused by this press, then synchronize its actual conditions.
      const deadline = Date.now() + 500;
      do {
        if (this.stopped || this.paused || this.state().recording) return false;
        const context = this.state().context;
        if (p.hostWindow ? context.window === p.window : !context.window) {
          await this.refresh();
          return !this.stopped && !this.paused && !this.state().recording;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      return false;
    }
    if (method === 'shortcuts.pressed') {
      if (
        this.stopped ||
        this.state().recording ||
        p.revision !== this.shortcutRevision ||
        !Array.isArray(p.shortcuts) ||
        !p.shortcuts.length ||
        p.shortcuts.length > 2000 ||
        p.shortcuts.some((key: unknown) => typeof key !== 'string') ||
        typeof p.window !== 'string' ||
        typeof p.context !== 'string'
      )
        return;
      const keys = p.shortcuts.filter((key: string) =>
        this.statuses.some((s) => s.registered && s.shortcut === key),
      );
      if (keys.length) this.shortcuts.pressed({ ...p, shortcuts: keys });
      return;
    }
    if (method === 'shortcuts.applied') {
      if (p.revision === this.shortcutRevision && Array.isArray(p.statuses)) {
        if (p.statuses.some((status: NativeShortcutStatus) => status.error)) {
          this.statuses = p.statuses;
          this.faultSettings = JSON.stringify(this.state().settings);
          await this.shortcuts.ownership([]);
          this.shortcuts.applied(this.statuses);
          return;
        }
        this.fingerprint = '';
        await this.refresh(true);
      }
      return;
    }
    if (method === 'shortcuts.recorded') {
      if (this.recording?.token === p.token && typeof p.key === 'string')
        this.shortcuts.recorded({ token: p.token, key: p.key, sequence: ++this.recordSequence });
      return;
    }
    if (method === 'shortcuts.recordEnded') {
      if (this.recording?.token === p.token) this.recording = undefined;
      return;
    }
    if (method === 'input.error') {
      this.report(typeof p.message === 'string' ? p.message : '入力処理に失敗しました。');
      return;
    }
    if (method === 'gestures.cancel') {
      this.active.get(p.session)?.abort();
      this.cancelCommand(p.session);
      return;
    }
    if (method !== 'gestures.invoke') throw Error('Unknown input event.');
    if (p.revision !== this.revision || this.stopped || this.paused) return;
    const current = this.state();
    const gestureSettings = current.settings.gestures ?? defaultGestures();
    if (
      current.recording ||
      !gestureSettings.enabled ||
      p.settingsKey !== configurationKey(gestureSettings, current.commands) ||
      JSON.stringify(current.context) !== p.context ||
      typeof p.gesture !== 'string' ||
      typeof p.process !== 'string' ||
      !p.process.length ||
      p.process.length > 120 ||
      typeof p.session !== 'string' ||
      !p.session.length ||
      p.session.length > 180 ||
      this.active.has(p.session) ||
      !Array.isArray(p.rowIds) ||
      !p.rowIds.length ||
      p.rowIds.length > 2000 ||
      p.rowIds.some((id: unknown) => typeof id !== 'string' || id.length > 180) ||
      new Set(p.rowIds).size !== p.rowIds.length
    )
      return;
    const target = readCommandTarget(p.target);
    if (!target || target.window !== p.window || target.processName !== p.process) return;
    const plan = planGestureCommands(
      gestureSettings,
      p.gesture,
      current.context,
      target,
      current.commands,
    );
    if (JSON.stringify(plan.rowIds) !== JSON.stringify(p.rowIds)) return;
    const controller = new AbortController();
    this.active.set(p.session, controller);
    const peer = this.peer!;
    try {
      await this.dispatcher.dispatch('gesture:' + p.gesture, plan, {
        valid: async () => {
          const latest = this.state();
          return (
            !controller.signal.aborted &&
            !this.stopped &&
            !this.paused &&
            !latest.recording &&
            p.revision === this.revision &&
            configurationKey(latest.settings.gestures ?? defaultGestures(), latest.commands) ===
              p.settingsKey &&
            JSON.stringify(latest.context) === p.context &&
            !!(await peer.request('gestures.valid', { session: p.session, window: p.window }))
          );
        },
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
  }
  private connect() {
    this.foregroundWindow = undefined;
    const child = spawn(this.executable, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const peer = new JsonLinePeer(child.stdout, child.stdin, (method, p) => this.event(method, p));
    this.child = child;
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
      if (this.peer !== peer || this.stopped) return;
      this.faultSettings = JSON.stringify(this.state().settings);
      this.statuses = this.statuses.map((s) => ({
        ...s,
        registered: false,
        error: '入力プロセスとの接続が終了しました。',
      }));
      this.shortcuts.failed(
        new Error('入力プロセスが停止しました。設定を保存するか再試行してください。'),
      );
      void this.shortcuts.ownership([]).catch(() => {});
    });
    return peer;
  }
  private async sync(force: boolean): Promise<NativeShortcutStatus[]> {
    if (this.stopped) return [];
    const state = this.state();
    if (this.faultSettings && !force && this.faultSettings === JSON.stringify(state.settings))
      return this.statuses;
    const settings = state.settings.gestures ?? defaultGestures();
    const context = JSON.stringify(state.context);
    const gesture = {
      ...settings,
      rows: nativeGestureRows(settings, state.context, state.commands, settings.activateOnStart),
      context,
      settingsKey: configurationKey(settings, state.commands),
      hostProcessId: process.pid,
      enabled: settings.enabled && !this.paused && !state.recording,
    };
    const inputs = state.recording ? [] : this.inputs;
    const config = {
      gestures: gesture,
      shortcuts: inputs,
      shortcutRevision: this.shortcutRevision,
      hostProcessId: process.pid,
      context,
      recording: this.recording ?? null,
    };
    const fingerprint = JSON.stringify(config);
    if (!force && fingerprint === this.fingerprint && !this.faultSettings) return this.statuses;
    if (
      !this.peer &&
      !inputs.length &&
      !this.recording &&
      (!gesture.enabled || !gesture.rows.length)
    ) {
      this.fingerprint = fingerprint;
      return [];
    }
    try {
      if (!this.peer || this.peer.closed) {
        this.connect();
      }
      const peer = this.peer!;
      this.faultSettings = undefined;
      if (this.fingerprint !== fingerprint) {
        this.revision++;
        for (const [session, controller] of this.active) {
          controller.abort();
          this.cancelCommand(session);
        }
      }
      const payload = { ...config, gestures: { ...gesture, revision: this.revision } };
      let statuses: NativeShortcutStatus[];
      {
        statuses = await peer.request('capture.sync', { ...payload, shortcutsActive: false });
        await this.shortcuts.ownership(
          statuses.filter((s) => s.registered).flatMap((s) => s.inputKeys ?? [s.shortcut]),
        );
        this.statuses = statuses;
        this.shortcuts.applied(statuses);
        if (inputs.length)
          statuses = await peer.request('capture.sync', { ...payload, shortcutsActive: true });
      }
      this.statuses = statuses;
      this.fingerprint = fingerprint;
      this.shortcuts.applied(statuses);
      return statuses;
    } catch (error) {
      this.faultSettings = JSON.stringify(state.settings);
      this.statuses = inputs.map((row) => ({
        shortcut: row.shortcut,
        registered: false,
        error: '入力の適用に失敗しました。',
      }));
      this.peer?.close();
      this.shortcuts.failed(error instanceof Error ? error : new Error(String(error)));
      await this.shortcuts.ownership([]);
      throw error;
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
    await this.shortcuts.ownership([]);
  }
}
export { InputCaptureManager as GestureManager };

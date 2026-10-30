import { hostText } from '../../shared/i18n';
import {
  readGestureIndicatorNotice,
  type GestureIndicatorModel,
} from '../../shared/gesture-indicator';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JsonLinePeer } from './rpc';
import {
  getGestureSettings,
  nativeGestureRows,
  planGestureCommands,
  type GestureContext,
} from '../../shared/gestures';
import {
  readCommandTarget,
  type CommandTarget,
  type ConditionEnvironment,
} from '../../shared/command-conditions';
import type { GlobalHotKeyStatus, Settings } from '../../shared/contracts';
import type { CommandDispatcher } from './command-dispatcher';
import { defaultTouchpadGestures, nativeTouchpadConditions } from '../../shared/touchpad-gestures';
import { getCommandTriggerOptions } from '../../shared/command-trigger-options';
import { dialogNavigationShortcuts, isDialogNavigationShortcut } from '../../shared/commands';
import type { StackCatalogEntry } from '../../shared/command-stacks';

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
  owner?: string;
  touchpadGeneration?: number;
  conditions?: {
    when: {
      scope: string;
      appletIds: string[];
      processes: string[];
      excludeDesktop: boolean;
      excludedProcesses?: string[];
    };
    blockOriginalInput: boolean;
  }[];
  environment?: ConditionEnvironment;
}
export type NativeShortcutStatus = Omit<GlobalHotKeyStatus, 'commandId'>;
export interface ShortcutPress {
  shortcuts: string[];
  window: string;
  context: string;
  revision: number;
  pressId: number;
  target?: CommandTarget;
}
export class InputCaptureManager {
  indicator?: { show(model: GestureIndicatorModel, followCursor?: boolean): void; hide(): void };
  private peer?: JsonLinePeer;
  private child?: ChildProcessWithoutNullStreams;
  private fingerprint = '';
  private gestureFingerprint = '';
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private revision = 0;
  private shortcutRevision = 0;
  private inputs: ShortcutInput[] = [];
  private touchpadInputs: ShortcutInput[] = [];
  private touchpadProjection = '';
  private touchpadReserved: string[] = [];
  touchpadCallbacks?: { changed(): void; failed(): void };
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
      commands: (StackCatalogEntry & { title: string })[];
      recording: boolean;
      quitting?: boolean;
      dialogWindow?: string;
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
      recordingEnded?(): void;
    },
  ) {}
  private state() {
    return this.readState(this.foregroundWindow);
  }
  get recordingActive() {
    return !!this.recording;
  }
  async captureTarget() {
    if (this.stopped) return undefined;
    try {
      if (!this.peer || this.peer.closed) this.connect();
      return readCommandTarget(await this.peer!.request('capture.target', {}));
    } catch {
      return undefined;
    }
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
  async syncTouchpad(inputs: ShortcutInput[], reserved: string[]) {
    if (
      JSON.stringify([inputs, reserved]) !==
      JSON.stringify([this.touchpadInputs, this.touchpadReserved])
    ) {
      this.touchpadInputs = structuredClone(inputs);
      this.touchpadReserved = [...reserved];
      this.shortcutRevision++;
    }
    return this.refresh();
  }
  async touchpadRequest<T = unknown>(method: string, params: unknown): Promise<T> {
    if (this.stopped) throw Error(hostText('services.gestures.closing'));
    if (!this.peer || this.peer.closed) this.connect();
    return this.peer!.request(method, params) as Promise<T>;
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
  private async event(method: string, p: any) {
    if (method === 'gestures.indicator') {
      const notice = readGestureIndicatorNotice(p);
      if (!notice || notice.revision !== this.revision || this.stopped) return;
      if (!notice.visible || this.paused) {
        this.indicator?.hide();
        return;
      }
      this.indicator?.show(
        notice,
        this.state().settings?.gestures?.indicatorPosition === 'cursor-follow',
      );
      return;
    }
    if (method === 'touchpad.changed') {
      this.touchpadCallbacks?.changed();
      return;
    }
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
        if (this.stopped || this.paused) return false;
        const context = this.state().context;
        if (p.hostWindow ? context.window === p.window : !context.window) {
          await this.refresh();
          return !this.stopped && !this.paused;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      return false;
    }
    if (method === 'shortcuts.pressed') {
      if (
        this.stopped ||
        p.revision !== this.shortcutRevision ||
        !Array.isArray(p.shortcuts) ||
        !p.shortcuts.length ||
        p.shortcuts.some((key: unknown) => typeof key !== 'string') ||
        typeof p.window !== 'string' ||
        typeof p.context !== 'string'
      )
        return;
      const state = this.state();
      const keys = p.shortcuts.filter(
        (key: string) =>
          this.statuses.some((s) => s.registered && s.shortcut === key) &&
          (!state.recording || this.touchpadInputs.some((input) => input.shortcut === key)) &&
          !(state.dialogWindow === p.window && isDialogNavigationShortcut(key)),
      );
      const conditional = [...this.inputs, ...this.touchpadInputs].some(
        (input) => keys.includes(input.shortcut) && (input.owner || input.conditions?.length),
      );
      const target = p.target == null ? undefined : readCommandTarget(p.target);
      if ((conditional && !target) || (p.target != null && (!target || target.window !== p.window)))
        return;
      if (keys.length) this.shortcuts.pressed({ ...p, shortcuts: keys, target });
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
      if (this.recording?.token === p.token) {
        this.recording = undefined;
        this.shortcuts.recordingEnded?.();
      }
      return;
    }
    if (method === 'input.error') {
      this.report(
        typeof p.message === 'string' ? p.message : hostText('services.gestures.inputFailed'),
      );
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
    const gestureSettings = getGestureSettings(current.settings);
    if (
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
            p.revision === this.revision &&
            configurationKey(getGestureSettings(latest.settings), latest.commands) ===
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
      this.indicator?.hide();
      child.kill();
      for (const [session, controller] of this.active) {
        controller.abort();
        this.cancelCommand(session);
      }
      if (this.peer !== peer || this.stopped) return;
      if (this.recording) {
        this.recording = undefined;
        this.shortcuts.recordingEnded?.();
      }
      this.faultSettings = JSON.stringify(this.state().settings);
      this.statuses = this.statuses.map((s) => ({
        ...s,
        registered: false,
        error: hostText('services.gestures.disconnected'),
      }));
      this.shortcuts.failed(new Error(hostText('services.gestures.stopped')));
      this.touchpadCallbacks?.failed();
      void this.shortcuts.ownership([]).catch(() => {});
    });
    return peer;
  }
  private async sync(force: boolean): Promise<NativeShortcutStatus[]> {
    if (this.stopped) return [];
    const state = this.state();
    if (this.faultSettings && !force && this.faultSettings === JSON.stringify(state.settings))
      return this.statuses;
    const settings = getGestureSettings(state.settings);
    const context = JSON.stringify(state.context);
    const gesture = {
      ...settings,
      indicatorStyle: settings.indicatorStyle ?? 'compact',
      indicatorNoActionText: hostText('services.gestures.indicatorNoAction'),
      indicatorMoreText: hostText('services.gestures.indicatorMore', { count: '{count}' }),
      rows: nativeGestureRows(settings, state.context, state.commands, settings.activateOnStart),
      context,
      settingsKey: configurationKey(settings, state.commands),
      hostProcessId: process.pid,
      enabled: settings.enabled && !this.paused && !state.quitting,
    };
    const touchpad = state.settings.touchpadGestures ?? defaultTouchpadGestures();
    const projectedTouchpadInputs = this.touchpadInputs.map((input) => ({
      ...input,
      conditions: nativeTouchpadConditions(touchpad, input.owner?.slice('touchpad:'.length) ?? ''),
      environment: {
        ...getCommandTriggerOptions(state.settings),
        excludedProcesses: touchpad.excludedProcesses ?? [],
      },
    }));
    const touchpadProjection = JSON.stringify(projectedTouchpadInputs);
    if (touchpadProjection !== this.touchpadProjection) {
      this.touchpadProjection = touchpadProjection;
      this.shortcutRevision++;
    }
    const inputs = [
      ...this.inputs.filter(
        (input) =>
          !state.quitting && !state.recording && !this.touchpadReserved.includes(input.shortcut),
      ),
      ...(state.quitting ? [] : projectedTouchpadInputs),
    ];
    const config = {
      gestures: gesture,
      shortcuts: inputs,
      shortcutRevision: this.shortcutRevision,
      hostProcessId: process.pid,
      context,
      recording: this.recording ?? null,
      dialogWindow: state.dialogWindow ?? '',
      dialogShortcuts: dialogNavigationShortcuts,
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
      const gestureFingerprint = JSON.stringify(gesture);
      if (this.gestureFingerprint !== gestureFingerprint) {
        this.gestureFingerprint = gestureFingerprint;
        this.indicator?.hide();
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
        error: hostText('services.gestures.applyFailed'),
      }));
      this.peer?.close();
      this.shortcuts.failed(error instanceof Error ? error : new Error(String(error)));
      await this.shortcuts.ownership([]);
      throw error;
    }
  }
  async close() {
    this.indicator?.hide();
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

import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { Settings } from '../../shared/contracts';
import { getCommandTriggerOptions } from '../../shared/command-trigger-options';
import {
  connectionKey,
  defaultTouchpadGestures,
  touchpadGestureTypes,
  touchpadId,
  touchpadTitle,
  reservedTouchpadKeys,
  type TouchpadGestureId,
  type TouchpadGestureStatus,
  type TouchpadSnapshot,
} from '../../shared/touchpad-gestures';
import { getKeybindings } from '../../shared/keybindings';
import type { InputCaptureManager, ShortcutInput, ShortcutPress } from './gestures';
import { atomicWrite } from './settings';
import type { WarningEpisode, WarningReporter } from './warning-reporter';

interface WindowsGesture {
  gesture: TouchpadGestureId;
  key: string | null;
  action: number;
  mode: number;
  supported: boolean;
}
export interface TouchpadWindowsSnapshot {
  generation: number;
  revision: string;
  gestures: WindowsGesture[];
  values: Record<string, { exists: boolean; value: number }>;
  effective: Record<string, number>;
}
interface WindowsPlan {
  revision: string;
  changes: unknown[];
  before: WindowsGesture[];
  connections: Partial<Record<TouchpadGestureId, string>>;
}
interface PendingOperation {
  id: string;
  plan: WindowsPlan;
  remaining: TouchpadGestureId[];
}
interface BridgeHistory {
  schemaVersion: 1;
  attempted: Partial<Record<TouchpadGestureId, string>>;
  pending?: PendingOperation[];
  lastOperation?: { id: string; completed: boolean };
}
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const message = (error: unknown) =>
  error instanceof Error ? error.message : hostText('settings.touchpad-bridge.windowsUnavailable');

export class TouchpadBridgeManager {
  private history: BridgeHistory = { schemaVersion: 1, attempted: {} };
  private historyError = '';
  private historyBytes?: Buffer;
  private statuses: TouchpadGestureStatus[] = [];
  private active = new Map<string, TouchpadGestureId>();
  private episodes = new Map<TouchpadGestureId, WarningEpisode>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  private settingsVisible = false;
  private running = false;
  private stopped = false;
  private busy = false;
  private epoch = 0;
  private lease = false;
  private requestedSettings = '';
  private publishedState = '';
  constructor(
    private options: {
      stateFile: string;
      settings(): Settings;
      input: InputCaptureManager;
      changed(): void;
      suspended?(): boolean;
      warnings: WarningReporter;
      open(gesture: TouchpadGestureId): void | Promise<void>;
      report(error: Error): void;
      dispatch(
        gesture: TouchpadGestureId,
        press: ShortcutPress,
        valid: () => Promise<boolean>,
      ): Promise<unknown>;
    },
  ) {
    this.loadHistory();
    this.setResting();
  }
  private value() {
    const settings = this.options.settings();
    return {
      ...(settings.touchpadGestures ?? defaultTouchpadGestures()),
      ...getCommandTriggerOptions(settings),
    };
  }
  snapshot(): TouchpadSnapshot {
    return {
      statuses: structuredClone(this.statuses),
      busy: this.busy,
      operationId: this.history.pending?.at(-1)?.id ?? this.history.lastOperation?.id,
    };
  }
  private loadHistory() {
    try {
      if (!fs.existsSync(this.options.stateFile)) return;
      if (fs.statSync(this.options.stateFile).size > 128 * 1024)
        throw Error(hostText('settings.touchpad-bridge.historySize'));
      this.historyBytes = fs.readFileSync(this.options.stateFile);
      const value = JSON.parse(this.historyBytes.toString('utf8')) as BridgeHistory;
      if (
        value.schemaVersion !== 1 ||
        !value.attempted ||
        typeof value.attempted !== 'object' ||
        Array.isArray(value.attempted) ||
        Object.entries(value.attempted).some(
          ([id, key]) =>
            !touchpadGestureTypes.some(([gesture]) => gesture === id) ||
            typeof key !== 'string' ||
            key.length > 80,
        ) ||
        (value.pending &&
          (!Array.isArray(value.pending) ||
            value.pending.length > 10 ||
            value.pending.some(
              (operation) =>
                !operation?.plan ||
                typeof operation.id !== 'string' ||
                !Array.isArray(operation.remaining) ||
                !operation.remaining.length ||
                operation.remaining.some(
                  (id) =>
                    !touchpadGestureTypes.some(([gesture]) => gesture === id) ||
                    !operation.plan.connections?.[id],
                ) ||
                !operation.plan.connections ||
                !Array.isArray(operation.plan.before) ||
                operation.plan.before.length !== 10 ||
                operation.plan.before.some(
                  (row) =>
                    !row ||
                    !touchpadGestureTypes.some(([id]) => id === row.gesture) ||
                    typeof row.action !== 'number',
                ) ||
                Object.entries(operation.plan.connections).some(
                  ([id, key]) =>
                    !touchpadGestureTypes.some(([gesture]) => gesture === id) ||
                    typeof key !== 'string',
                ),
            )))
      )
        throw Error(hostText('settings.touchpad-bridge.historyFormat'));
      this.history = value;
    } catch {
      this.historyError = hostText('settings.touchpad-bridge.historyUnreadable');
    }
  }
  private saveHistory(next: BridgeHistory) {
    atomicWrite(this.options.stateFile, JSON.stringify(next, null, 2) + '\n', {
      previous: this.historyBytes,
    });
    this.historyBytes = fs.readFileSync(this.options.stateFile);
    this.history = next;
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  private setResting() {
    const value = this.value();
    this.statuses = touchpadGestureTypes.map(([gesture]) => ({
      gesture,
      key: connectionKey(value.connections[gesture]),
      state: !value.bindings.some((row) => row.gesture === gesture)
        ? 'unassigned'
        : !value.enabled
          ? 'off'
          : 'unconnected',
    }));
  }
  private publish() {
    const state = JSON.stringify([this.value().enabled, this.snapshot()]);
    if (state === this.publishedState) return;
    for (const status of this.statuses) {
      const needsAttention = ['conflict', 'error', 'unavailable'].includes(status.state);
      if (needsAttention && this.value().enabled) {
        let episode = this.episodes.get(status.gesture);
        if (!episode) {
          episode = this.options.warnings.episode();
          this.episodes.set(status.gesture, episode);
        }
        episode.update(
          {
            eventId: 'touchpad/' + status.gesture,
            source: 'touchpad',
            title: hostText('settings.touchpad-bridge.checkConnection', {
              title: touchpadTitle(status.gesture),
            }),
            code: 'TOUCHPAD_' + status.state.toUpperCase(),
            message: status.message ?? hostText('settings.touchpad-bridge.stopped'),
          },
          [
            {
              key: 'settings',
              label: hostText('settings.touchpad-bridge.openSettings'),
              primary: true,
              run: async () => {
                await this.options.open(status.gesture);
              },
            },
          ],
        );
      } else if (status.state === 'connected' || status.state === 'unassigned') {
        this.episodes.get(status.gesture)?.resolve();
        this.episodes.delete(status.gesture);
      }
    }
    this.publishedState = state;
    this.options.changed();
  }
  async start() {
    this.started = true;
    await this.reconcile();
    this.updatePolling();
  }
  /** Periodic inspection is UI support; Windows notifications remain active. */
  setSettingsVisible(visible: boolean) {
    if (this.stopped || visible === this.settingsVisible) return;
    this.settingsVisible = visible;
    this.updatePolling();
    if (visible && this.started) this.checkVisible();
  }
  private updatePolling() {
    const value = this.value();
    if (
      !this.started ||
      !this.settingsVisible ||
      this.stopped ||
      !value.enabled ||
      !value.bindings.length
    ) {
      clearInterval(this.timer);
      this.timer = undefined;
    } else if (!this.timer) this.timer = setInterval(() => this.checkVisible(), 60000);
  }
  private checkVisible() {
    if (this.running || this.busy || this.stopped || !this.settingsVisible || !this.value().enabled)
      return;
    this.running = true;
    void this.serial(async () => {
      // A queued periodic check may outlive the visible settings surface.
      if (!this.stopped && this.settingsVisible && this.value().enabled) await this.inspect();
    }).finally(() => {
      this.running = false;
    });
  }
  /** The changed event never grants permission to write Windows settings. */
  settingsChanged() {
    this.updatePolling();
    const next = fingerprint(this.value());
    if (next === this.requestedSettings) return;
    this.requestedSettings = next;
    this.invalidate();
    void this.reconcile();
  }
  invalidate() {
    this.epoch++;
    this.active.clear();
    for (const status of this.statuses) if (status.state === 'connected') status.state = 'checking';
    void this.options.input
      .syncTouchpad([], [...reservedTouchpadKeys(this.options.settings()).keys()])
      .catch(() => {});
  }
  windowsChanged() {
    this.invalidate();
    void this.reconcile();
  }
  inputFailed() {
    this.lease = false;
    this.invalidate();
    this.statuses = this.statuses.map((status) =>
      status.state === 'checking'
        ? {
            ...status,
            state: 'unavailable',
            message: hostText('settings.touchpad-bridge.inputUnavailable'),
          }
        : status,
    );
    this.publish();
  }
  reconcile() {
    return this.serial(() => this.inspect());
  }
  private async inspect() {
    if (this.stopped) return;
    this.updatePolling();
    const value = this.value();
    const expectedSettings = fingerprint(value);
    this.requestedSettings = expectedSettings;
    const assigned = new Set(value.bindings.map((row) => row.gesture));
    const reserved = [...reservedTouchpadKeys(this.options.settings()).keys()];
    if (!value.enabled || !assigned.size) {
      this.active.clear();
      await this.options.input.syncTouchpad([], reserved).catch(() => {});
      if (this.lease) {
        await this.options.input
          .touchpadRequest('touchpad.lease', { enabled: false })
          .catch(() => {});
        this.lease = false;
      }
      const old = this.statuses;
      this.setResting();
      if (!value.enabled)
        this.statuses = this.statuses.map((status) => ({
          ...status,
          message: old.find((item) => item.gesture === status.gesture)?.message,
        }));
      this.publish();
      return;
    }
    try {
      const snapshot = await this.options.input.touchpadRequest<TouchpadWindowsSnapshot>(
        'touchpad.read',
        {},
      );
      if (this.stopped || fingerprint(this.value()) !== expectedSettings) return;
      this.lease = await this.options.input.touchpadRequest<boolean>('touchpad.lease', {
        enabled: true,
      });
      if (!this.lease) throw Error(hostText('settings.touchpad-bridge.owned'));
      const conflicts = new Set(getKeybindings(this.options.settings()).map((row) => row.key));
      const recovered = (this.history.pending ?? []).filter(
        (pending) =>
          pending.remaining.every((id) =>
            snapshot.gestures.some(
              (row) => row.gesture === id && row.key === pending.plan.connections[id],
            ),
          ) &&
          pending.plan.before.every(
            (before) =>
              pending.plan.connections[before.gesture] ||
              snapshot.gestures.some(
                (row) =>
                  row.gesture === before.gesture &&
                  row.action === before.action &&
                  row.key === before.key &&
                  row.supported === before.supported,
              ),
          ),
      );
      if (recovered.length) {
        this.saveHistory({
          ...this.history,
          pending: this.history.pending?.filter((operation) => !recovered.includes(operation)),
          lastOperation: { id: recovered.at(-1)!.id, completed: true },
        });
      }
      const inputs: ShortcutInput[] = [];
      const nextActive = new Map<string, TouchpadGestureId>();
      this.statuses = touchpadGestureTypes.map(([gesture]) => {
        const key = connectionKey(value.connections[gesture]);
        const base = { gesture, key };
        if (!assigned.has(gesture)) return { ...base, state: 'unassigned' };
        const observed = snapshot.gestures.find((row) => row.gesture === gesture);
        if (this.historyError) return { ...base, state: 'error', message: this.historyError };
        if (this.history.pending?.some((operation) => operation.remaining.includes(gesture)))
          return {
            ...base,
            state: 'error',
            message: hostText('settings.touchpad-bridge.incomplete'),
          };
        if (!this.history.attempted[gesture])
          return {
            ...base,
            state: 'unconnected',
            message: hostText('settings.touchpad-bridge.unconnected'),
          };
        if (!observed?.supported)
          return {
            ...base,
            state: 'unavailable',
            message: hostText('settings.touchpad-bridge.unsupported'),
          };
        if (conflicts.has(key))
          return {
            ...base,
            state: 'conflict',
            message: hostText('settings.touchpad-bridge.shortcutConflict'),
          };
        if (snapshot.gestures.filter((row) => row.key === key).length > 1)
          return {
            ...base,
            state: 'conflict',
            message: hostText('settings.touchpad-bridge.windowsConflict'),
          };
        if (observed.key !== key)
          return {
            ...base,
            state: 'conflict',
            actual: observed.key ?? hostText('settings.touchpad-bridge.otherWindowsAction'),
            message: hostText('settings.touchpad-bridge.changed'),
          };
        inputs.push({
          shortcut: key,
          blockOriginalInput: true,
          owner: 'touchpad:' + gesture,
          touchpadGeneration: snapshot.generation,
        });
        nextActive.set(key, gesture);
        return { ...base, state: 'connected' };
      });
      const statuses = await this.options.input.syncTouchpad(inputs, reserved);
      if (this.stopped || fingerprint(this.value()) !== expectedSettings) return;
      this.active = new Map(
        [...nextActive].filter(
          ([key]) =>
            this.options.suspended?.() ||
            statuses.some((status) => status.shortcut === key && status.registered),
        ),
      );
      this.statuses = this.statuses.map((status) =>
        status.state === 'connected' && !this.active.has(status.key)
          ? {
              ...status,
              state: 'unavailable',
              message: hostText('settings.touchpad-bridge.captureUnavailable'),
            }
          : status,
      );
      this.publish();
    } catch (error) {
      this.active.clear();
      await this.options.input.syncTouchpad([], reserved).catch(() => {});
      this.statuses = touchpadGestureTypes.map(([gesture]) => ({
        gesture,
        key: connectionKey(value.connections[gesture]),
        state: assigned.has(gesture) ? 'unavailable' : 'unassigned',
        message: assigned.has(gesture) ? message(error) : undefined,
      }));
      this.publish();
    }
  }
  async pressed(press: ShortcutPress) {
    const entry = press.shortcuts
      .map((key) => [key, this.active.get(key)] as const)
      .find(([, id]) => !!id);
    if (!entry?.[1] || !press.target) return;
    const [key, gesture] = entry;
    const epoch = this.epoch;
    const configuration = fingerprint(this.value());
    await this.options.dispatch(
      gesture,
      press,
      async () =>
        !this.stopped &&
        epoch === this.epoch &&
        configuration === fingerprint(this.value()) &&
        this.active.get(key) === gesture &&
        (await this.options.input.touchpadRequest<boolean>('capture.validTarget', {
          window: press.window,
        })),
    );
  }
  /** UI save is explicit; received settings and public update do not call this method. */
  afterLocalEdit(before: Settings) {
    const old = before.touchpadGestures ?? defaultTouchpadGestures();
    const next = this.value();
    if (!next.enabled) return this.reconcile();
    const targets = touchpadGestureTypes
      .filter(([gesture]) => {
        if (!next.bindings.some((row) => row.gesture === gesture)) return false;
        if (!this.history.attempted[gesture])
          return !old.enabled || !old.bindings.some((row) => row.gesture === gesture);
        return (
          old.enabled &&
          connectionKey(old.connections[gesture]) !== connectionKey(next.connections[gesture]) &&
          this.statuses.some(
            (status) =>
              status.gesture === gesture &&
              (status.state === 'connected' || status.state === 'checking'),
          )
        );
      })
      .map(([id]) => id);
    const expected = Object.fromEntries(
      targets
        .filter((id) => this.history.attempted[id])
        .map((id) => [id, connectionKey(old.connections[id])]),
    );
    return targets.length ? this.connect(targets, expected) : this.reconcile();
  }
  connect(ids: TouchpadGestureId[], expected: Partial<Record<TouchpadGestureId, string>> = {}) {
    const requested = [...new Set(ids.map(touchpadId))];
    return this.serial(async () => {
      if (this.stopped || !this.value().enabled)
        throw Error(hostText('settings.touchpad-bridge.enableFirst'));
      const value = this.value();
      if (
        !requested.length ||
        requested.some((id) => !value.bindings.some((row) => row.gesture === id))
      )
        throw Error(hostText('settings.touchpad-bridge.assignmentRequired'));
      const expectedSettings = fingerprint(value);
      this.busy = true;
      this.invalidate();
      this.publish();
      try {
        await this.options.input.syncTouchpad(
          [],
          [...reservedTouchpadKeys(this.options.settings()).keys()],
        );
        this.lease = await this.options.input.touchpadRequest<boolean>('touchpad.lease', {
          enabled: true,
        });
        if (!this.lease) throw Error(hostText('settings.touchpad-bridge.owned'));
        const keys = new Set(getKeybindings(this.options.settings()).map((row) => row.key));
        const connections = Object.fromEntries(
          requested.map((id) => [id, connectionKey(value.connections[id])]),
        );
        if (Object.values(connections).some((key) => keys.has(key)))
          throw Error(hostText('settings.touchpad-bridge.keyConflict'));
        const plan = await this.options.input.touchpadRequest<WindowsPlan>('touchpad.plan', {
          connections,
        });
        if (
          Object.entries(expected).some(
            ([id, key]) => !plan.before.some((row) => row.gesture === id && row.key === key),
          )
        )
          throw Error(hostText('settings.touchpad-bridge.windowsChanged'));
        if (fingerprint(this.value()) !== expectedSettings)
          throw Error(hostText('settings.touchpad-bridge.changedDuringAction'));
        const operationId = randomUUID();
        this.saveHistory({
          schemaVersion: 1,
          attempted: { ...this.history.attempted, ...connections },
          pending: [
            ...(this.history.pending ?? [])
              .map((operation) => ({
                ...operation,
                remaining: operation.remaining.filter((id) => !requested.includes(id)),
              }))
              .filter((operation) => operation.remaining.length),
            { id: operationId, plan, remaining: requested },
          ],
        });
        this.historyError = '';
        this.publish();
        await this.options.input.touchpadRequest('touchpad.apply', { plan });
        this.saveHistory({
          ...this.history,
          pending: this.history.pending?.filter((operation) => operation.id !== operationId),
          lastOperation: { id: operationId, completed: true },
        });
      } catch (error) {
        this.options.report(error instanceof Error ? error : new Error(message(error)));
        throw error;
      } finally {
        this.busy = false;
        await this.inspect();
      }
      return this.snapshot();
    });
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    this.invalidate();
    await this.queue;
    await this.options.input.syncTouchpad([], []).catch(() => {});
    await this.options.input.touchpadRequest('touchpad.lease', { enabled: false }).catch(() => {});
  }
}

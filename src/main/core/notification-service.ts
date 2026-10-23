import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type {
  NotificationActionRequest,
  NotificationHistoryEntry,
  NotificationItem,
  NotificationLifetime,
  NotificationDeliveryState,
} from '../../shared/notifications';
import type { NotificationHistoryStore } from './notification-history';
export interface NotificationInput {
  dedupeKey?: string;
  level: NotificationItem['level'];
  title: string;
  body: string;
  actions?: {
    key: string;
    label: string;
    primary?: boolean;
    disabled?: boolean;
    run(): Promise<void>;
  }[];
  lifetime: NotificationLifetime;
  dismissible: boolean;
  targets: NotificationItem['targets'];
  history: 'persistent' | 'session' | 'none';
  historyText?: { title: string; body: string };
  busy?: boolean;
  restartTimer?: boolean;
  windowsSilent?: boolean;
  windowsClickAction?: string;
}
type Record = {
  item: NotificationItem;
  input: NotificationInput;
  executing: boolean;
  actions: Map<string, () => Promise<void>>;
  remaining?: number;
};
/** Content/lifetime ownership is independent of every native View and settings source. */
export class NotificationService {
  private records = new Map<string, Record>();
  private listeners = new Set<() => void>();
  private endedListeners = new Set<(id: string, status: NotificationItem['status']) => void>();
  private requests = new Map<string, { fingerprint: string; result: Promise<void> }>();
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private version = 0;
  private paused = false;
  constructor(
    private history: NotificationHistoryStore,
    private now = Date.now,
  ) {}
  get revision() {
    return this.version;
  }
  isPaused() {
    return this.paused;
  }
  setPaused(paused: boolean) {
    if (this.closed || paused === this.paused) return;
    this.expire();
    this.paused = paused;
    for (const r of this.records.values()) {
      if (r.item.status !== 'active') continue;
      if (paused && r.item.expiresAt !== undefined) {
        r.remaining = Math.max(1, r.item.expiresAt - this.now());
        r.item.expiresAt = undefined;
      } else if (!paused && r.remaining !== undefined) {
        r.item.expiresAt = this.now() + r.remaining;
        r.remaining = undefined;
      }
      r.item.revision++;
      this.persist(r);
    }
    this.changed();
  }
  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  subscribeEnded(callback: (id: string, status: NotificationItem['status']) => void) {
    this.endedListeners.add(callback);
    return () => {
      this.endedListeners.delete(callback);
    };
  }
  private changed() {
    this.version++;
    for (const callback of this.listeners) callback();
    this.schedule();
  }
  private persist(r: Record) {
    if (r.input.history !== 'persistent') return;
    const { actions: _actions, busy: _busy, dismissible: _dismissible, ...entry } = r.item;
    this.history.put({
      ...entry,
      title: r.input.historyText!.title,
      body: r.input.historyText!.body,
    });
  }
  upsert(source: string, input: NotificationInput, existingId?: string) {
    if (this.closed) throw Error('Notifications are shutting down');
    if (
      !source ||
      source.length > 200 ||
      typeof input.title !== 'string' ||
      input.title.length > 200 ||
      typeof input.body !== 'string' ||
      input.body.length > 2000 ||
      !['info', 'warning', 'error'].includes(input.level) ||
      !['persistent', 'session', 'none'].includes(input.history) ||
      !Array.isArray(input.targets) ||
      input.targets.some((t) => !['banner', 'desktop', 'windows'].includes(t)) ||
      new Set(input.targets).size !== input.targets.length ||
      !['timed', 'manual', 'condition'].includes(input.lifetime?.type) ||
      (input.lifetime.type === 'timed' &&
        (!Number.isSafeInteger(input.lifetime.milliseconds) ||
          input.lifetime.milliseconds < 1 ||
          input.lifetime.milliseconds > 2147483647)) ||
      (input.lifetime.type === 'condition' && input.dismissible) ||
      typeof input.dismissible !== 'boolean' ||
      (input.windowsSilent !== undefined && typeof input.windowsSilent !== 'boolean') ||
      (input.windowsClickAction !== undefined &&
        !input.actions?.some((a) => a.key === input.windowsClickAction)) ||
      (input.dedupeKey !== undefined && (!input.dedupeKey || input.dedupeKey.length > 200)) ||
      (input.actions?.length ?? 0) > 3 ||
      input.actions?.some(
        (a) =>
          !a.key ||
          a.key.length > 100 ||
          !a.label ||
          a.label.length > 100 ||
          typeof a.run !== 'function',
      ) ||
      new Set(input.actions?.map((a) => a.key)).size !== (input.actions?.length ?? 0) ||
      (input.history === 'persistent' &&
        (!input.historyText ||
          typeof input.historyText.title !== 'string' ||
          input.historyText.title.length > 200 ||
          typeof input.historyText.body !== 'string' ||
          input.historyText.body.length > 2000))
    )
      throw Error('Invalid notification');
    this.expire();
    let r = existingId
      ? this.records.get(existingId)
      : input.dedupeKey
        ? [...this.records.values()].find(
            (r) =>
              r.item.source === source &&
              r.item.status === 'active' &&
              r.input.dedupeKey === input.dedupeKey,
          )
        : undefined;
    if (existingId && (!r || r.item.source !== source || r.item.status !== 'active'))
      throw Error('Notification owner mismatch');
    if (!r) {
      const active = [...this.records.values()].filter((r) => r.item.status === 'active');
      const isHost = source.startsWith('host.');
      if (
        active.length >= (isHost ? 200 : 180) ||
        active.filter((r) => r.item.source === source).length >= 50
      )
        throw Error('Notification capacity reached');
      r = {
        item: {
          id: randomUUID(),
          revision: 0,
          source,
          level: input.level,
          title: '',
          body: '',
          actions: [],
          busy: false,
          dismissible: false,
          status: 'active',
          read: false,
          createdAt: this.now(),
          updatedAt: this.now(),
          targets: [],
          delivery: {},
          expiresAt:
            input.lifetime.type === 'timed' ? this.now() + input.lifetime.milliseconds : undefined,
        },
        input,
        executing: false,
        actions: new Map(),
      };
      this.records.set(r.item.id, r);
    } else if (r.input.history !== input.history)
      throw Error('Notification history policy cannot change');
    const prior = r.input;
    const oldActions = r.item.actions;
    r.input = {
      ...input,
      targets: [...input.targets],
      actions: input.actions?.map((a) => ({ ...a })),
      historyText: input.historyText && { ...input.historyText },
    };
    r.actions.clear();
    r.item.actions = (input.actions ?? []).map((a) => {
      const oldKeyIndex = prior.actions?.findIndex((p) => p.key === a.key) ?? -1;
      const id = oldKeyIndex >= 0 ? (oldActions[oldKeyIndex]?.id ?? randomUUID()) : randomUUID();
      r!.actions.set(id, a.run);
      return { id, label: a.label, primary: !!a.primary, disabled: !!a.disabled };
    });
    Object.assign(r.item, {
      level: input.level,
      title: input.title,
      body: input.body,
      targets: [...input.targets],
      delivery: Object.fromEntries(input.targets.map((t) => [t, r!.item.delivery[t] ?? 'pending'])),
      dismissible: input.dismissible,
      busy: !!input.busy || r.executing,
    });
    // Preserve a running timed notification's deadline on ordinary updates.
    if (input.lifetime.type !== 'timed') r.item.expiresAt = undefined;
    else if (r.item.expiresAt === undefined || input.restartTimer)
      r.item.expiresAt = this.now() + input.lifetime.milliseconds;
    if (input.lifetime.type !== 'timed') r.remaining = undefined;
    else if (this.paused) {
      if (r.remaining === undefined || input.restartTimer)
        r.remaining = input.lifetime.milliseconds;
      r.item.expiresAt = undefined;
    }
    r.item.revision++;
    r.item.updatedAt = this.now();
    this.persist(r);
    this.changed();
    return r.item.id;
  }
  identify(id: string, owner: { ownerKind: 'host' | 'applet'; ownerId: string }, typeId: string) {
    const r = this.records.get(id);
    if (
      !r ||
      (r.item.ownerKind === owner.ownerKind &&
        r.item.ownerId === owner.ownerId &&
        r.item.typeId === typeId)
    )
      return;
    Object.assign(r.item, owner, { typeId });
    r.item.revision++;
    this.persist(r);
    this.changed();
  }
  list(): NotificationItem[] {
    this.expire();
    return structuredClone([...this.records.values()].map((r) => r.item));
  }
  targetItems(target: NotificationItem['targets'][number]) {
    this.expire();
    if (this.paused) return [];
    return structuredClone(
      [...this.records.values()]
        .filter((r) => r.item.status === 'active' && r.item.targets.includes(target))
        .map((r) => r.item),
    );
  }
  historyEntries(): NotificationHistoryEntry[] {
    return [
      ...this.history.list(),
      ...this.list()
        .filter((i) => this.records.get(i.id)?.input.history === 'session')
        .map(({ actions: _a, busy: _b, dismissible: _d, ...entry }) => entry),
    ];
  }
  historyStatus() {
    return this.history.status;
  }
  centerEntries() {
    this.expire();
    const active = [...this.records.values()]
      .filter((r) => r.item.status === 'active')
      .map((r) => ({ ...structuredClone(r.item), historyPolicy: r.input.history }));
    const ended = this.historyEntries()
      .filter((i) => i.status !== 'active')
      .map((i) => ({
        ...i,
        actions: [],
        busy: false,
        dismissible: false,
        historyPolicy: this.records.get(i.id)?.input.history ?? ('persistent' as const),
      }));
    return [...new Map([...ended, ...active].map((i) => [i.id, i])).values()];
  }
  markRead(ids: string[]) {
    const rows = this.centerEntries();
    if (ids.some((id) => !rows.some((i) => i.id === id)))
      throw Error(hostText('services.notificationService.changed'));
    const persistent = ids.filter(
      (id) => rows.find((i) => i.id === id)!.historyPolicy === 'persistent',
    );
    if (persistent.length) this.history.markRead(persistent);
    for (const id of ids) {
      const r = this.records.get(id);
      if (r && !r.item.read) {
        r.item.read = true;
        r.item.revision++;
      }
    }
    this.changed();
  }
  deleteHistory(ids: string[]) {
    const rows = this.centerEntries();
    if (ids.some((id) => !rows.some((i) => i.id === id && i.status !== 'active')))
      throw Error(hostText('services.notificationService.endedOnly'));
    const persistent = ids.filter(
      (id) => rows.find((i) => i.id === id)!.historyPolicy === 'persistent',
    );
    if (persistent.length) this.history.deleteEnded(persistent);
    for (const id of ids) this.records.delete(id);
    this.changed();
  }
  end(source: string, id: string, status: 'resolved' | 'withdrawn' = 'resolved', reason?: string) {
    const r = this.records.get(id);
    if (!r || r.item.source !== source) throw Error('Notification owner mismatch');
    if (r.item.status === 'active') r.item.endReason = reason;
    this.finish(r, status);
  }
  withdrawSource(source: string) {
    for (const r of this.records.values())
      if (r.item.source === source && r.item.status === 'active') this.finish(r, 'withdrawn');
  }
  private finish(r: Record, status: NotificationItem['status']) {
    if (r.item.status !== 'active') return;
    r.item.status = status;
    for (const callback of this.endedListeners) callback(r.item.id, status);
    r.item.endedAt = this.now();
    r.item.updatedAt = this.now();
    r.item.revision++;
    r.item.actions = [];
    r.actions.clear();
    r.input.actions = [];
    r.item.busy = false;
    for (const target of r.item.targets) r.item.delivery[target] = 'ended';
    this.persist(r);
    // Active records never depend on retention limits; only terminal memory is bounded.
    if (r.input.history === 'none') this.records.delete(r.item.id);
    const ended = [...this.records.values()].filter((r) => r.item.status !== 'active');
    while (ended.length > 1000) this.records.delete(ended.shift()!.item.id);
    this.changed();
  }
  setDelivery(
    target: NotificationItem['targets'][number],
    ids: string[],
    state: Exclude<NotificationDeliveryState, 'ended'>,
    remaining?: Exclude<NotificationDeliveryState, 'ended'>,
  ) {
    let changed = false;
    for (const r of this.records.values()) {
      if (r.item.status !== 'active' || !r.item.targets.includes(target)) continue;
      const next = ids.includes(r.item.id) ? state : remaining;
      if (next === undefined) continue;
      if (r.item.delivery[target] !== next) {
        r.item.delivery[target] = next;
        this.persist(r);
        changed = true;
      }
    }
    if (changed) this.changed();
  }
  windowsOptions(id: string) {
    const r = this.records.get(id);
    const index = r?.input.actions?.findIndex((a) => a.key === r.input.windowsClickAction) ?? -1;
    return {
      silent: r?.input.windowsSilent ?? false,
      actionId: index >= 0 ? r?.item.actions[index]?.id : undefined,
    };
  }
  invoke(request: NotificationActionRequest): Promise<void> {
    if (
      !request ||
      !['invoke', 'dismiss'].includes(request.type) ||
      typeof request.requestId !== 'string' ||
      !request.requestId ||
      request.requestId.length > 100
    )
      return Promise.reject(Error('Invalid notification request'));
    const fingerprint = JSON.stringify([
      request.notificationId,
      request.revision,
      request.type,
      request.actionId,
    ]);
    const duplicate = this.requests.get(request.requestId);
    if (duplicate)
      return duplicate.fingerprint === fingerprint
        ? duplicate.result
        : Promise.reject(Error('Notification request ID reused'));
    const result = this.perform(request);
    this.requests.set(request.requestId, { fingerprint, result });
    while (this.requests.size > 512) this.requests.delete(this.requests.keys().next().value!);
    return result;
  }
  private async perform(request: NotificationActionRequest) {
    this.expire();
    const r = this.records.get(request.notificationId);
    if (this.closed || !r || r.item.status !== 'active' || r.item.revision !== request.revision)
      throw Error(hostText('services.notificationService.refresh'));
    if (r.executing || r.item.busy) throw Error(hostText('services.notificationService.busy'));
    if (request.type === 'dismiss') {
      if (!r.item.dismissible) throw Error(hostText('services.notificationService.cannotDismiss'));
      this.finish(r, 'dismissed');
      return;
    }
    const action = r.item.actions.find((a) => a.id === request.actionId);
    const callback = action && r.actions.get(action.id);
    if (!action || action.disabled || !callback)
      throw Error(hostText('services.notificationService.actionUnavailable'));
    r.executing = true;
    r.item.busy = true;
    r.item.revision++;
    this.changed();
    try {
      await callback();
    } finally {
      r.executing = false;
      if (r.item.status === 'active') {
        r.item.busy = !!r.input.busy;
        r.item.revision++;
        this.changed();
      }
    }
  }
  expire() {
    for (const r of [...this.records.values()])
      if (
        r.item.status === 'active' &&
        r.item.expiresAt !== undefined &&
        r.item.expiresAt <= this.now()
      )
        this.finish(r, 'expired');
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.closed) return;
    const due = [...this.records.values()]
      .filter((r) => r.item.status === 'active' && r.item.expiresAt !== undefined)
      .map((r) => r.item.expiresAt!);
    if (due.length) {
      this.timer = setTimeout(() => this.expire(), Math.max(1, Math.min(...due) - this.now()));
      this.timer.unref();
    }
  }
  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
    this.history.flush();
    this.listeners.clear();
    this.endedListeners.clear();
  }
}

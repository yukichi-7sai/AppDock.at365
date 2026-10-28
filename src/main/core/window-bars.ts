import { randomUUID } from 'node:crypto';
import type { ShellBarAction, ShellBarModel, ShellBarRegion } from '../../shared/shell-bars';

type Operation = keyof ShellBarModel['actions'];
type Receipt = { action: string; promise: Promise<unknown>; completed?: number };
/** Projects window/update services; no native View or Shell implementation belongs here. */
export class WindowBars {
  private ids = new Map<Operation, string>();
  private revisions = new Map<ShellBarRegion, { signature: string; revision: number }>();
  private requests = new Map<string, Receipt>();
  constructor(
    private options: {
      state(): Omit<
        ShellBarModel,
        'schemaVersion' | 'contextId' | 'region' | 'revision' | 'actions'
      >;
      run(operation: Operation): Promise<unknown>;
    },
  ) {}

  snapshot(region: ShellBarRegion): ShellBarModel {
    const state = this.options.state();
    const operations: Operation[] =
      region === 'titlebar'
        ? [
            'palette',
            'notifications',
            'minimize',
            'maximize',
            'close',
            ...(state.update.busy && state.update.cancellable ? ['cancel' as const] : []),
          ]
        : [
            'palette',
            ...(!state.update.busy && !state.update.blocked ? ['update' as const] : []),
            ...(state.update.busy && state.update.cancellable ? ['cancel' as const] : []),
          ];
    const actions: ShellBarModel['actions'] = {};
    for (const key of operations) {
      if (!this.ids.has(key)) this.ids.set(key, randomUUID());
      actions[key] = this.ids.get(key)!;
    }
    const signature = JSON.stringify([state, actions]);
    const previous = this.revisions.get(region);
    const revision = (previous?.revision ?? 0) + (previous?.signature === signature ? 0 : 1);
    this.revisions.set(region, { signature, revision });
    return {
      schemaVersion: 1,
      contextId: 'primary',
      region,
      revision,
      ...structuredClone(state),
      actions,
    };
  }

  invoke(region: ShellBarRegion, session: string, request: ShellBarAction): Promise<unknown> {
    if (
      !request ||
      request.sessionId !== session ||
      typeof request.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(request.requestId) ||
      typeof request.actionId !== 'string'
    )
      throw Error('Invalid window bar action');
    const now = Date.now();
    for (const [id, value] of this.requests)
      if (value.completed !== undefined && now - value.completed > 120000) this.requests.delete(id);
    const key = session + ':' + request.requestId;
    const existing = this.requests.get(key);
    if (existing) {
      if (existing.action !== request.actionId) throw Error('Conflicting window bar request');
      return existing.promise;
    }
    const actions = this.snapshot(region).actions;
    const operation = (Object.keys(actions) as Operation[]).find(
      (key) => actions[key] === request.actionId,
    );
    if (!operation) throw Error('Window bar action is unavailable');
    if (this.requests.size >= 512) throw Error('Window bar request limit reached');
    const receipt: Receipt = { action: request.actionId, promise: Promise.resolve() };
    receipt.promise = Promise.resolve()
      .then(() => {
        if (this.snapshot(region).actions[operation] !== request.actionId)
          throw Error('Window bar action is no longer available');
        return this.options.run(operation);
      })
      .finally(() => {
        receipt.completed = Date.now();
      });
    this.requests.set(key, receipt);
    return receipt.promise;
  }

  disconnect(session: string) {
    for (const key of this.requests.keys())
      if (key.startsWith(session + ':')) this.requests.delete(key);
  }
}

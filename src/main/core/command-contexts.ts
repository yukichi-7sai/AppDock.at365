import { randomUUID } from 'node:crypto';

export interface InputInvocation {
  session?: string;
  process?: string;
  origin?: { kind: 'local' | 'mcp' } | { kind: 'applet'; appletId: string };
  /** Set by the host API, independently of the root invocation origin. */
  apiCaller?: { kind: 'mcp' } | { kind: 'applet'; appletId: string };
  signal?: AbortSignal;
  window?: string;
  source?: string;
}
/** Host-issued call identities bind input to the actual command and its lifetime. */
export class CommandContexts {
  private pending = new Map<
    string,
    {
      appletId: string;
      session?: string;
      controller: AbortController;
      window?: string;
      source?: string;
      valid?: () => boolean;
      origin?: InputInvocation['origin'];
    }
  >();
  async run<T>(
    appletId: string,
    invocation: InputInvocation | undefined,
    execute: (id: string) => Promise<T>,
    valid?: () => boolean,
  ): Promise<T> {
    const id = randomUUID();
    const entry = { appletId, ...invocation, valid, controller: new AbortController() };
    const cancel = () => entry.controller.abort();
    invocation?.signal?.addEventListener('abort', cancel, { once: true });
    if (invocation?.signal?.aborted) cancel();
    this.pending.set(id, entry);
    try {
      return await execute(id);
    } finally {
      invocation?.signal?.removeEventListener('abort', cancel);
      entry.controller.abort();
      this.pending.delete(id);
    }
  }
  get(appletId: string, id: unknown): InputInvocation {
    if (id === undefined || id === null) {
      if (
        [...this.pending.values()].some(
          (e) => e.appletId === appletId && e.origin && e.origin.kind !== 'local',
        )
      )
        throw Error('外部起点のコマンド処理にはホスト発行の実行情報が必要です。');
      return {};
    }
    const entry = typeof id === 'string' ? this.pending.get(id) : undefined;
    if (!entry || entry.appletId !== appletId) throw Error('コマンドの実行情報が失効しています。');
    if (entry.valid && !entry.valid()) {
      entry.controller.abort();
      throw Error('コマンドのShell対象が失効しています。');
    }
    return {
      signal: entry.controller.signal,
      window: entry.window,
      source: entry.source,
      session: entry.session,
      origin: entry.origin,
    };
  }
  cancel(session: string) {
    for (const e of this.pending.values()) if (e.session === session) e.controller.abort();
  }
  stop(appletId: string) {
    for (const e of this.pending.values()) if (e.appletId === appletId) e.controller.abort();
  }
}

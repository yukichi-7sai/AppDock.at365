import { hostText } from '../../shared/i18n';
import { createHash, randomUUID } from 'node:crypto';
import {
  aiObject,
  aiString,
  aiMessages,
  parseAiSettings,
  aiTokenLimit,
  aiTimeoutLimits,
  type AiConnectionSettings,
  type AiSettings,
  type AiJob,
  type AiGenerateInput,
} from '../../shared/ai';
import { AiOpenAiChat, AiError, aiFail } from './ai-openai-chat';
export const aiLimits = {
  capacity: 16,
  ownerCapacity: 4,
  parallel: 2,
  records: 512,
  retentionMs: 1800000,
  resultCount: 64,
  resultMs: 60000,
  modelMs: 5000,
  modelLists: 8,
  burst: 3,
  perMinute: 30,
};
type Record = {
  owner: string;
  connectionId: string;
  requestId: string;
  fingerprint: string;
  view: AiJob;
  c?: AiConnectionSettings;
  body?: string;
  key?: string;
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  resultTimer?: ReturnType<typeof setTimeout>;
  retentionTimer?: ReturnType<typeof setTimeout>;
  ended?: number;
  deadline: number;
  configSignature: string;
};
type Kind = 'generate' | 'models' | 'read' | 'cancel';
export class AiService {
  private records = new Map<string, Record>();
  private queue: Record[] = [];
  private active = new Set<Record>();
  private lists = new Map<
    string,
    { owner: string; c: AiConnectionSettings; abort: AbortController; promise: Promise<unknown> }
  >();
  private rates = new Map<string, { tokens: number; at: number }>();
  private closed = false;
  private limits: typeof aiLimits;
  private adapter: AiOpenAiChat;
  private signature: string;
  constructor(
    private options: {
      settings(): AiSettings;
      key(c: AiConnectionSettings): string | undefined;
      canUse(owner: string, kind: Kind): boolean;
      changed?(): void;
      audit?(owner: string, id: string, state: string, code?: string): void;
      failed?(owner: string, id: string, error: { code: string; message: string }): void;
      fetcher?: typeof fetch;
      limits?: Partial<typeof aiLimits>;
    },
  ) {
    this.limits = { ...aiLimits, ...options.limits };
    this.adapter = new AiOpenAiChat(options.fetcher);
    this.signature = JSON.stringify(options.settings());
  }
  private authorize(owner: string, kind: Kind) {
    if (this.closed) aiFail('NOT_READY', hostText('services.aiService.closed'));
    if (!this.options.canUse(owner, kind))
      aiFail('API_DISABLED', hostText('services.aiService.permission'));
  }
  private connection(id: unknown) {
    const settings = parseAiSettings(this.options.settings());
    const selected = id ?? settings.defaultConnectionId;
    if (id !== undefined && (typeof id !== 'string' || !id))
      aiFail('INVALID_ARGUMENT', hostText('services.aiService.connectionId'));
    const c = settings.connections.find((c) => c.id === selected);
    if (!c || !c.baseUrl)
      return aiFail('AI_NOT_CONFIGURED', hostText('services.aiService.configureConnection'));
    let key: string | undefined;
    try {
      key = c.authentication === 'bearer' ? this.options.key(c) : undefined;
    } catch {
      return aiFail('AI_AUTH_FAILED', hostText('services.aiService.resetKey'));
    }
    if (c.authentication === 'bearer' && !key)
      aiFail('AI_AUTH_FAILED', hostText('services.aiService.configureKey'));
    return { settings, c, key };
  }
  private prune() {
    const ended = [...this.records.values()]
      .filter((j) => j.ended !== undefined)
      .sort((a, b) => a.ended! - b.ended!);
    const results = ended.filter((j) => j.view.text !== undefined);
    for (let i = 0; i < results.length; i++)
      if (
        Date.now() - results[i].ended! >= this.limits.resultMs ||
        i < results.length - this.limits.resultCount
      ) {
        delete results[i].view.text;
        delete results[i].view.usage;
        results[i].view.resultExpired = true;
      }
    for (let i = 0; i < ended.length; i++)
      if (
        Date.now() - ended[i].ended! >= this.limits.retentionMs ||
        i < ended.length - this.limits.records
      ) {
        clearTimeout(ended[i].resultTimer);
        clearTimeout(ended[i].retentionTimer);
        this.records.delete(ended[i].view.jobId);
      }
  }
  generate(owner: string, value: unknown): AiJob & { completion: 'accepted' } {
    this.authorize(owner, 'generate');
    if (
      !aiObject(value) ||
      Object.keys(value).some(
        (k) =>
          ![
            'requestId',
            'connectionId',
            'model',
            'additionalPrompt',
            'input',
            'timeoutMs',
            'maxOutputTokens',
          ].includes(k),
      ) ||
      typeof value.requestId !== 'string' ||
      !value.requestId ||
      value.requestId.length > 100 ||
      /[\x00-\x1f\x7f]/.test(value.requestId) ||
      (value.model !== undefined &&
        (!aiString(value.model, 200) || !value.model.trim() || /[\r\n]/.test(value.model))) ||
      !aiString(value.additionalPrompt ?? '', 2048) ||
      !aiString(value.input ?? '', 8192) ||
      (value.timeoutMs !== undefined &&
        (!Number.isInteger(value.timeoutMs) ||
          Number(value.timeoutMs) < aiTimeoutLimits.minimumSeconds * 1000 ||
          Number(value.timeoutMs) > aiTimeoutLimits.maximumSeconds * 1000)) ||
      (value.maxOutputTokens !== undefined && !aiTokenLimit(value.maxOutputTokens))
    )
      return aiFail('INVALID_ARGUMENT', hostText('services.aiService.requestFormat'));
    const input = {
      ...value,
      additionalPrompt: value.additionalPrompt ?? '',
      input: value.input ?? '',
    } as unknown as AiGenerateInput & { additionalPrompt: string; input: string };
    // Canonical fields make idempotency independent of JSON property order.
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          input.connectionId ?? null,
          input.model ?? null,
          input.additionalPrompt,
          input.input,
          input.timeoutMs ?? null,
          input.maxOutputTokens ?? null,
        ]),
      )
      .digest('hex');
    this.prune();
    const prior = [...this.records.values()].find(
      (j) => j.owner === owner && j.requestId === input.requestId,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        aiFail('AI_REQUEST_CONFLICT', hostText('services.aiService.requestIdConflict'));
      return { ...this.view(prior), completion: 'accepted' };
    }
    const { settings, c, key } = this.connection(input.connectionId);
    const model = input.model ?? c.defaultModel;
    if (!model?.trim())
      return aiFail('AI_MODEL_REQUIRED', hostText('services.aiService.selectModel'));
    if (![settings.commonPrompt, input.additionalPrompt, input.input].some((v) => v.trim()))
      aiFail('INVALID_ARGUMENT', hostText('services.aiService.promptRequired'));
    const pending = [...this.records.values()].filter((j) => j.ended === undefined);
    if (
      pending.length >= this.limits.capacity ||
      pending.filter((j) => j.owner === owner).length >= this.limits.ownerCapacity
    )
      aiFail('AI_QUEUE_FULL', hostText('services.aiService.queueLimit'));
    const body = JSON.stringify({
      model,
      messages: aiMessages(settings.commonPrompt, input.additionalPrompt, input.input),
      stream: false,
      [c.compatibility.tokenLimitField]: input.maxOutputTokens ?? c.defaultMaxOutputTokens,
      ...(c.compatibility.temperature === undefined
        ? {}
        : { temperature: c.compatibility.temperature }),
      ...(c.compatibility.reasoningEffort === undefined
        ? {}
        : { reasoning_effort: c.compatibility.reasoningEffort }),
      ...(c.compatibility.store === 'false' ? { store: false } : {}),
    });
    if (Buffer.byteLength(body) > 65536)
      aiFail('INVALID_ARGUMENT', hostText('services.aiService.requestSize'));
    const now = Date.now();
    const rate = this.rates.get(c.id) ?? { tokens: this.limits.burst, at: now };
    rate.tokens = Math.min(
      this.limits.burst,
      rate.tokens + ((now - rate.at) * this.limits.perMinute) / 60000,
    );
    rate.at = now;
    this.rates.set(c.id, rate);
    if (rate.tokens < 1) aiFail('AI_RATE_LIMITED', hostText('services.aiService.rateLimit'));
    rate.tokens--;
    const time = new Date(now).toISOString();
    const j: Record = {
      owner,
      connectionId: c.id,
      requestId: input.requestId,
      fingerprint,
      c,
      body,
      key,
      abort: new AbortController(),
      deadline: now + (input.timeoutMs ?? c.defaultTimeoutSeconds * 1000),
      configSignature: JSON.stringify([settings.commonPrompt, c]),
      view: {
        jobId: randomUUID(),
        state: 'queued',
        model,
        connectionId: c.id,
        createdAt: time,
        updatedAt: time,
      },
    };
    j.timer = setTimeout(() => {
      this.finish(j, 'failed', new AiError('AI_TIMEOUT', hostText('services.aiService.timeout')));
      j.abort.abort();
    }, j.deadline - now);
    this.records.set(j.view.jobId, j);
    this.queue.push(j);
    this.options.changed?.();
    queueMicrotask(() => this.pump());
    return { ...j.view, completion: 'accepted' };
  }
  private view(j: Record): AiJob {
    return structuredClone(j.view);
  }
  get(owner: string, id: unknown): AiJob {
    this.authorize(owner, 'read');
    this.prune();
    const j = typeof id === 'string' ? this.records.get(id) : undefined;
    if (!j || j.owner !== owner)
      return aiFail('NOT_FOUND', hostText('services.aiService.jobMissing'));
    return this.view(j);
  }
  cancel(owner: string, id: unknown): AiJob {
    this.authorize(owner, 'cancel');
    this.get(owner, id);
    const j = this.records.get(id as string)!;
    if (j.ended === undefined) {
      this.finish(j, 'canceled');
      j.abort.abort();
    }
    return this.view(j);
  }
  private finish(j: Record, state: 'completed' | 'failed' | 'canceled', error?: AiError) {
    if (j.ended !== undefined) return;
    clearTimeout(j.timer);
    j.ended = Date.now();
    j.view.state = state;
    j.view.updatedAt = new Date().toISOString();
    if (error) j.view.error = { code: error.code, message: error.message };
    j.body = j.key = undefined;
    j.c = undefined;
    this.queue = this.queue.filter((v) => v !== j);
    this.options.audit?.(j.owner, j.view.jobId, state, error?.code);
    if (state === 'failed' && j.view.error) {
      try {
        this.options.failed?.(j.owner, j.view.jobId, { ...j.view.error });
      } catch {
        // Reporting failures must not alter the terminal job or strand its queue.
      }
    }
    if (j.view.text !== undefined)
      j.resultTimer = setTimeout(() => {
        delete j.view.text;
        delete j.view.usage;
        j.view.resultExpired = true;
        this.options.changed?.();
      }, this.limits.resultMs);
    j.retentionTimer = setTimeout(() => this.prune(), this.limits.retentionMs);
    j.resultTimer?.unref();
    j.retentionTimer.unref();
    this.prune();
    this.options.changed?.();
    queueMicrotask(() => this.pump());
  }
  private valid(j: Record) {
    if (!j.c || !this.options.canUse(j.owner, 'generate')) return false;
    const current = this.options.settings();
    const c = current.connections.find((v) => v.id === j.c!.id);
    return !!c && JSON.stringify([current.commonPrompt, c]) === j.configSignature;
  }
  private pump() {
    if (this.closed) return;
    while (this.active.size < this.limits.parallel) {
      const index = this.queue.findIndex(
        (j) =>
          j.ended === undefined && ![...this.active].some((a) => a.connectionId === j.connectionId),
      );
      if (index < 0) return;
      const j = this.queue.splice(index, 1)[0];
      if (!this.valid(j)) {
        this.finish(j, 'canceled');
        continue;
      }
      if (Date.now() >= j.deadline) {
        this.finish(j, 'failed', new AiError('AI_TIMEOUT', hostText('services.aiService.timeout')));
        continue;
      }
      this.active.add(j);
      j.view.state = 'running';
      j.view.updatedAt = new Date().toISOString();
      this.options.changed?.();
      // Keep the network slot until the aborted transport actually settles.
      const c = j.c!,
        key = j.key,
        body = j.body!;
      void this.adapter
        .generate(c, key, body, j.abort.signal)
        .then((result) => {
          if (j.ended !== undefined) return;
          if (!this.valid(j)) {
            this.finish(j, 'canceled');
            return;
          }
          if (Date.now() >= j.deadline) {
            this.finish(
              j,
              'failed',
              new AiError('AI_TIMEOUT', hostText('services.aiService.timeout')),
            );
            return;
          }
          Object.assign(j.view, result);
          this.finish(j, 'completed');
        })
        .catch((e) => {
          if (j.ended === undefined)
            this.finish(
              j,
              'failed',
              e instanceof AiError
                ? e
                : new AiError(
                    'AI_CONNECTION_FAILED',
                    hostText('services.aiService.generationFailed'),
                  ),
            );
        })
        .finally(() => {
          this.active.delete(j);
          this.pump();
        });
    }
  }
  models(owner: string, id?: unknown): Promise<{ models: import('../../shared/ai').AiModel[] }> {
    this.authorize(owner, 'models');
    const { c, key } = this.connection(id);
    const identity = JSON.stringify([owner, c.id]);
    const prior = this.lists.get(identity);
    if (prior) return prior.promise as ReturnType<AiOpenAiChat['models']>;
    if (this.lists.size >= this.limits.modelLists)
      aiFail('AI_QUEUE_FULL', hostText('services.aiService.listQueueLimit'));
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.limits.modelMs);
    const promise = this.adapter
      .models(c, key, abort.signal)
      .then((value) => {
        this.authorize(owner, 'models');
        if (
          abort.signal.aborted ||
          JSON.stringify(this.options.settings().connections.find((v) => v.id === c.id)) !==
            JSON.stringify(c)
        )
          return aiFail('AI_CANCELED', hostText('services.aiService.staleList'));
        return value;
      })
      .finally(() => {
        clearTimeout(timer);
        this.lists.delete(identity);
      });
    this.lists.set(identity, { owner, c, abort, promise });
    return promise;
  }
  reconcile(keyChanged: boolean | string = false) {
    const current = this.options.settings(),
      signature = JSON.stringify(current),
      changed = signature !== this.signature;
    this.signature = signature;
    for (const j of this.records.values()) {
      if (
        j.ended === undefined &&
        (keyChanged === true || keyChanged === j.connectionId || !this.valid(j))
      ) {
        this.finish(j, 'canceled');
        j.abort.abort();
      }
      const currentConnection = current.connections.find((c) => c.id === j.connectionId);
      if (!this.options.canUse(j.owner, 'generate') || !currentConnection) {
        delete j.view.text;
        delete j.view.usage;
        if (j.view.state === 'completed') j.view.resultExpired = true;
      }
    }
    for (const list of this.lists.values())
      if (
        changed ||
        keyChanged === true ||
        keyChanged === list.c.id ||
        !this.options.canUse(list.owner, 'models')
      )
        list.abort.abort();
    for (const id of this.rates.keys())
      if (!current.connections.some((c) => c.id === id)) this.rates.delete(id);
    this.prune();
  }
  forgetOwner(owner: string) {
    for (const j of [...this.records.values()])
      if (j.owner === owner) {
        this.finish(j, 'canceled');
        j.abort.abort();
        clearTimeout(j.resultTimer);
        clearTimeout(j.retentionTimer);
        this.records.delete(j.view.jobId);
      }
    for (const list of this.lists.values()) if (list.owner === owner) list.abort.abort();
  }
  close() {
    this.closed = true;
    for (const j of this.records.values()) {
      this.finish(j, 'canceled');
      j.abort.abort();
      clearTimeout(j.resultTimer);
      clearTimeout(j.retentionTimer);
      delete j.view.text;
      delete j.view.usage;
    }
    for (const list of this.lists.values()) list.abort.abort();
    this.records.clear();
  }
}

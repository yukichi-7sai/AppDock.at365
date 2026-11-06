import { generationConnectionAllowed, generationConfigurationSignature } from './generation-access';
import type { ImageRegistrar, RegistrationImage } from './image-registration';
import type { ImageRegistrationDestination } from '../../shared/image-ai';
import { createHash, randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import { aiObject } from '../../shared/ai';
import {
  parseImageAiSettings,
  parseImageOptions,
  imageReadChunkBytes,
  type ImageAiSettings,
  type ImageAiConnection,
  type ImageAiJob,
  type ImageGenerateInput,
  type ImageReadResult,
  type ImageAiConnectionsResult,
} from '../../shared/image-ai';
import {
  ImageAiError,
  imageFail,
  OpenAiImageAdapter,
  type ImageAdapter,
  type ImageAdapterRequest,
} from './image-ai-adapter';

type Kind = 'generate' | 'register' | 'read' | 'result' | 'cancel';
type Job = {
  owner: string;
  requestId: string;
  fingerprint: string;
  connection: ImageAiConnection;
  signature: string;
  view: ImageAiJob;
  abort: AbortController;
  request?: ImageAdapterRequest;
  key?: string;
  images?: RegistrationImage[];
  destination?: ImageRegistrationDestination;
  saving?: Promise<void>;
  deadline: number;
  timer?: ReturnType<typeof setTimeout>;
  resultTimer?: ReturnType<typeof setTimeout>;
  retentionTimer?: ReturnType<typeof setTimeout>;
};
const terminal = (j: Job) => !['queued', 'running', 'saving'].includes(j.view.state);
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : aiObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, stable(value[k])]),
        )
      : value;
export class ImageAiService {
  private jobs = new Map<string, Job>();
  private active = new Set<Job>();
  private adapters: Map<string, ImageAdapter>;
  private closed = false;
  constructor(
    private options: {
      settings(): ImageAiSettings;
      key(c: ImageAiConnection): string | undefined;
      canUse(owner: string, kind: Kind): boolean;
      changed?(): void;
      failed?(owner: string, id: string, error: { code: string; message: string }): void;
      fetcher?: typeof fetch;
      validateImage?(bytes: Buffer): Promise<unknown>;
      adapters?: ImageAdapter[];
      resultMs?: number;
      retentionMs?: number;
      registration?: ImageRegistrar;
    },
  ) {
    this.adapters = new Map(
      (options.adapters ?? [new OpenAiImageAdapter(options.fetcher)]).map((a) => [a.protocol, a]),
    );
  }
  private authorize(owner: string, kind: Kind) {
    if (this.closed || !this.options.canUse(owner, kind)) imageFail('API_DISABLED', 'permission');
  }
  connections(owner: string): ImageAiConnectionsResult {
    this.authorize(owner, 'result');
    const settings = parseImageAiSettings(this.options.settings());
    return {
      defaultConnectionId: generationConnectionAllowed(
        owner,
        settings.connections.find((c) => c.id === settings.defaultConnectionId),
      )
        ? settings.defaultConnectionId
        : undefined,
      connections: settings.connections
        .filter((c) => this.adapters.has(c.protocol) && generationConnectionAllowed(owner, c))
        .map((c) => ({
          id: c.id,
          name: c.name,
          protocol: c.protocol,
          defaultModel: c.defaultModel,
          capabilities: structuredClone(this.adapters.get(c.protocol)!.capabilities),
        })),
    };
  }
  generate(owner: string, value: unknown): ImageAiJob & { completion: 'accepted' } {
    return this.start(owner, value, false);
  }
  generateAndRegister(owner: string, value: unknown): ImageAiJob & { completion: 'accepted' } {
    this.authorize(owner, 'register');
    return this.start(owner, value, true);
  }
  private start(
    owner: string,
    value: unknown,
    register: boolean,
  ): ImageAiJob & { completion: 'accepted' } {
    this.authorize(owner, 'generate');
    if (
      !aiObject(value) ||
      Object.keys(value).some(
        (k) =>
          ![
            'requestId',
            'connectionId',
            'additionalPrompt',
            'input',
            'options',
            ...(register ? ['destination'] : []),
          ].includes(k),
      ) ||
      typeof value.requestId !== 'string' ||
      !value.requestId ||
      value.requestId.length > 100 ||
      /[\x00-\x1f\x7f]/.test(value.requestId) ||
      (value.connectionId !== undefined &&
        (typeof value.connectionId !== 'string' || !value.connectionId)) ||
      (value.additionalPrompt !== undefined && typeof value.additionalPrompt !== 'string') ||
      (value.input !== undefined && typeof value.input !== 'string') ||
      (value.options !== undefined && !aiObject(value.options))
    )
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    const input = value as unknown as ImageGenerateInput;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(stable({ register, input })))
      .digest('hex');
    const prior = [...this.jobs.values()].find(
      (j) => j.owner === owner && j.requestId === input.requestId,
    );
    if (prior) {
      if (
        !generationConnectionAllowed(
          owner,
          this.options.settings().connections.find((c) => c.id === prior.connection.id),
        )
      )
        imageFail('API_DISABLED', 'permission');
      if (prior.fingerprint !== fingerprint) imageFail('IMAGE_AI_REQUEST_CONFLICT', 'conflict');
      return { ...this.get(owner, prior.view.jobId), completion: 'accepted' };
    }
    const destination = register
      ? this.options.registration?.validate(value.destination)
      : undefined;
    if (register && !destination) return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    const settings = parseImageAiSettings(this.options.settings());
    const c = settings.connections.find(
      (c) => c.id === (input.connectionId ?? settings.defaultConnectionId),
    );
    if (!c && input.connectionId !== undefined) return imageFail('NOT_FOUND', 'notConfigured');
    if (!c || !this.adapters.has(c.protocol))
      return imageFail('IMAGE_AI_NOT_CONFIGURED', 'notConfigured');
    if (!generationConnectionAllowed(owner, c)) imageFail('API_DISABLED', 'permission');
    let key: string | undefined;
    try {
      key = c.authentication === 'bearer' ? this.options.key(c) : undefined;
    } catch {
      return imageFail('IMAGE_AI_AUTH_FAILED', 'authentication');
    }
    if (c.authentication === 'bearer' && !key) imageFail('IMAGE_AI_AUTH_FAILED', 'authentication');
    const prompt = [c.alwaysPrompt, input.additionalPrompt ?? c.defaultPrompt, input.input ?? '']
      .filter((p) => p.trim())
      .join('\n');
    const model = c.defaultModel;
    if (!model.trim() || !prompt.trim()) return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    let generationOptions;
    try {
      if (input.options?.providerOptions !== undefined && !aiObject(input.options.providerOptions))
        return imageFail('INVALID_ARGUMENT', 'invalidRequest');
      generationOptions = parseImageOptions({
        ...c.defaults,
        ...input.options,
        providerOptions: { ...c.defaults.providerOptions, ...input.options?.providerOptions },
      });
    } catch {
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    }
    this.adapters.get(c.protocol)!.validate?.({ model, prompt, options: generationOptions });
    const now = Date.now(),
      time = new Date(now).toISOString();
    const job: Job = {
      owner,
      requestId: input.requestId,
      fingerprint,
      destination,
      connection: c,
      signature: generationConfigurationSignature(c),
      key,
      request: { model, prompt, options: generationOptions },
      abort: new AbortController(),
      deadline: now + c.timeoutSeconds * 1000,
      view: {
        jobId: randomUUID(),
        connectionId: c.id,
        model,
        state: 'queued',
        createdAt: time,
        updatedAt: time,
      },
    };
    job.timer = setTimeout(() => {
      this.finish(job, 'failed', new ImageAiError('IMAGE_AI_TIMEOUT', this.timeoutMessage()));
      job.abort.abort();
    }, c.timeoutSeconds * 1000);
    this.jobs.set(job.view.jobId, job);
    this.options.changed?.();
    queueMicrotask(() => this.pump());
    return { ...job.view, completion: 'accepted' };
  }
  private timeoutMessage() {
    return hostText('imageAi.timeout');
  }
  private owned(owner: string, id: unknown) {
    this.authorize(owner, 'read');
    const j = typeof id === 'string' ? this.jobs.get(id) : undefined;
    if (!j || j.owner !== owner) return imageFail('NOT_FOUND', 'missing');
    return j;
  }
  get(owner: string, id: unknown): ImageAiJob {
    return structuredClone(this.owned(owner, id).view);
  }
  read(owner: string, value: unknown): ImageReadResult {
    this.authorize(owner, 'result');
    if (
      !aiObject(value) ||
      Object.keys(value).some((k) => !['jobId', 'imageId', 'offset'].includes(k))
    )
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    const j = this.owned(owner, value.jobId);
    if (
      j.view.resultExpired ||
      (j.view.resultExpiresAt && Date.now() >= Date.parse(j.view.resultExpiresAt))
    )
      return imageFail('IMAGE_AI_RESULT_EXPIRED', 'expired');
    const img = j.images?.find((i) => i.id === value.imageId);
    if (!img?.bytes || j.destination || j.view.state !== 'completed')
      return imageFail('NOT_FOUND', 'missing');
    const offset = value.offset ?? 0;
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > img.bytes.length)
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    const end = Math.min(Number(offset) + imageReadChunkBytes, img.bytes.length);
    return {
      id: img.id,
      mimeType: img.mimeType,
      byteLength: img.bytes.length,
      offset: Number(offset),
      nextOffset: end,
      done: end === img.bytes.length,
      data: img.bytes.subarray(Number(offset), end).toString('base64'),
    };
  }
  cancel(owner: string, id: unknown): ImageAiJob {
    this.authorize(owner, 'cancel');
    const j = this.owned(owner, id);
    if (!terminal(j) || j.view.state === 'unsaved') {
      this.finish(j, 'canceled');
      j.abort.abort();
    }
    return structuredClone(j.view);
  }
  retrySave(owner: string, id: unknown): ImageAiJob {
    this.authorize(owner, 'register');
    const j = this.owned(owner, id);
    if (!j.destination) return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    if (j.view.state === 'saving' || j.view.state === 'completed') return structuredClone(j.view);
    if (j.view.state !== 'unsaved') return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    if (j.view.resultExpired || !j.images?.every((image) => image.ref || image.bytes))
      return imageFail('IMAGE_AI_RESULT_EXPIRED', 'expired');
    if (!this.valid(j)) return imageFail('API_DISABLED', 'permission');
    clearTimeout(j.retentionTimer);
    clearTimeout(j.resultTimer);
    void this.save(j);
    return structuredClone(j.view);
  }
  /** Internal surface disposal. Library files and public callers' jobs are untouched. */
  discard(owner: string, id: string) {
    const j = this.jobs.get(id);
    if (!j || j.owner !== owner) return;
    this.finish(j, 'canceled');
    j.abort.abort();
    this.expire(j);
  }
  private imageViews(j: Job) {
    j.view.images = j.images?.map((image) => ({
      id: image.id,
      mimeType: image.mimeType,
      byteLength: image.byteLength,
      ...(j.destination
        ? {
            ref: image.ref,
            registration: !image.ref
              ? ('pending' as const)
              : image.grouped
                ? ('saved' as const)
                : ('group-pending' as const),
          }
        : {}),
    }));
    j.view.updatedAt = new Date().toISOString();
  }
  private save(j: Job): Promise<void> {
    if (j.saving) return j.saving;
    j.view.state = 'saving';
    j.view.error = undefined;
    j.view.resultExpiresAt = undefined;
    this.options.changed?.();
    const writable = () => {
      if (j.abort.signal.aborted || this.closed || !this.valid(j))
        throw new DOMException('Cancelled', 'AbortError');
    };
    const task = Promise.resolve()
      .then(async () => {
        let failed = false;
        for (const image of j.images ?? []) {
          if (j.abort.signal.aborted || terminal(j)) break;
          if (image.ref && image.grouped) continue;
          try {
            await this.options.registration!.save(image, j.destination!, writable);
          } catch (error) {
            if ((error as Error).name === 'AbortError') {
              this.finish(j, 'canceled');
              break;
            }
            failed = true;
          } finally {
            this.imageViews(j);
            this.options.changed?.();
          }
        }
        // Release the attempt before publishing its terminal state. A changed observer may
        // immediately request a retry, which must not attach to the completed attempt.
        j.saving = undefined;
        if (!terminal(j))
          this.finish(
            j,
            failed ? 'unsaved' : 'completed',
            failed
              ? new ImageAiError('IMAGE_AI_SAVE_FAILED', hostText('imageAi.saveFailed'))
              : undefined,
          );
      })
      .finally(() => {
        if (j.saving === task) j.saving = undefined;
      });
    j.saving = task;
    return task;
  }
  private valid(j: Job) {
    return (
      this.options.canUse(j.owner, 'generate') &&
      (!j.destination || this.options.canUse(j.owner, 'register')) &&
      generationConnectionAllowed(
        j.owner,
        this.options.settings().connections.find((c) => c.id === j.connection.id),
      ) &&
      generationConfigurationSignature(
        this.options.settings().connections.find((c) => c.id === j.connection.id),
      ) === j.signature
    );
  }
  private expire(j: Job) {
    for (const image of j.images ?? []) image.bytes = undefined;
    if (j.view.state === 'completed' || j.view.state === 'unsaved') j.view.resultExpired = true;
  }
  private finish(
    j: Job,
    state: 'completed' | 'unsaved' | 'failed' | 'canceled',
    error?: ImageAiError,
  ) {
    if (terminal(j) && !(j.view.state === 'unsaved' && state === 'canceled')) return;
    clearTimeout(j.timer);
    clearTimeout(j.resultTimer);
    clearTimeout(j.retentionTimer);
    j.view.state = state;
    j.view.updatedAt = new Date().toISOString();
    j.request = undefined;
    j.key = undefined;
    j.view.resultExpiresAt = undefined;
    j.view.resultExpired = undefined;
    if (error) j.view.error = { code: error.code, message: error.message };
    if (state === 'unsaved' || (state === 'completed' && !j.destination)) {
      const resultMs = this.options.resultMs ?? 15 * 60 * 1000;
      j.view.resultExpiresAt = new Date(Date.now() + resultMs).toISOString();
      j.resultTimer = setTimeout(() => {
        this.expire(j);
        this.options.changed?.();
      }, resultMs);
      j.resultTimer.unref();
    } else if (j.destination) {
      for (const image of j.images ?? []) image.bytes = undefined;
    } else j.images = undefined;
    j.retentionTimer = setTimeout(
      () => {
        clearTimeout(j.resultTimer);
        this.jobs.delete(j.view.jobId);
        this.options.changed?.();
      },
      this.options.retentionMs ?? 30 * 60 * 1000,
    );
    j.retentionTimer.unref();
    if (error) {
      try {
        this.options.failed?.(j.owner, j.view.jobId, j.view.error!);
      } catch {
        /* Preserve the terminal result if reporting fails. */
      }
    }
    this.options.changed?.();
    queueMicrotask(() => this.pump());
  }
  private pump() {
    if (this.closed) return;
    // Schedule, rather than reject, independently accepted requests.
    for (const j of this.jobs.values()) {
      if (this.active.size >= 2) break;
      if (
        j.view.state !== 'queued' ||
        [...this.active].some((a) => a.connection.id === j.connection.id)
      )
        continue;
      if (!this.valid(j)) {
        this.finish(j, 'canceled');
        continue;
      }
      this.active.add(j);
      j.view.state = 'running';
      j.view.updatedAt = new Date().toISOString();
      this.options.changed?.();
      const adapter = this.adapters.get(j.connection.protocol)!;
      void adapter
        .generate(j.connection, j.key, j.request!, j.abort.signal)
        .then(async (images) => {
          if (terminal(j)) return;
          try {
            for (const image of images) {
              if (terminal(j)) return;
              await this.options.validateImage?.(image.bytes);
            }
          } catch {
            return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
          }
          if (terminal(j)) return;
          if (!this.valid(j)) {
            this.finish(j, 'canceled');
            return;
          }
          if (Date.now() >= j.deadline) {
            this.finish(j, 'failed', new ImageAiError('IMAGE_AI_TIMEOUT', this.timeoutMessage()));
            return;
          }
          j.images = images.map((i) => ({ ...i, id: randomUUID(), byteLength: i.bytes.length }));
          this.imageViews(j);
          if (j.destination) {
            clearTimeout(j.timer);
            await this.save(j);
          } else this.finish(j, 'completed');
        })
        .catch((error) => {
          if (!terminal(j)) {
            if (error instanceof ImageAiError) this.finish(j, 'failed', error);
            else
              this.finish(
                j,
                'failed',
                new ImageAiError(
                  'IMAGE_AI_CONNECTION_FAILED',
                  hostText('imageAi.connectionFailed'),
                ),
              );
          }
        })
        .finally(() => {
          this.active.delete(j);
          this.pump();
        });
    }
  }
  reconcile(keyChanged?: string) {
    for (const j of this.jobs.values()) {
      if (!terminal(j) && (keyChanged === j.connection.id || !this.valid(j))) {
        this.finish(j, 'canceled');
        j.abort.abort();
      }
      if (
        !this.options.canUse(j.owner, 'result') ||
        !this.options.settings().connections.some((c) => c.id === j.connection.id)
      )
        this.expire(j);
    }
  }
  forgetOwner(owner: string) {
    for (const j of this.jobs.values())
      if (j.owner === owner) {
        this.finish(j, 'canceled');
        j.abort.abort();
        clearTimeout(j.timer);
        clearTimeout(j.resultTimer);
        clearTimeout(j.retentionTimer);
        this.jobs.delete(j.view.jobId);
      }
  }
  close() {
    this.closed = true;
    for (const owner of new Set([...this.jobs.values()].map((j) => j.owner)))
      this.forgetOwner(owner);
  }
}

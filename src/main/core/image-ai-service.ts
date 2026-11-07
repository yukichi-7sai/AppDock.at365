import { generationConnectionAllowed, generationConfigurationSignature } from './generation-access';
import type { ImageRegistrar, RegistrationImage } from './image-registration';
import type { ImageRegistrationDestination } from '../../shared/image-ai';
import { GenerationStore, type GenerationRecord } from './generation-store';
import type { BackgroundJob, BackgroundJobs } from './background-jobs';
import type { ImageGenerationItem } from '../../shared/image-generation';
import { createHash, randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import { aiObject } from '../../shared/ai';
import { libraryReference, type LibraryRef } from '../../shared/library-assets';
import {
  parseImageAiSettings,
  parseImageOptions,
  imageReadChunkBytes,
  imageReferenceMaxCount,
  newImageAiConnection,
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
  type ImageAdapterImage,
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
  referenceImages?: LibraryRef[];
  key?: string;
  images?: RegistrationImage[];
  destination?: ImageRegistrationDestination;
  saving?: Promise<void>;
  deadline: number;
  timer?: ReturnType<typeof setTimeout>;
  resultTimer?: ReturnType<typeof setTimeout>;
  retentionTimer?: ReturnType<typeof setTimeout>;
  input: ImageGenerateInput;
  record?: GenerationRecord<ImageRecovery>;
  durable: Set<string>;
  storageError?: boolean;
  quarantined?: boolean;
  revoked?: boolean;
  task?: Promise<void>;
  rescued?: boolean;
  recovering?: boolean;
  inspecting?: Promise<void>;
  changedResults?: Set<string>;
};
interface ImageRecovery {
  view: ImageAiJob;
  input: ImageGenerateInput;
  server: string;
  destination?: ImageRegistrationDestination;
  images: Omit<RegistrationImage, 'bytes' | 'checkpoint'>[];
  quarantined?: boolean;
}
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
      readReference?(ref: LibraryRef, active: () => boolean): Promise<ImageAdapterImage>;
      adapters?: ImageAdapter[];
      store?: GenerationStore;
      background?: BackgroundJobs;
      registration?: ImageRegistrar;
    },
  ) {
    this.adapters = new Map(
      (options.adapters ?? [new OpenAiImageAdapter(options.fetcher)]).map((a) => [a.protocol, a]),
    );
    for (const record of options.store?.load<ImageRecovery>('image') ?? []) {
      try {
        const data = record.data;
        if (
          data.view.jobId !== record.id ||
          !Array.isArray(data.images) ||
          typeof data.input.input !== 'string' ||
          typeof data.server !== 'string' ||
          !['queued', 'running', 'saving', 'unsaved', 'completed', 'failed', 'canceled'].includes(
            data.view.state,
          )
        )
          throw Error('Invalid image recovery record');
        parseImageOptions(data.input.options);
        const connection = { ...newImageAiConnection(data.view.connectionId), name: data.server };
        const j: Job = {
          owner: 'recovery:' + record.id,
          requestId: record.id,
          fingerprint: '',
          connection,
          signature: '',
          view: structuredClone(data.view),
          input: data.input,
          destination: data.destination,
          images: data.images,
          record,
          durable: new Set(),
          abort: new AbortController(),
          deadline: 0,
          quarantined: data.quarantined,
          revoked: true,
        };
        for (const image of j.images ?? []) {
          try {
            options.store!.read(record, image.id);
            j.durable.add(image.id);
          } catch {
            j.storageError = true;
          }
          image.checkpoint = () => this.checkpoint(j);
        }
        if (['queued', 'running', 'saving'].includes(j.view.state)) {
          j.view.state = j.images?.length ? 'unsaved' : 'failed';
          j.view.error = {
            code: 'GENERATION_INTERRUPTED',
            message: hostText('generationJobs.interrupted'),
          };
        }
        this.jobs.set(record.id, j);
        j.changedResults = new Set();
        j.inspecting = Promise.all(
          (j.images ?? [])
            .filter((image) => image.ref && image.intent)
            .map(async (image) => {
              try {
                await this.options.registration?.restore?.(image);
              } catch {
                j.changedResults!.add(image.id);
                j.view.error = {
                  code: 'GENERATION_TARGET_CHANGED',
                  message: hostText('generationJobs.targetChanged'),
                };
              }
            }),
        )
          .then(() => {
            this.options.changed?.();
          })
          .finally(() => {
            j.inspecting = undefined;
          });
      } catch {
        options.store!.issues.push('Invalid image recovery record: ' + record.id);
      }
    }
    options.background?.register('image', {
      snapshot: () => this.backgroundSnapshot(),
      cancel: (id) => this.hostCancel(id),
      retry: (id) => this.hostRetry(id),
      close: () => this.close(),
      settle: () => this.settle(),
    });
  }
  private checkpoint(j: Job) {
    if (!this.options.store) return;
    const data: ImageRecovery = {
      view: structuredClone(j.view),
      input: j.input,
      server: j.connection.name,
      destination: j.destination,
      quarantined: j.quarantined,
      images: (j.images ?? []).map(({ bytes: _bytes, checkpoint: _checkpoint, ...image }) => image),
    };
    j.record ??= { version: 1, id: j.view.jobId, kind: 'image', data, results: [] };
    j.record.data = data;
    this.options.store.save(j.record);
  }
  private preserve(j: Job) {
    this.checkpoint(j);
    for (const image of j.images ?? []) {
      if (this.options.store && image.bytes && !j.durable.has(image.id)) {
        this.options.store.preserve(j.record!, image.id, image.mimeType, image.bytes);
        j.durable.add(image.id);
      }
    }
    j.storageError = false;
  }
  private bytes(j: Job, image: RegistrationImage) {
    return image.bytes ?? this.options.store?.read(j.record!, image.id);
  }
  hostItems(): ImageGenerationItem[] {
    return [...this.jobs.values()].reverse().map((j) => ({
      job: structuredClone(j.view),
      input: j.input.input,
      referenceImages: j.input.referenceImages ?? [],
      options: parseImageOptions(j.input.options ?? j.connection.defaults),
      server: j.connection.name,
      folder: j.destination?.folder ?? '',
      entries: [],
    }));
  }
  hostGet(id: string) {
    return structuredClone(this.hostJob(id).view);
  }
  hostResultChanged(id: string, imageId: string) {
    const j = this.hostJob(id);
    return !!j.inspecting || !!j.changedResults?.has(imageId);
  }
  hostRescued(id: string) {
    this.hostJob(id).rescued = true;
  }
  hostDiscard(id: string) {
    const j = this.hostJob(id);
    if (this.active.has(j) || j.saving || j.inspecting || !terminal(j))
      throw Error(hostText('imageGeneration.busy'));
    if (j.record) this.options.store?.discard(j.record);
    this.jobs.delete(id);
    this.options.changed?.();
  }
  get recoveryError() {
    return this.options.store?.issues.length
      ? hostText('generationJobs.recoveryFailed')
      : undefined;
  }
  hostRetarget(id: string, imageId: string, ref: LibraryRef, generation?: string) {
    const j = this.hostJob(id),
      image = j.images?.find((value) => value.id === imageId);
    if (!image) return;
    image.ref = ref;
    image.generation = generation;
    if (image.intent) image.intent.file = ref.file;
    this.imageViews(j);
    this.checkpoint(j);
  }
  private hostJob(id: string) {
    const j = this.jobs.get(id);
    if (!j) return imageFail('NOT_FOUND', 'missing');
    return j;
  }
  hostCancel(id: string) {
    const j = this.hostJob(id);
    if (!terminal(j)) {
      this.finish(j, 'canceled');
      j.abort.abort();
    }
  }
  async hostRetry(id: string, destination?: ImageRegistrationDestination) {
    this.options.background?.assertAccepting();
    const j = this.hostJob(id);
    await j.inspecting;
    this.options.background?.assertAccepting();
    if (j.saving || this.active.has(j)) return;
    if (j.changedResults?.size) throw Error(hostText('generationJobs.targetChanged'));
    if (!j.images?.length || j.quarantined) return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    if (destination) j.destination = this.options.registration!.validate(destination);
    if (!j.destination) j.destination = this.options.registration!.validate({ folder: '' });
    // Trusted UI recovery grants no access to the previous external owner or authentication lease.
    j.owner = 'host';
    j.revoked = false;
    j.abort = new AbortController();
    j.recovering = true;
    this.preserve(j);
    void this.save(j, true);
  }
  hostExport(id: string): { id: string; mimeType: string; bytes: Buffer }[] {
    const j = this.hostJob(id);
    return (j.images ?? []).map((image) => ({
      id: image.id,
      mimeType: image.mimeType,
      bytes: this.bytes(j, image)!,
    }));
  }
  backgroundSnapshot(): BackgroundJob[] {
    return [...this.jobs.values()].map((j) => {
      const active = this.active.has(j) || !!j.saving || !terminal(j);
      const pending = (j.images ?? []).filter((image) => !image.ref || !image.grouped);
      return {
        jobId: j.view.jobId,
        kind: 'image',
        owner: j.owner,
        origin: 'image-generation',
        state: active
          ? j.abort.signal.aborted
            ? 'canceling'
            : j.view.state === 'queued'
              ? 'queued'
              : 'running'
          : j.storageError || pending.length || j.view.state === 'unsaved'
            ? 'attention'
            : (j.view.state as 'completed' | 'failed' | 'canceled'),
        phase: j.view.state,
        createdAt: j.view.createdAt,
        updatedAt: j.view.updatedAt,
        actions: active
          ? ['cancel', 'details']
          : pending.length
            ? ['retry', 'details']
            : ['details'],
        shutdownImpact: {
          active,
          preserved: j.durable.size,
          volatile: j.rescued
            ? 0
            : (j.images ?? []).filter((image) => image.bytes && !j.durable.has(image.id)).length,
        },
        resultSummary: { saved: (j.images?.length ?? 0) - pending.length, pending: pending.length },
        error: j.view.error,
      };
    });
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
    this.options.background?.assertAccepting();
    if ([...this.jobs.values()].some((j) => j.storageError))
      throw Error(hostText('generationJobs.storageFailed'));
    this.options.store?.preflight();
    if (
      !aiObject(value) ||
      Object.keys(value).some(
        (k) =>
          ![
            'requestId',
            'connectionId',
            'referenceImages',
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
      typeof value.input !== 'string' ||
      !value.input.trim() ||
      (value.referenceImages !== undefined &&
        (!Array.isArray(value.referenceImages) ||
          value.referenceImages.length > imageReferenceMaxCount ||
          value.referenceImages.some((ref) => !libraryReference(ref, 'image')))) ||
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
    const prompt = input.input;
    if (
      input.referenceImages?.length &&
      (!this.options.readReference || !this.adapters.get(c.protocol)!.capabilities.imageEditing)
    )
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
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
      input: structuredClone({ ...input, options: generationOptions }),
      durable: new Set(),
      requestId: input.requestId,
      fingerprint,
      destination,
      connection: c,
      signature: generationConfigurationSignature(c),
      key,
      request: { model, prompt, options: generationOptions },
      referenceImages: structuredClone(input.referenceImages),
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
    this.checkpoint(job);
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
    if (!j || j.owner !== owner || j.revoked) return imageFail('NOT_FOUND', 'missing');
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
    if (!img || j.destination || j.view.state !== 'completed' || j.quarantined)
      return imageFail('NOT_FOUND', 'missing');
    const bytes = this.bytes(j, img);
    if (!bytes) return imageFail('NOT_FOUND', 'missing');
    const offset = value.offset ?? 0;
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > bytes.length)
      return imageFail('INVALID_ARGUMENT', 'invalidRequest');
    const end = Math.min(Number(offset) + imageReadChunkBytes, bytes.length);
    return {
      id: img.id,
      mimeType: img.mimeType,
      byteLength: bytes.length,
      offset: Number(offset),
      nextOffset: end,
      done: end === bytes.length,
      data: bytes.subarray(Number(offset), end).toString('base64'),
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
    if (
      j.quarantined ||
      !j.images?.every((image) => image.ref || image.bytes || j.durable.has(image.id))
    )
      return imageFail('IMAGE_AI_RESULT_EXPIRED', 'expired');
    if (!this.valid(j)) return imageFail('API_DISABLED', 'permission');
    j.abort = new AbortController();
    this.preserve(j);
    clearTimeout(j.retentionTimer);
    clearTimeout(j.resultTimer);
    void this.save(j);
    return structuredClone(j.view);
  }
  /** Detaching a preview cannot discard a generated result. */
  discard(owner: string, id: string) {
    const j = this.jobs.get(id);
    if (!j || j.owner !== owner) return;
    this.finish(j, 'canceled');
    j.abort.abort();
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
  private save(j: Job, recovery = false): Promise<void> {
    if (j.saving) return j.saving;
    j.view.state = 'saving';
    j.view.error = undefined;
    j.view.resultExpiresAt = undefined;
    this.options.changed?.();
    const writable = () => {
      if (
        j.abort.signal.aborted ||
        this.closed ||
        (recovery ? !this.options.canUse('host', 'register') : !this.valid(j))
      )
        throw new DOMException('Cancelled', 'AbortError');
    };
    const task = Promise.resolve()
      .then(async () => {
        let failed = false;
        for (const image of j.images ?? []) {
          if (j.abort.signal.aborted || terminal(j)) break;
          if (image.ref && image.grouped) continue;
          try {
            image.bytes ??= this.bytes(j, image);
            await this.options.registration!.save(image, j.destination!, writable);
            if (j.durable.has(image.id)) image.bytes = undefined;
          } catch (error) {
            if ((error as Error).name === 'AbortError') {
              this.finish(j, 'canceled');
              break;
            }
            failed = true;
          } finally {
            this.imageViews(j);
            try {
              this.checkpoint(j);
            } catch {
              failed = true;
              j.storageError = true;
            }
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
    if (j.recovering) return this.options.canUse('host', 'register');
    return (
      !j.revoked &&
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
    j.referenceImages = undefined;
    j.key = undefined;
    j.view.resultExpiresAt = undefined;
    j.view.resultExpired = undefined;
    if (error) j.view.error = { code: error.code, message: error.message };
    try {
      this.checkpoint(j);
    } catch {
      j.storageError = true;
      j.view.error = {
        code: 'GENERATION_STORAGE_FAILED',
        message: hostText('generationJobs.storageFailed'),
      };
    }
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
      j.task = Promise.resolve()
        .then(async () => {
          const active = () => !terminal(j) && !j.abort.signal.aborted && this.valid(j);
          const request = j.request;
          if (!request || !active()) return [];
          const referenceImages: ImageAdapterImage[] = [];
          for (const ref of j.referenceImages ?? []) {
            if (!active()) return [];
            referenceImages.push(await this.options.readReference!(ref, active));
          }
          if (!active()) {
            if (!terminal(j)) this.finish(j, 'canceled');
            return [];
          }
          return adapter.generate(
            j.connection,
            j.key,
            { ...request, referenceImages },
            j.abort.signal,
          );
        })
        .then(async (images) => {
          if (!images.length) return;
          // Preserve a complete response even if cancellation raced its receipt.
          j.images = images.map((i) => ({
            ...i,
            id: randomUUID(),
            byteLength: i.bytes.length,
            checkpoint: () => this.checkpoint(j),
          }));
          this.imageViews(j);
          try {
            this.preserve(j);
          } catch {
            j.storageError = true;
            if (!terminal(j))
              this.finish(
                j,
                'unsaved',
                new ImageAiError(
                  'GENERATION_STORAGE_FAILED',
                  hostText('generationJobs.storageFailed'),
                ),
              );
            this.options.changed?.();
            return;
          }
          try {
            for (const image of images) {
              await this.options.validateImage?.(image.bytes);
            }
          } catch {
            j.quarantined = true;
            this.checkpoint(j);
            return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
          }
          if (terminal(j)) {
            this.checkpoint(j);
            this.options.changed?.();
            return;
          }
          if (!this.valid(j)) {
            this.finish(j, 'canceled');
            return;
          }
          if (Date.now() >= j.deadline) {
            this.finish(j, 'failed', new ImageAiError('IMAGE_AI_TIMEOUT', this.timeoutMessage()));
            return;
          }
          if (j.destination) {
            clearTimeout(j.timer);
            await this.save(j);
          } else {
            this.finish(j, 'completed');
            if (this.options.store) for (const image of j.images) image.bytes = undefined;
          }
        })
        .catch((error) => {
          if (!terminal(j)) {
            if (!this.valid(j) || j.abort.signal.aborted) this.finish(j, 'canceled');
            else if (error instanceof ImageAiError) this.finish(j, 'failed', error);
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
          j.task = undefined;
          this.options.changed?.();
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
        j.revoked = true;
        try {
          this.checkpoint(j);
        } catch {
          j.storageError = true;
        }
      }
  }
  async close() {
    this.closed = true;
    await this.settle();
  }
  async settle() {
    for (const owner of new Set([...this.jobs.values()].map((j) => j.owner)))
      for (const j of this.jobs.values())
        if (j.owner === owner && !terminal(j)) {
          this.finish(j, 'canceled');
          j.abort.abort();
        }
    await Promise.allSettled([...this.jobs.values()].flatMap((j) => [j.task, j.saving]));
    for (const j of this.jobs.values()) {
      try {
        this.preserve(j);
      } catch {
        j.storageError = true;
      }
    }
  }
}

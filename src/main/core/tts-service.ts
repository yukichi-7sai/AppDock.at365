import { hostText } from '../../shared/i18n';
import { randomUUID, createHash } from 'node:crypto';
import { AutomationError } from './appdock-api';
import {
  parseTtsSettings,
  parseTtsVoices,
  parseTtsModels,
  type TtsSettings,
  type TtsVoice,
  type TtsJob,
} from '../../shared/tts';
export class TtsError extends AutomationError {}
const fail = (code: string, message: string): never => {
  throw new TtsError(code, message);
};
export const ttsLimits = {
  capacity: 16,
  queueMs: 600000,
  generationMs: 180000,
  voicesMs: 5000,
  audioBytes: 64 * 1024 * 1024,
  voiceBytes: 1024 * 1024,
  durationSeconds: 600,
  records: 512,
  retentionMs: 1800000,
};
export function waveDuration(b: Buffer): number {
  const invalid = () => fail('TTS_INVALID_AUDIO', hostText('services.ttsService.invalidWav'));
  if (
    b.length < 44 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.readUInt32LE(4) + 8 !== b.length
  )
    return invalid();
  let format = 0,
    channels = 0,
    rate = 0,
    byteRate = 0,
    align = 0,
    bits = 0,
    data = 0,
    fmt = false;
  for (let i = 12; i < b.length;) {
    if (i + 8 > b.length) return invalid();
    const size = b.readUInt32LE(i + 4),
      end = i + 8 + size,
      tag = b.toString('ascii', i, i + 4);
    if (end > b.length) return invalid();
    if (tag === 'fmt ') {
      if (size < 16 || fmt) return invalid();
      fmt = true;
      format = b.readUInt16LE(i + 8);
      channels = b.readUInt16LE(i + 10);
      rate = b.readUInt32LE(i + 12);
      byteRate = b.readUInt32LE(i + 16);
      align = b.readUInt16LE(i + 20);
      bits = b.readUInt16LE(i + 22);
      if (format === 65534) {
        if (
          size < 40 ||
          b.readUInt16LE(i + 24) < 22 ||
          b.subarray(i + 34, i + 48).toString('hex') !== '000000001000800000aa00389b71'
        )
          return invalid();
        format = b.readUInt16LE(i + 32);
      }
    } else if (tag === 'data') {
      data += size;
    }
    i = end + (size % 2);
    if (i > b.length) return invalid();
  }
  if (
    !fmt ||
    ![1, 3].includes(format) ||
    channels < 1 ||
    channels > 8 ||
    rate < 8000 ||
    rate > 192000 ||
    ![8, 16, 24, 32].includes(bits) ||
    (format === 3 && bits !== 32) ||
    align !== (channels * bits) / 8 ||
    byteRate !== rate * align ||
    !data ||
    data % align
  )
    return invalid();
  const duration = data / byteRate;
  if (duration > ttsLimits.durationSeconds)
    return fail('TTS_AUDIO_TOO_LONG', hostText('services.ttsService.durationLimit'));
  if (duration * rate * channels * 4 > 256 * 1024 * 1024)
    return fail('TTS_AUDIO_TOO_LARGE', hostText('services.ttsService.decodedSizeLimit'));
  return duration;
}
export interface TtsInternalOptions {
  startBefore?: number;
  canStart?(): boolean;
}
interface InternalJob {
  view: TtsJob;
  owner: string;
  requestId: string;
  fingerprint: string;
  text?: string;
  voice?: string;
  speed?: number;
  config?: TtsSettings;
  key?: string;
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  finished?: Promise<void>;
  ended?: number;
  internal?: TtsInternalOptions;
  startTimer?: ReturnType<typeof setTimeout>;
}
export class TtsService {
  private jobs = new Map<string, InternalJob>();
  private listeners = new Set<(owner: string, job: TtsJob) => void>();
  subscribe(callback: (owner: string, job: TtsJob) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  private queue: InternalJob[] = [];
  private active?: InternalJob;
  private lists = new Map<
    string,
    {
      abort: AbortController;
      promise: Promise<{ voices: TtsVoice[]; source: 'endpoint' | 'manual' }>;
    }
  >();
  private signature: string;
  private modelLists = new Map<
    string,
    { abort: AbortController; promise: Promise<{ models: TtsVoice[] }> }
  >();
  private closed = false;
  private limits: typeof ttsLimits;
  constructor(
    private options: {
      settings(): TtsSettings;
      key(baseUrl: string): string | undefined;
      canUse(owner: string, speak: boolean): boolean;
      play(
        bytes: Buffer,
        seconds: number,
        signal: AbortSignal,
        speed?: number,
        beforePlay?: () => void,
      ): Promise<void>;
      changed?(): void;
      audit?(owner: string, jobId: string, state: string, code?: string): void;
      fetcher?: typeof fetch;
      limits?: Partial<typeof ttsLimits>;
    },
  ) {
    this.signature = JSON.stringify(options.settings());
    this.limits = { ...ttsLimits, ...options.limits };
  }
  private config(requireModel = true) {
    const config = parseTtsSettings(this.options.settings());
    if (!config.baseUrl || (requireModel && !config.model))
      fail('TTS_NOT_CONFIGURED', hostText('services.ttsService.configure'));
    return config;
  }
  private authorize(owner: string, speak: boolean) {
    if (this.closed) fail('NOT_READY', hostText('services.ttsService.closed'));
    if (!this.options.canUse(owner, speak))
      fail('API_DISABLED', hostText('services.ttsService.permission'));
  }
  private prune() {
    const ended = [...this.jobs.values()]
      .filter((j) => j.ended !== undefined)
      .sort((a, b) => a.ended! - b.ended!);
    for (let i = 0; i < ended.length; i++)
      if (
        Date.now() - ended[i].ended! >= this.limits.retentionMs ||
        i < ended.length - this.limits.records
      )
        this.jobs.delete(ended[i].view.jobId);
  }
  speak(
    owner: string,
    input: Record<string, unknown>,
    internal?: TtsInternalOptions,
  ): Record<string, unknown> {
    this.authorize(owner, true);
    const { text, voice, speed, requestId } = input;
    if (
      Object.keys(input).some((k) => !['text', 'voice', 'speed', 'requestId'].includes(k)) ||
      typeof text !== 'string' ||
      !text.trim() ||
      Array.from(text).length > 4096 ||
      typeof requestId !== 'string' ||
      !requestId ||
      requestId.length > 100 ||
      (voice !== undefined && (typeof voice !== 'string' || !voice.trim() || voice.length > 200)) ||
      (speed !== undefined &&
        (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.25 || speed > 4))
    )
      fail('INVALID_ARGUMENT', hostText('services.ttsService.requestFormat'));
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ text, voice, speed }))
      .digest('hex');
    this.prune();
    const previous = [...this.jobs.values()].find(
      (j) => j.owner === owner && j.requestId === requestId,
    );
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail('TTS_REQUEST_CONFLICT', hostText('services.ttsService.requestIdConflict'));
      return { ...previous.view, completion: 'accepted' };
    }
    const config = this.config();
    const selected = (voice as string | undefined) ?? config.defaultVoice;
    if (!selected) fail('INVALID_ARGUMENT', hostText('services.ttsService.voiceRequired'));
    if ([...this.jobs.values()].filter((j) => !j.ended).length >= this.limits.capacity)
      fail('TTS_QUEUE_FULL', hostText('services.ttsService.queueLimit'));
    let key: string | undefined;
    try {
      key = this.options.key(config.baseUrl);
    } catch {
      fail('TTS_AUTH_FAILED', hostText('services.ttsService.apiKey'));
    }
    const now = new Date().toISOString();
    const j: InternalJob = {
      owner,
      internal,
      requestId: requestId as string,
      fingerprint,
      text: text as string,
      voice: selected,
      speed: (speed as number | undefined) ?? config.defaultSpeed,
      config,
      key,
      abort: new AbortController(),
      view: { jobId: randomUUID(), state: 'queued', createdAt: now, updatedAt: now },
    };
    this.jobs.set(j.view.jobId, j);
    this.queue.push(j);
    if (internal?.startBefore !== undefined)
      j.startTimer = setTimeout(
        () => this.cancel(j),
        Math.max(0, internal.startBefore - Date.now()),
      );
    j.timer = setTimeout(() => {
      if (j.view.state === 'queued') {
        this.queue = this.queue.filter((v) => v !== j);
        this.finish(
          j,
          'failed',
          new TtsError('TTS_QUEUE_TIMEOUT', hostText('services.ttsService.timeout')),
        );
      }
    }, this.limits.queueMs);
    this.options.changed?.();
    queueMicrotask(() => void this.pump());
    return { ...j.view, completion: 'accepted' };
  }
  get(owner: string, id: unknown): TtsJob {
    this.prune();
    const j = typeof id === 'string' ? this.jobs.get(id) : undefined;
    if (!j || j.owner !== owner) fail('NOT_FOUND', hostText('services.ttsService.jobMissing'));
    return structuredClone(j!.view);
  }
  async stop(owner: string, id: unknown): Promise<TtsJob> {
    this.get(owner, id);
    const j = this.jobs.get(id as string)!;
    this.cancel(j);
    await j.finished;
    return this.get(owner, id);
  }
  private state(j: InternalJob, state: TtsJob['state']) {
    j.view.state = state;
    j.view.updatedAt = new Date().toISOString();
    for (const listener of this.listeners) listener(j.owner, structuredClone(j.view));
    this.options.changed?.();
  }
  private finish(j: InternalJob, state: 'completed' | 'failed' | 'canceled', error?: TtsError) {
    if (j.ended !== undefined) return;
    clearTimeout(j.timer);
    clearTimeout(j.startTimer);
    j.ended = Date.now();
    if (error) j.view.error = { code: error.code, message: error.message };
    j.text = j.voice = j.key = undefined;
    j.config = undefined;
    j.speed = undefined;
    j.internal = undefined;
    this.state(j, state);
    this.options.audit?.(j.owner, j.view.jobId, state, error?.code);
    this.prune();
  }
  private cancel(j: InternalJob) {
    if (j.ended !== undefined) return;
    j.abort.abort();
    this.queue = this.queue.filter((v) => v !== j);
    this.finish(j, 'canceled');
  }
  reconcile(keyChanged = false) {
    const signature = JSON.stringify(this.options.settings());
    const changed = keyChanged || signature !== this.signature;
    this.signature = signature;
    for (const j of this.jobs.values())
      if (
        !j.ended &&
        (!this.options.canUse(j.owner, true) || (changed && j.view.state !== 'playing'))
      )
        this.cancel(j);
    for (const [owner, list] of this.lists)
      if (changed || !this.options.canUse(owner, false)) list.abort.abort();
    for (const [owner, list] of this.modelLists)
      if (changed || !this.options.canUse(owner, false)) list.abort.abort();
  }
  async stopAll() {
    for (const j of this.jobs.values()) this.cancel(j);
    await this.active?.finished;
  }
  async close() {
    this.closed = true;
    for (const v of this.lists.values()) v.abort.abort();
    for (const v of this.modelLists.values()) v.abort.abort();
    await this.stopAll();
  }
  private async pump() {
    if (this.active || this.closed) return;
    const j = this.queue.shift();
    if (!j) return;
    this.active = j;
    clearTimeout(j.timer);
    j.finished = this.run(j).finally(() => {
      this.active = undefined;
      queueMicrotask(() => void this.pump());
    });
    await j.finished;
  }
  private checkStart(j: InternalJob) {
    if (
      j.ended !== undefined ||
      (j.internal?.startBefore !== undefined && Date.now() >= j.internal.startBefore) ||
      j.internal?.canStart?.() === false
    ) {
      this.cancel(j);
      throw new TtsError('TTS_START_CANCELED', hostText('services.ttsService.cancelled'));
    }
  }
  private async run(j: InternalJob) {
    try {
      this.authorize(j.owner, true);
      this.checkStart(j);
      this.state(j, 'generating');
      const controller = j.abort;
      j.timer = setTimeout(() => controller.abort(), this.limits.generationMs);
      const bytes = await this.download(
        j.config!.baseUrl + '/audio/speech',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(j.key ? { Authorization: 'Bearer ' + j.key } : {}),
          },
          body: JSON.stringify({
            model: j.config!.model,
            input: j.text,
            voice: j.voice,
            speed: j.config!.speedMode === 'server' ? j.speed : 1,
            response_format: 'wav',
          }),
          signal: controller.signal,
        },
        this.limits.audioBytes,
        false,
      );
      clearTimeout(j.timer);
      if (j.ended !== undefined) return;
      const seconds = waveDuration(bytes);
      const playbackSpeed = j.config!.speedMode === 'playback' ? j.speed : 1;
      this.authorize(j.owner, true);
      this.checkStart(j);
      this.state(j, 'waitingPlayback');
      if (j.ended === undefined)
        await this.options.play(bytes, seconds, controller.signal, playbackSpeed, () => {
          this.authorize(j.owner, true);
          this.checkStart(j);
          clearTimeout(j.startTimer);
          this.state(j, 'playing');
        });
      if (j.ended === undefined) this.finish(j, 'completed');
    } catch (error) {
      if (j.ended === undefined)
        this.finish(
          j,
          'failed',
          error instanceof TtsError
            ? error
            : new TtsError('TTS_PLAYBACK_FAILED', hostText('services.ttsService.failed')),
        );
    } finally {
      clearTimeout(j.timer);
    }
  }
  private async download(
    url: string,
    init: RequestInit,
    limit: number,
    voices: boolean | 'models',
  ): Promise<Buffer> {
    const invalidCode =
      voices === 'models'
        ? 'TTS_INVALID_MODELS'
        : voices
          ? 'TTS_INVALID_VOICES'
          : 'TTS_INVALID_AUDIO';
    let response: Response | undefined;
    try {
      response = await (this.options.fetcher ?? fetch)(url, { ...init, redirect: 'error' });
      if (!response.ok) {
        const s = response.status;
        if (s === 401 || s === 403)
          fail('TTS_AUTH_FAILED', hostText('services.ttsService.authentication'));
        if (s === 429) fail('TTS_RATE_LIMITED', hostText('services.ttsService.rateLimited'));
        if (voices && [404, 405].includes(s))
          fail(
            voices === 'models' ? 'TTS_MODELS_UNSUPPORTED' : 'TTS_VOICES_UNSUPPORTED',
            voices === 'models'
              ? hostText('services.ttsService.modelsUnsupported')
              : hostText('services.ttsService.voicesUnsupported'),
          );
        fail('TTS_SERVER_ERROR', hostText('services.ttsService.httpError', { status: String(s) }));
      }
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (
        voices
          ? mime !== 'application/json'
          : ![
              'audio/wav',
              'audio/x-wav',
              'audio/wave',
              'audio/vnd.wave',
              'application/octet-stream',
            ].includes(mime)
      )
        fail(invalidCode, hostText('services.ttsService.responseFormat'));
      if (!response.body) fail(invalidCode, hostText('services.ttsService.emptyResponse'));
      const reader = response.body!.getReader(),
        chunks: Buffer[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > limit)
            fail(
              voices ? invalidCode : 'TTS_AUDIO_TOO_LARGE',
              hostText('services.ttsService.responseLimit'),
            );
          chunks.push(Buffer.from(next.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (error instanceof TtsError) throw error;
      if (init.signal?.aborted)
        fail('TTS_TIMEOUT', hostText('services.ttsService.responseTimeout'));
      return fail('TTS_CONNECTION_FAILED', hostText('services.ttsService.connectionFailed'));
    } finally {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
  }
  models(owner: string): Promise<{ models: TtsVoice[] }> {
    this.authorize(owner, false);
    const config = this.config(false);
    const existing = this.modelLists.get(owner);
    if (existing && !existing.abort.signal.aborted) return existing.promise;
    let key: string | undefined;
    try {
      key = this.options.key(config.baseUrl);
    } catch {
      fail('TTS_AUTH_FAILED', hostText('services.ttsService.apiKey'));
    }
    const abort = new AbortController();
    const promise = (async () => {
      const timer = setTimeout(() => abort.abort(), this.limits.voicesMs);
      try {
        const bytes = await this.download(
          config.baseUrl + '/models',
          {
            headers: key ? { Authorization: 'Bearer ' + key } : {},
            signal: abort.signal,
          },
          this.limits.voiceBytes,
          'models',
        );
        if (abort.signal.aborted)
          fail('TTS_TIMEOUT', hostText('services.ttsService.modelsCancelled'));
        this.authorize(owner, false);
        try {
          const value = JSON.parse(bytes.toString('utf8'));
          return { models: parseTtsModels(value) };
        } catch {
          return fail('TTS_INVALID_MODELS', hostText('services.ttsService.modelsFormat'));
        }
      } finally {
        clearTimeout(timer);
        if (this.modelLists.get(owner)?.abort === abort) this.modelLists.delete(owner);
      }
    })();
    this.modelLists.set(owner, { abort, promise });
    return promise;
  }
  voices(owner: string): Promise<{ voices: TtsVoice[]; source: 'endpoint' | 'manual' }> {
    this.authorize(owner, false);
    const config = parseTtsSettings(this.options.settings());
    if (config.voicesSource === 'manual')
      return Promise.resolve({ voices: config.manualVoices, source: 'manual' });
    if (!config.baseUrl)
      fail('TTS_NOT_CONFIGURED', hostText('services.ttsService.configureConnection'));
    const existing = this.lists.get(owner);
    if (existing && !existing.abort.signal.aborted) return existing.promise;
    let key: string | undefined;
    try {
      key = this.options.key(config.baseUrl);
    } catch {
      fail('TTS_AUTH_FAILED', hostText('services.ttsService.apiKey'));
    }
    const abort = new AbortController();
    const promise = (async () => {
      const timer = setTimeout(() => abort.abort(), this.limits.voicesMs);
      try {
        const bytes = await this.download(
          config.baseUrl + '/' + config.voicesPath,
          { headers: key ? { Authorization: 'Bearer ' + key } : {}, signal: abort.signal },
          this.limits.voiceBytes,
          true,
        );
        if (abort.signal.aborted)
          fail('TTS_TIMEOUT', hostText('services.ttsService.voicesCancelled'));
        this.authorize(owner, false);
        try {
          const v = JSON.parse(bytes.toString('utf8'));
          return { voices: parseTtsVoices(v.voices), source: 'endpoint' as const };
        } catch {
          return fail('TTS_INVALID_VOICES', hostText('services.ttsService.voicesFormat'));
        }
      } finally {
        clearTimeout(timer);
        if (this.lists.get(owner)?.abort === abort) this.lists.delete(owner);
      }
    })();
    this.lists.set(owner, { abort, promise });
    return promise;
  }
}

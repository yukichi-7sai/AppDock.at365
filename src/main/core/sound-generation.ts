import { createHash, randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import { libraryFolder, libraryPath, libraryParent } from '../../shared/library-assets';
import type { LibraryEntry } from '../../shared/library-assets';
import { assetFilename } from '../../shared/asset-names';
import type { TtsConfiguration } from '../../shared/tts';
import type {
  GeneratedSound,
  SoundGenerationAction,
  SoundGenerationModel,
} from '../../shared/sound-generation';
import type { SoundLibraryService } from './sound-library-service';
import type { TtsService } from './tts-service';
import {
  GenerationStore,
  verifiedGenerationCopy,
  type GenerationRecord,
  type GenerationCopy,
} from './generation-store';
import type { BackgroundJob, BackgroundJobs } from './background-jobs';
import type { AssetRegistrationIntent } from './registered-assets';

interface Item {
  view: GeneratedSound;
  request: { text: string; connectionId: string; instructions: string };
  bytes?: Buffer;
  entry?: LibraryEntry;
  groupPending: boolean;
  abort?: AbortController;
  task?: Promise<void>;
  group?: string;
  createdAt: string;
  record?: GenerationRecord<SoundRecovery>;
  durable?: boolean;
  storageError?: boolean;
  intent?: AssetRegistrationIntent;
  rescued?: boolean;
  rescueCopies?: GenerationCopy[];
  hidden?: boolean;
}
interface SoundRecovery {
  rescueCopies?: GenerationCopy[];
  view: GeneratedSound;
  request: Item['request'];
  group?: string;
  groupPending: boolean;
  entry?: LibraryEntry;
  createdAt: string;
  intent?: AssetRegistrationIntent;
  hidden?: boolean;
}
interface Session {
  id: string;
  owner: string;
  folder: string;
  group?: string;
  items: Item[];
  closing: boolean;
  resolve(): void;
}
const filenameSegments = new Intl.Segmenter('ja', { granularity: 'grapheme' });
function filenameStem(text: string) {
  let prefix = '',
    count = 0;
  for (const { segment } of filenameSegments.segment(text)) {
    // Leave room for the serial and extension within the library filename contract.
    if (count++ === 20 || prefix.length + segment.length > 150) break;
    prefix += segment;
  }
  const stem =
    prefix
      .replace(/\s+/g, ' ')
      .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim() || hostText('soundGeneration.fileStem');
  return assetFilename(stem + '.wav') ? stem : '_' + stem;
}
/** Jobs outlive their dialog connection; only dialog playback is detached on close. */
export class SoundGeneration {
  private session?: Session;
  private revision = 0;
  private signature = '';
  private items: Item[] = [];
  private closed = false;
  private draft?: import('../../shared/sound-generation').SoundGenerationDraft;
  private recovering = new Map<Item, Promise<void>>();
  constructor(
    private options: {
      library: SoundLibraryService;
      tts: TtsService;
      configuration(): TtsConfiguration;
      send(model: SoundGenerationModel | null): void;
      failed(): void;
      changed(): void;
      store?: GenerationStore;
      background?: BackgroundJobs;
      export?(
        results: { id: string; mimeType: string; bytes: Buffer }[],
      ): Promise<GenerationCopy[] | undefined>;
      recoveryFolder?(): void;
    },
  ) {
    for (const record of options.store?.load<SoundRecovery>('sound') ?? []) {
      try {
        const data = record.data;
        if (data.hidden) continue;
        if (data.view.id !== record.id || typeof data.request.text !== 'string')
          throw Error('Invalid sound recovery record');
        const item: Item = { ...data, record, view: { ...data.view, busy: false } };
        if (record.deletedResults?.includes(record.id)) this.clearResult(item);
        if (record.results.length && !item.view.resultDeleted) {
          try {
            options.store!.read(record, record.id);
            item.durable = true;
          } catch {
            item.storageError = true;
          }
        }
        if (['queued', 'generating', 'saving'].includes(item.view.state)) {
          item.view.state = item.durable ? 'unsaved' : 'failed';
          item.view.error = hostText('generationJobs.interrupted');
        }
        this.items.push(item);
        if (item.intent) {
          const task = options.library.files
            .recoverRegistration(item.intent)
            .then((saved) => {
              item.entry = {
                ...options.library.files.entry(saved.ref)!,
                ref: saved.ref,
                generation: saved.generation,
              };
              item.view.file = saved.ref.file;
            })
            .catch(() => {
              item.view.state = 'changed';
              item.view.error = hostText('generationJobs.targetChanged');
            })
            .finally(() => {
              this.recovering.delete(item);
              this.refresh();
            });
          this.recovering.set(item, task);
        }
      } catch {
        options.store!.issues.push('Invalid sound recovery record: ' + record.id);
      }
    }
    options.background?.register('sound', {
      snapshot: () => this.backgroundSnapshot(),
      cancel: (id) => {
        this.items.find((item) => item.view.id === id)?.abort?.abort();
      },
      retry: async (id) => {
        const item = this.items.find((item) => item.view.id === id);
        if (!item || item.view.busy) return;
        item.abort = new AbortController();
        item.view.busy = true;
        item.task = this.save(item).finally(() => this.finished(item));
        await item.task;
      },
      close: () => this.close(),
      settle: () => this.settle(),
    });
  }
  private checkpoint(item: Item) {
    if (!this.options.store) return;
    const data: SoundRecovery = {
      view: { ...item.view },
      request: item.request,
      group: item.group,
      groupPending: item.groupPending,
      entry: item.entry,
      createdAt: item.createdAt,
      intent: item.intent,
      hidden: item.hidden,
      rescueCopies: item.rescueCopies,
    };
    item.record ??= { version: 1, id: item.view.id, kind: 'sound', data, results: [] };
    item.record.data = data;
    this.options.store.save(item.record);
  }
  private preserve(item: Item) {
    this.checkpoint(item);
    if (this.options.store && item.bytes && !item.durable) {
      this.options.store.preserve(item.record!, item.view.id, 'audio/wav', item.bytes);
      item.durable = true;
    }
    item.storageError = false;
  }
  private clearResult(item: Item) {
    item.bytes = undefined;
    item.durable = false;
    item.entry = undefined;
    item.intent = undefined;
    item.groupPending = false;
    item.storageError = false;
    item.view.file = undefined;
    item.view.error = undefined;
    item.view.resultDeleted = true;
    if (item.view.state === 'unsaved' || item.view.state === 'changed') item.view.state = 'saved';
  }
  backgroundSnapshot(): BackgroundJob[] {
    return this.items.map((item) => ({
      jobId: item.view.id,
      kind: 'sound',
      owner: 'host',
      origin: 'sound-library',
      state: item.view.busy
        ? item.abort?.signal.aborted
          ? 'canceling'
          : item.view.state === 'queued'
            ? 'queued'
            : 'running'
        : item.storageError || item.groupPending || item.view.state === 'unsaved'
          ? 'attention'
          : item.view.state === 'saved'
            ? 'completed'
            : item.view.state === 'canceled'
              ? 'canceled'
              : 'failed',
      phase: item.view.state,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      actions: item.view.busy ? ['cancel', 'details'] : ['retry', 'details'],
      shutdownImpact: {
        active: !!item.task,
        preserved: item.durable ? 1 : 0,
        volatile: item.bytes && !item.durable && !item.rescued ? 1 : 0,
      },
      resultSummary: {
        saved: item.entry ? 1 : 0,
        pending:
          (item.bytes || item.durable || item.entry) && (!item.entry || item.groupPending) ? 1 : 0,
      },
    }));
  }
  async close() {
    this.closed = true;
    await this.settle();
  }
  async settle() {
    for (const item of this.items) item.abort?.abort();
    await Promise.allSettled(this.items.map((item) => item.task));
    for (const item of this.items) {
      try {
        this.preserve(item);
      } catch {
        item.storageError = true;
      }
    }
  }
  open(owner: string, folder: string, group?: string): Promise<void> {
    if (this.session) throw Error(hostText('soundGeneration.busy'));
    this.checkFolder(folder);
    this.options.library.host.assertWritable();
    return new Promise((resolve) => {
      this.session = {
        id: randomUUID(),
        owner,
        folder,
        group,
        items: this.items,
        closing: false,
        resolve,
      };
      this.signature = '';
      this.refresh();
    });
  }
  private checkFolder(folder: unknown): asserts folder is string {
    if (!libraryFolder(folder) || (folder && !this.options.library.files.folders.includes(folder)))
      throw Error(hostText('soundGeneration.invalidFolder'));
  }
  current(): SoundGenerationModel | null {
    const s = this.session;
    if (!s) return null;
    const config = this.options.configuration();
    return {
      id: s.id,
      draft: this.draft,
      revision: this.revision,
      folder: s.folder,
      folders: [...new Set(['', ...this.options.library.files.folders])],
      servers: config.connections.map((server) => ({
        id: server.id,
        name: server.name,
        ready: !!server.baseUrl && !!server.model,
        instructions: server.defaultInstructions,
        supportsInstructions: server.instructionsMode !== 'none',
      })),
      defaultConnectionId: config.defaultConnectionId,
      items: s.items.map((item) => {
        const current = item.entry && this.options.library.files.entry(item.entry.ref);
        const changed =
          item.entry && (!current?.available || current.generation !== item.entry.generation);
        return {
          ...item.view,
          hasResult:
            !!item.bytes ||
            !!item.durable ||
            !!item.record?.results.some(
              (result) => !item.record!.deletedResults?.includes(result.id),
            ),
          state: changed ? 'changed' : item.view.state,
          canRetry:
            !item.view.busy &&
            item.view.state !== 'changed' &&
            !this.recovering.has(item) &&
            ((!item.entry && (!!item.bytes || item.durable)) ||
              item.groupPending ||
              ['failed', 'canceled'].includes(item.view.state)),
        };
      }),
      closing: s.closing,
      playback: this.options.library.preview.snapshot(s.id),
      error: this.options.store?.issues.length
        ? hostText('generationJobs.recoveryFailed')
        : this.options.library.preview.errorFor(s.id),
    };
  }
  refresh() {
    const model = this.current();
    if (!model) return;
    const signature = JSON.stringify({ ...model, revision: 0 });
    if (signature === this.signature) return;
    this.signature = signature;
    model.revision = ++this.revision;
    this.options.send(model);
  }
  private active(item: Item) {
    if (this.closed || item.abort?.signal.aborted)
      throw new DOMException('Cancelled', 'AbortError');
  }
  private writable(item: Item) {
    this.active(item);
    this.options.library.host.assertWritable();
  }
  private async save(item: Item) {
    item.view.state = 'saving';
    this.refresh();
    try {
      this.writable(item);
      this.preserve(item);
      if (!item.bytes && item.durable)
        item.bytes = this.options.store!.read(item.record!, item.view.id);
      if (!item.entry) {
        this.checkFolder(item.view.folder);
        if (!item.bytes) throw Error(hostText('soundGeneration.missing'));
        const filename =
          (item.view.folder ? item.view.folder + '/' : '') + filenameStem(item.view.text) + '.wav';
        const saved = await this.options.library.files.addVerified(item.bytes, filename, {
          unique: true,
          writable: () => this.writable(item),
          journal: this.options.store
            ? {
                intent: item.intent,
                prepare: (intent) => {
                  item.intent = intent;
                  this.checkpoint(item);
                },
              }
            : undefined,
        });
        item.entry = {
          ...this.options.library.files.entry(saved.ref)!,
          ref: saved.ref,
          generation: saved.generation,
        };
        item.view.file = saved.ref.file;
        item.view.state = 'saved';
        this.checkpoint(item);
        if (item.durable || !this.options.store) item.bytes = undefined;
      }
      if (item.groupPending && item.group) {
        this.writable(item);
        const groups = this.options.library.host.configuration.snapshot().groups;
        const before = groups
          .filter((g) =>
            g.images.some((ref) => ref.file.toLowerCase() === item.entry!.ref.file.toLowerCase()),
          )
          .map((g) => g.id);
        await this.options.library.host.edit({
          kind: 'membership',
          image: item.entry.ref,
          before,
          ids: [...new Set([...before, item.group])],
        });
        item.groupPending = false;
      }
      item.view.error = undefined;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        item.view.error = item.entry
          ? hostText('soundGeneration.groupFailed')
          : (error as Error).message;
        this.options.failed();
      }
    } finally {
      item.view.state =
        item.entry && !item.groupPending
          ? 'saved'
          : item.bytes || item.durable || item.entry
            ? 'unsaved'
            : 'canceled';
      try {
        this.checkpoint(item);
      } catch {
        item.storageError = true;
        item.view.error = hostText('generationJobs.storageFailed');
      }
      this.options.changed();
    }
  }
  private generate(item: Item) {
    try {
      this.options.background?.assertAccepting();
      if (this.items.some((existing) => existing.storageError))
        throw Error(hostText('generationJobs.storageFailed'));
      this.options.store?.preflight();
      this.checkpoint(item);
    } catch (error) {
      item.view.busy = false;
      item.view.state = 'failed';
      item.view.error = hostText('generationJobs.storageFailed');
      this.refresh();
      throw error;
    }
    const server = this.options
      .configuration()
      .connections.find((value) => value.id === item.request.connectionId);
    if (server) {
      item.view.server = server.name;
      item.view.instructions =
        server.instructionsMode === 'none'
          ? ''
          : [server.alwaysInstructions, item.request.instructions]
              .filter((value) => value.trim())
              .join('\n');
    }
    item.abort = new AbortController();
    item.view.state = 'queued';
    item.view.busy = true;
    item.view.error = undefined;
    this.refresh();
    // TtsService captures connection/authentication now and owns the shared FIFO.
    item.task = this.options.tts
      .generate(
        'host',
        item.request,
        item.abort.signal,
        (state) => {
          item.view.state = state;
          this.refresh();
        },
        (audio) => {
          item.bytes = audio.bytes;
          item.view.seconds = audio.seconds;
          try {
            this.preserve(item);
          } catch {
            item.storageError = true;
            item.view.error = hostText('generationJobs.storageFailed');
          }
        },
      )
      .then(async (audio) => {
        item.bytes = audio.bytes;
        item.view.seconds = audio.seconds;
        this.preserve(item);
        this.active(item);
        await this.save(item);
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') item.view.state = 'canceled';
        else {
          item.view.state = 'failed';
          item.view.error = error.message;
          this.options.failed();
        }
      })
      .finally(() => this.finished(item));
  }
  private finished(item: Item) {
    item.view.busy = false;
    item.abort = undefined;
    item.task = undefined;
    if ((item.bytes || item.durable) && item.view.state === 'canceled') item.view.state = 'unsaved';
    try {
      this.checkpoint(item);
    } catch {
      item.storageError = true;
      item.view.error = hostText('generationJobs.storageFailed');
    }
    this.options.changed();
    this.refresh();
  }
  async act(id: string, action: SoundGenerationAction) {
    const s = this.session;
    if (!s || s.id !== id || !action || typeof action !== 'object')
      throw Error(hostText('soundGeneration.closed'));
    if (action.kind === 'draft') {
      this.draft = structuredClone(action.draft);
      return;
    }
    if (action.kind === 'recoveryFolder') {
      this.options.recoveryFolder?.();
      return;
    }
    if (action.kind === 'stop') {
      this.options.library.preview.stop(s.id);
      this.refresh();
      return;
    }
    if (s.closing) throw Error(hostText('soundGeneration.closed'));
    if (action.kind === 'close') {
      this.cancel(s.owner);
      return;
    }
    if (action.kind === 'generate') {
      this.checkFolder(action.folder);
      if (
        typeof action.text !== 'string' ||
        !action.text.trim() ||
        typeof action.connectionId !== 'string' ||
        (action.instructions !== undefined && typeof action.instructions !== 'string')
      )
        throw Error(hostText('services.ttsService.requestFormat'));
      const server = this.options
        .configuration()
        .connections.find((c) => c.id === action.connectionId);
      if (!server) throw Error(hostText('settings.ttsServers.missingServer'));
      this.options.library.host.assertWritable();
      s.folder = action.folder;
      const instructions = action.instructions ?? server.defaultInstructions;
      const item: Item = {
        view: {
          id: randomUUID(),
          folder: action.folder,
          text: action.text,
          server: server.name,
          instructions:
            server.instructionsMode === 'none'
              ? ''
              : [server.alwaysInstructions, instructions]
                  .filter((value) => value.trim())
                  .join('\n'),
          state: 'queued',
          busy: true,
        },
        request: { text: action.text, connectionId: action.connectionId, instructions },
        groupPending: !!s.group,
        group: s.group,
        createdAt: new Date().toISOString(),
      };
      s.items.unshift(item);
      this.generate(item);
      return;
    }
    if (
      ![
        'deleteResults',
        'export',
        'cancel',
        'retry',
        'regenerate',
        'play',
        'rename',
        'delete',
        'dismiss',
      ].includes(action.kind) ||
      !('itemId' in action)
    )
      throw Error(hostText('soundGeneration.missing'));
    const item = s.items.find((item) => item.view.id === action.itemId);
    if (!item) throw Error(hostText('soundGeneration.missing'));
    await this.recovering.get(item);
    if (action.kind === 'export') {
      const bytes =
        item.bytes ?? (item.record && this.options.store?.read(item.record, item.view.id));
      if (!bytes) throw Error(hostText('soundGeneration.missing'));
      const copies = await this.options.export?.([
        { id: item.view.id, mimeType: 'audio/wav', bytes },
      ]);
      if (copies) {
        item.rescued = true;
        item.rescueCopies = copies;
        this.checkpoint(item);
      }
      return;
    }
    if (action.kind === 'cancel') {
      if (!['queued', 'generating'].includes(item.view.state)) return;
      item.abort?.abort();
      await item.task;
      return;
    }
    if (item.view.busy || item.task) throw Error(hostText('soundGeneration.busy'));
    if (action.kind === 'dismiss') {
      item.view.busy = true;
      item.task = (async () => {
        if (
          !item.view.resultDeleted &&
          (item.entry || item.bytes || item.durable || item.record?.results.length)
        ) {
          const hash =
            item.record?.results.find((result) => result.id === item.view.id)?.hash ??
            (item.bytes && createHash('sha256').update(item.bytes).digest('hex'));
          let safe = !!hash && verifiedGenerationCopy(item.rescueCopies, item.view.id, hash);
          if (!safe && item.entry && item.intent && !item.groupPending) {
            try {
              await this.options.library.files.recoverRegistration(item.intent);
              safe = true;
            } catch {
              /* Preserve the only original. */
            }
          }
          if (!safe) throw Error(hostText('generationJobs.saveBeforeRemove'));
        }
        this.options.library.preview.stop(s.id);
        if (item.record) this.options.store?.discard(item.record);
        this.items = s.items = s.items.filter((value) => value !== item);
      })().finally(() => {
        item.view.busy = false;
        item.task = undefined;
        this.options.changed();
        this.refresh();
      });
      await item.task;
      return;
    }
    if (
      action.kind === 'regenerate' ||
      (action.kind === 'retry' && !item.entry && !item.bytes && !item.durable)
    ) {
      const retry: Item = {
        request: structuredClone(item.request),
        group: item.group,
        groupPending: !!item.group,
        view: {
          ...item.view,
          id: randomUUID(),
          file: undefined,
          resultDeleted: undefined,
          state: 'queued',
          busy: true,
          error: undefined,
        },
        createdAt: new Date().toISOString(),
      };
      this.items.unshift(retry);
      this.generate(retry);
      return;
    }
    item.view.busy = true;
    item.view.error = undefined;
    this.refresh();
    item.task = Promise.resolve().then(async () => {
      try {
        if (action.kind === 'play' && s !== this.session)
          throw new DOMException('Cancelled', 'AbortError');
        this.active(item);
        if (action.kind === 'retry') {
          item.abort = new AbortController();
          if (item.entry)
            await this.options.library.files.read(item.entry.ref, item.entry.generation);
          await this.save(item);
        } else if (action.kind === 'delete' || action.kind === 'deleteResults') {
          this.options.library.preview.stop(s.id);
          this.writable(item);
          if (item.entry && this.options.library.files.entry(item.entry.ref)?.available) {
            if (item.intent) {
              const saved = await this.options.library.files.recoverRegistration(item.intent);
              item.entry = { ...item.entry, generation: saved.generation };
            }
            await this.options.library.host.removeMany([item.entry]);
          }
          try {
            if (item.record) this.options.store?.deleteResults(item.record, [item.view.id]);
          } finally {
            if (!item.record || item.record.deletedResults?.includes(item.view.id))
              this.clearResult(item);
          }
          this.checkpoint(item);
        } else {
          if (!item.entry) throw Error(hostText('soundGeneration.missing'));
          const entry = item.entry;
          if (action.kind === 'play')
            await this.options.library.preview.play(entry.ref, s.id, entry.generation);
          else {
            if (this.options.library.preview.snapshot(s.id)?.file === entry.ref.file)
              this.options.library.preview.stop(s.id);
            this.writable(item);
            if (action.kind === 'rename') {
              if (
                typeof action.name !== 'string' ||
                action.name.includes('/') ||
                !libraryPath(action.name, 'sound')
              )
                throw Error(hostText('images.renameInvalid'));
              await this.options.library.host.rename([entry], [action.name]);
              const ref = {
                file:
                  (libraryParent(entry.ref.file) ? libraryParent(entry.ref.file) + '/' : '') +
                  action.name,
              };
              const updated = this.options.library.files.entry(ref);
              if (!updated) throw Error(hostText('soundGeneration.missing'));
              item.entry = { ...updated };
              item.view.file = ref.file;
              if (item.intent) item.intent.file = ref.file;
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          item.view.error = (error as Error).message;
          this.options.failed();
        }
        throw error;
      } finally {
        this.finished(item);
      }
    });
    await item.task;
  }
  cancel(owner?: string) {
    const s = this.session;
    if (!s || (owner !== undefined && s.owner !== owner)) return;
    this.session = undefined;
    this.options.library.preview.stop(s.id);
    this.options.send(null);
    s.resolve();
  }
}

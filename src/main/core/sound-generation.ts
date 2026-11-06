import { randomUUID } from 'node:crypto';
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

interface Item {
  view: GeneratedSound;
  request: { text: string; connectionId: string; instructions: string };
  bytes?: Buffer;
  entry?: LibraryEntry;
  groupPending: boolean;
  abort?: AbortController;
  task?: Promise<void>;
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
/** Only this dialog's drafts and playback are disposed; committed library files are permanent. */
export class SoundGeneration {
  private session?: Session;
  private revision = 0;
  private signature = '';
  constructor(
    private options: {
      library: SoundLibraryService;
      tts: TtsService;
      configuration(): TtsConfiguration;
      send(model: SoundGenerationModel | null): void;
      failed(): void;
      changed(): void;
    },
  ) {}
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
        items: [],
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
          state: changed ? 'changed' : item.view.state,
          canRetry:
            !item.view.busy &&
            (!!item.bytes || item.groupPending || ['failed', 'canceled'].includes(item.view.state)),
        };
      }),
      closing: s.closing,
      playback: this.options.library.preview.snapshot(s.id),
      error: this.options.library.preview.errorFor(s.id),
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
  private active(s: Session, item: Item) {
    if (s !== this.session || s.closing || item.abort?.signal.aborted)
      throw new DOMException('Cancelled', 'AbortError');
  }
  private writable(s: Session, item: Item) {
    this.active(s, item);
    this.options.library.host.assertWritable();
  }
  private async save(s: Session, item: Item) {
    item.view.state = 'saving';
    this.refresh();
    try {
      this.writable(s, item);
      if (!item.entry) {
        this.checkFolder(item.view.folder);
        if (!item.bytes) throw Error(hostText('soundGeneration.missing'));
        const filename =
          (item.view.folder ? item.view.folder + '/' : '') + filenameStem(item.view.text) + '.wav';
        const saved = await this.options.library.files.addVerified(item.bytes, filename, {
          unique: true,
          writable: () => this.writable(s, item),
        });
        item.entry = {
          ...this.options.library.files.entry(saved.ref)!,
          ref: saved.ref,
          generation: saved.generation,
        };
        item.view.file = saved.ref.file;
        item.view.state = 'saved';
        item.bytes = undefined;
      }
      if (item.groupPending && s.group) {
        this.writable(s, item);
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
          ids: [...new Set([...before, s.group])],
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
      item.view.state = item.entry ? 'saved' : item.bytes ? 'unsaved' : 'canceled';
      this.options.changed();
    }
  }
  private generate(s: Session, item: Item) {
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
        this.options.library.files.policy.maxBytes,
        (state) => {
          if (s !== this.session || s.closing) return;
          item.view.state = state;
          this.refresh();
        },
      )
      .then(async (audio) => {
        this.active(s, item);
        item.bytes = audio.bytes;
        item.view.seconds = audio.seconds;
        await this.save(s, item);
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') item.view.state = 'canceled';
        else {
          item.view.state = 'failed';
          item.view.error = error.message;
          this.options.failed();
        }
      })
      .finally(() => this.finished(s, item));
  }
  private finished(s: Session, item: Item) {
    item.view.busy = false;
    item.abort = undefined;
    item.task = undefined;
    if (s !== this.session) item.bytes = undefined;
    this.options.changed();
    this.refresh();
  }
  async act(id: string, action: SoundGenerationAction) {
    const s = this.session;
    if (!s || s.id !== id || !action || typeof action !== 'object')
      throw Error(hostText('soundGeneration.closed'));
    if (action.kind === 'stop') {
      this.options.library.preview.stop(s.id);
      this.refresh();
      return;
    }
    if (s.closing) throw Error(hostText('soundGeneration.closed'));
    if (action.kind === 'close') {
      if (s.items.some((item) => item.view.busy || !!item.bytes) && action.discard !== true)
        throw Error(hostText('soundGeneration.confirmClose'));
      s.closing = true;
      this.refresh();
      for (const item of s.items) item.abort?.abort();
      await Promise.allSettled(s.items.map((item) => item.task));
      this.cancel(s.owner);
      return;
    }
    if (action.kind === 'generate') {
      this.checkFolder(action.folder);
      if (
        typeof action.text !== 'string' ||
        !action.text.trim() ||
        Array.from(action.text).length > 4096 ||
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
      };
      s.items.unshift(item);
      this.generate(s, item);
      return;
    }
    if (
      !['cancel', 'retry', 'play', 'rename', 'delete', 'dismiss'].includes(action.kind) ||
      !('itemId' in action)
    )
      throw Error(hostText('soundGeneration.missing'));
    const item = s.items.find((item) => item.view.id === action.itemId);
    if (!item) throw Error(hostText('soundGeneration.missing'));
    if (action.kind === 'cancel') {
      if (!['queued', 'generating'].includes(item.view.state)) return;
      item.abort?.abort();
      await item.task;
      return;
    }
    if (item.view.busy) throw Error(hostText('soundGeneration.busy'));
    if (action.kind === 'dismiss') {
      if (item.entry || item.bytes) throw Error(hostText('soundGeneration.busy'));
      s.items = s.items.filter((value) => value !== item);
      this.refresh();
      return;
    }
    if (action.kind === 'retry' && !item.entry && !item.bytes) {
      this.generate(s, item);
      return;
    }
    item.view.busy = true;
    item.view.error = undefined;
    this.refresh();
    item.task = Promise.resolve().then(async () => {
      try {
        this.active(s, item);
        if (action.kind === 'retry') {
          item.abort = new AbortController();
          if (item.entry)
            await this.options.library.files.read(item.entry.ref, item.entry.generation);
          await this.save(s, item);
        } else {
          if (!item.entry) throw Error(hostText('soundGeneration.missing'));
          const entry = item.entry;
          if (action.kind === 'play')
            await this.options.library.preview.play(entry.ref, s.id, entry.generation);
          else {
            if (this.options.library.preview.snapshot(s.id)?.file === entry.ref.file)
              this.options.library.preview.stop(s.id);
            this.writable(s, item);
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
            } else {
              await this.options.library.host.removeMany([entry]);
              s.items = s.items.filter((value) => value !== item);
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
        this.finished(s, item);
      }
    });
    await item.task;
  }
  cancel(owner?: string) {
    const s = this.session;
    if (!s || (owner !== undefined && s.owner !== owner)) return;
    this.session = undefined;
    s.closing = true;
    for (const item of s.items) item.abort?.abort();
    this.options.library.preview.stop(s.id);
    for (const item of s.items) item.bytes = undefined;
    this.options.send(null);
    s.resolve();
  }
}

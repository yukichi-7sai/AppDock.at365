import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import { libraryFolder, libraryPath, libraryParent } from '../../shared/library-assets';
import type { LibraryEntry } from '../../shared/library-assets';
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
  bytes?: Buffer;
  entry?: LibraryEntry;
  groupPending: boolean;
}
interface Session {
  id: string;
  owner: string;
  folder: string;
  group?: string;
  items: Item[];
  phase: SoundGenerationModel['phase'];
  error: string;
  abort?: AbortController;
  task?: Promise<void>;
  resolve(): void;
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
        phase: 'idle',
        error: '',
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
          state: changed ? 'changed' : item.entry ? 'saved' : 'unsaved',
          canRetry: !!item.bytes || item.groupPending,
        };
      }),
      phase: s.phase,
      playback: this.options.library.preview.snapshot(s.id),
      error: s.error || this.options.library.preview.errorFor(s.id),
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
  private active(s: Session) {
    if (s !== this.session || s.abort?.signal.aborted)
      throw new DOMException('Cancelled', 'AbortError');
  }
  private writable(s: Session) {
    this.active(s);
    this.options.library.host.assertWritable();
  }
  private async save(s: Session, item: Item) {
    s.phase = 'saving';
    this.refresh();
    try {
      this.writable(s);
      if (!item.entry) {
        this.checkFolder(item.view.folder);
        if (!item.bytes) throw Error(hostText('soundGeneration.missing'));
        const filename =
          (item.view.folder ? item.view.folder + '/' : '') +
          hostText('soundGeneration.fileStem') +
          '.wav';
        const saved = await this.options.library.files.addVerified(item.bytes, filename, {
          unique: true,
          writable: () => this.writable(s),
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
        this.writable(s);
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
      this.options.changed();
    }
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
    if (action.kind === 'cancel') {
      s.abort?.abort();
      await s.task?.catch(() => {});
      return;
    }
    if (action.kind === 'close') {
      if ((s.phase !== 'idle' || s.items.some((item) => !!item.bytes)) && action.discard !== true)
        throw Error(hostText('soundGeneration.confirmClose'));
      s.abort?.abort();
      await s.task?.catch(() => {});
      this.cancel(s.owner);
      return;
    }
    if (s.phase !== 'idle') throw Error(hostText('soundGeneration.busy'));
    s.error = '';
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
      s.abort = new AbortController();
      s.phase = 'generating';
      this.refresh();
      s.task = (async () => {
        try {
          const audio = await this.options.tts.generate(
            'host',
            {
              text: action.text,
              connectionId: action.connectionId,
              instructions: action.instructions,
            },
            s.abort!.signal,
            this.options.library.files.policy.maxBytes,
          );
          this.active(s);
          const item: Item = {
            view: {
              id: randomUUID(),
              folder: action.folder,
              seconds: audio.seconds,
              text: action.text,
              server: server.name,
              instructions:
                server.instructionsMode === 'none'
                  ? ''
                  : [server.alwaysInstructions, action.instructions ?? server.defaultInstructions]
                      .filter((value) => value.trim())
                      .join('\n'),
              state: 'unsaved',
            },
            bytes: audio.bytes,
            groupPending: !!s.group,
          };
          s.items.unshift(item);
          await this.save(s, item);
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            s.error = (error as Error).message;
            this.options.failed();
          }
        } finally {
          s.phase = 'idle';
          s.abort = undefined;
          this.refresh();
        }
      })();
      await s.task;
      return;
    }
    if (!['retry', 'play', 'rename', 'delete'].includes(action.kind) || !('itemId' in action))
      throw Error(hostText('soundGeneration.missing'));
    const item = s.items.find((item) => item.view.id === action.itemId);
    if (!item) throw Error(hostText('soundGeneration.missing'));
    s.phase = action.kind === 'retry' ? 'saving' : 'editing';
    this.refresh();
    s.task = (async () => {
      try {
        if (action.kind === 'retry') {
          s.abort = new AbortController();
          if (item.entry)
            await this.options.library.files.read(item.entry.ref, item.entry.generation);
          await this.save(s, item);
        } else {
          if (!item.entry) throw Error(hostText('soundGeneration.missing'));
          const entry = item.entry;
          if (action.kind === 'play')
            await this.options.library.preview.play(entry.ref, s.id, entry.generation);
          else {
            this.options.library.preview.stop(s.id);
            this.writable(s);
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
          s.error = (error as Error).message;
          this.options.failed();
        }
        throw error;
      } finally {
        s.phase = 'idle';
        s.abort = undefined;
        this.options.changed();
        this.refresh();
      }
    })();
    await s.task;
  }
  cancel(owner?: string) {
    const s = this.session;
    if (!s || (owner !== undefined && s.owner !== owner)) return;
    this.session = undefined;
    s.abort?.abort();
    this.options.library.preview.stop(s.id);
    for (const item of s.items) item.bytes = undefined;
    this.options.send(null);
    s.resolve();
  }
}

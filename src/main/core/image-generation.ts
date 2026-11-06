import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import {
  libraryFolder,
  libraryParent,
  libraryPath,
  type LibraryEntry,
} from '../../shared/library-assets';
import type { ImageAiSettings } from '../../shared/image-ai';
import type {
  ImageGenerationAction,
  ImageGenerationItem,
  ImageGenerationModel,
} from '../../shared/image-generation';
import type { ImageAiService } from './image-ai-service';
import type { ImageLibraryHost } from './image-library-host';

const busy = (item: ImageGenerationItem) =>
  ['queued', 'running', 'saving'].includes(item.job.state);
export class ImageGeneration {
  private session?: {
    id: string;
    owner: string;
    folder: string;
    group?: string;
    items: ImageGenerationItem[];
    resolve(): void;
  };
  private signature = '';
  private revision = 0;
  private editing = new Set<string>();
  constructor(
    private options: {
      ai: ImageAiService;
      library: ImageLibraryHost;
      configuration(): ImageAiSettings;
      send(model: ImageGenerationModel | null): void;
      changed(): void;
      failed(): void;
    },
  ) {}
  open(owner: string, folder: string, group?: string): Promise<void> {
    if (this.session) throw Error(hostText('imageGeneration.busy'));
    if (!libraryFolder(folder)) throw Error(hostText('imageGeneration.invalidFolder'));
    this.options.library.assertWritable();
    return new Promise((resolve) => {
      this.session = { id: randomUUID(), owner, folder, group, items: [], resolve };
      this.signature = '';
      this.refresh();
    });
  }
  current(): ImageGenerationModel | null {
    const s = this.session;
    if (!s) return null;
    for (const item of s.items) {
      try {
        item.job = this.options.ai.get('host', item.job.jobId);
      } catch {
        /* Keep saved entries after job retention ends. */
      }
      for (const image of item.job.images ?? []) {
        if (!image.ref || item.entries.some((entry) => entry.id === image.id)) continue;
        const entry = this.options.library.images.entry(image.ref);
        if (entry) item.entries.push({ id: image.id, entry: { ...entry }, changed: false });
      }
      for (const entry of item.entries) {
        const latest = this.options.library.images.entry(entry.entry.ref);
        entry.changed = !latest?.available || latest.generation !== entry.entry.generation;
        if (!entry.changed && latest) entry.entry = { ...latest };
      }
    }
    const configuration = this.options.configuration();
    return structuredClone({
      id: s.id,
      revision: this.revision,
      folder: s.folder,
      folders: [...new Set(['', ...this.options.library.images.folders])],
      defaultConnectionId: configuration.defaultConnectionId,
      servers: configuration.connections.map(({ id, name, defaults }) => ({
        id,
        name,
        defaults,
      })),
      items: s.items,
    });
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
  async act(id: string, action: ImageGenerationAction) {
    const s = this.session;
    if (!s || s.id !== id || !action || typeof action !== 'object')
      throw Error(hostText('imageGeneration.closed'));
    this.current();
    if (action.kind === 'close') {
      if (this.editing.size) throw Error(hostText('imageGeneration.busy'));
      if (
        !action.discard &&
        s.items.some(
          (item) => busy(item) || (item.job.state === 'unsaved' && !item.job.resultExpired),
        )
      )
        throw Error(hostText('imageGeneration.confirmClose'));
      this.cancel(s.owner);
      return;
    }
    if (action.kind === 'generate') {
      const c = this.options.configuration();
      const server = c.connections.find(
        (server) => server.id === (action.input?.connectionId ?? c.defaultConnectionId),
      );
      const job = this.options.ai.generateAndRegister('host', {
        ...action.input,
        destination: { folder: action.folder, name: action.name, group: s.group },
      });
      if (!s.items.some((item) => item.job.jobId === job.jobId))
        s.items.unshift({
          job,
          input: action.input.input ?? '',
          referenceImages: structuredClone(action.input.referenceImages ?? []),
          options: {
            ...server!.defaults,
            ...action.input.options,
            providerOptions: {
              ...server!.defaults.providerOptions,
              ...action.input.options?.providerOptions,
            },
          },
          server: server!.name,
          folder: action.folder,
          entries: [],
        });
      s.folder = action.folder;
      this.refresh();
      return;
    }
    const item = s.items.find((item) => item.job.jobId === action.jobId);
    if (!item) throw Error(hostText('imageGeneration.missing'));
    if (action.kind === 'cancel') this.options.ai.cancel('host', action.jobId);
    else if (action.kind === 'retrySave') this.options.ai.retrySave('host', action.jobId);
    else if (action.kind === 'rename' || action.kind === 'delete') {
      if (busy(item) || item.job.state === 'unsaved' || this.editing.has(action.imageId))
        throw Error(hostText('imageGeneration.busy'));
      const saved = item.entries.find((entry) => entry.id === action.imageId);
      if (!saved || saved.changed) throw Error(hostText('imageGeneration.missing'));
      this.editing.add(action.imageId);
      try {
        if (action.kind === 'rename') {
          if (!libraryPath(action.name, 'image') || action.name.includes('/'))
            throw Error(hostText('images.renameInvalid'));
          const folder = libraryParent(saved.entry.ref.file);
          await this.options.library.rename([saved.entry], [action.name]);
          saved.entry = {
            ...this.options.library.images.entry({
              file: (folder ? folder + '/' : '') + action.name,
            })!,
          };
        } else {
          await this.options.library.removeMany([saved.entry]);
          saved.changed = true;
        }
      } catch (error) {
        this.options.failed();
        throw error;
      } finally {
        this.editing.delete(action.imageId);
        this.options.changed();
      }
    } else throw Error(hostText('imageGeneration.missing'));
    this.refresh();
  }
  cancel(owner?: string) {
    const s = this.session;
    if (!s || (owner !== undefined && s.owner !== owner)) return;
    this.session = undefined;
    for (const item of s.items) this.options.ai.discard('host', item.job.jobId);
    this.options.send(null);
    s.resolve();
  }
}

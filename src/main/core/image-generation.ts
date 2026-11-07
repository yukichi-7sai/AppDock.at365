import { randomUUID } from 'node:crypto';
import { hostText } from '../../shared/i18n';
import {
  libraryFolder,
  libraryParent,
  libraryPath,
  type LibraryEntry,
  type LibraryRef,
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
    initialReferenceImages: LibraryRef[];
    items: ImageGenerationItem[];
    resolve(): void;
  };
  private signature = '';
  private revision = 0;
  private editing = new Set<string>();
  private items: ImageGenerationItem[] = [];
  private draft?: import('../../shared/image-generation').ImageGenerationDraft;
  private openingFolder?: string;
  constructor(
    private options: {
      ai: ImageAiService;
      library: ImageLibraryHost;
      configuration(): ImageAiSettings;
      send(model: ImageGenerationModel | null): void;
      changed(): void;
      failed(): void;
      export?(results: { id: string; mimeType: string; bytes: Buffer }[]): Promise<boolean>;
      recoveryFolder?(): void;
    },
  ) {}
  open(
    owner: string,
    folder: string,
    group?: string,
    referenceImages: LibraryRef[] = [],
  ): Promise<void> {
    if (this.session) throw Error(hostText('imageGeneration.busy'));
    if (!libraryFolder(folder)) throw Error(hostText('imageGeneration.invalidFolder'));
    this.options.library.assertWritable();
    if (this.draft && this.openingFolder !== folder) {
      this.draft.folder = folder;
      this.draft.referenceImages = [];
    }
    this.openingFolder = folder;
    return new Promise((resolve) => {
      this.session = {
        id: randomUUID(),
        owner,
        folder,
        group,
        initialReferenceImages: structuredClone(referenceImages),
        items: this.items,
        resolve,
      };
      this.signature = '';
      this.refresh();
    });
  }
  current(): ImageGenerationModel | null {
    const s = this.session;
    if (!s) return null;
    for (const item of this.options.ai.hostItems())
      if (!s.items.some((existing) => existing.job.jobId === item.job.jobId)) s.items.push(item);
    for (const item of s.items) {
      try {
        item.job = this.options.ai.hostGet(item.job.jobId);
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
        entry.changed =
          this.options.ai.hostResultChanged(item.job.jobId, entry.id) ||
          !latest?.available ||
          latest.generation !== entry.entry.generation;
        if (!entry.changed && latest) entry.entry = { ...latest };
      }
    }
    const configuration = this.options.configuration();
    return structuredClone({
      id: s.id,
      draft: this.draft,
      recoveryError: this.options.ai.recoveryError,
      revision: this.revision,
      folder: s.folder,
      folders: [...new Set(['', ...this.options.library.images.folders])],
      initialReferenceImages: s.initialReferenceImages,
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
    if (action.kind === 'draft') {
      this.draft = structuredClone(action.draft);
      return;
    }
    if (action.kind === 'recoveryFolder') {
      this.options.recoveryFolder?.();
      return;
    }
    if (action.kind === 'close') {
      if (this.editing.size) throw Error(hostText('imageGeneration.busy'));
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
    if (action.kind === 'export') {
      if (await this.options.export?.(this.options.ai.hostExport(action.jobId)))
        this.options.ai.hostRescued(action.jobId);
    } else if (action.kind === 'discard') {
      this.options.ai.hostDiscard(action.jobId);
      this.items = s.items = s.items.filter((value) => value !== item);
    } else if (action.kind === 'cancel') this.options.ai.hostCancel(action.jobId);
    else if (action.kind === 'retrySave') await this.options.ai.hostRetry(action.jobId);
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
          this.options.ai.hostRetarget(
            item.job.jobId,
            saved.id,
            saved.entry.ref,
            saved.entry.generation,
          );
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
    this.options.send(null);
    s.resolve();
  }
}

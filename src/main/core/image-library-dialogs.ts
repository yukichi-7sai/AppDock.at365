import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type {
  ImageLibraryDialogRequest,
  ImageLibraryDialogOperation,
  IconImportProgress,
} from '../../shared/image-library-page';
/** Main owns the request lifetime; the trusted host renderer owns native dialogs. */
export class ImageLibraryDialogs {
  private pending?: {
    request: ImageLibraryDialogRequest;
    resolve(operation?: ImageLibraryDialogOperation): void;
    busy?: boolean;
    abort?: () => void;
  };
  constructor(
    private options: {
      send(request: ImageLibraryDialogRequest | null): void;
      edit(
        operation: ImageLibraryDialogOperation,
        request: ImageLibraryDialogRequest,
      ): Promise<void>;
      failed(request: ImageLibraryDialogRequest): void;
    },
  ) {}
  current() {
    return this.pending?.request ?? null;
  }
  open(request: Omit<ImageLibraryDialogRequest, 'id'>) {
    if (this.pending) throw Error(hostText('services.imageLibraryDialogs.editing'));
    return new Promise<ImageLibraryDialogOperation | undefined>((resolve) => {
      this.pending = { request: { ...structuredClone(request), id: randomUUID() }, resolve };
      this.options.send(this.pending.request);
    });
  }
  openProgress(abort: () => void) {
    if (this.pending) throw Error(hostText('services.imageLibraryDialogs.editing'));
    const id = randomUUID();
    this.pending = {
      request: { id, kind: 'import-progress', groups: [], images: [] },
      resolve: () => {},
      abort,
    };
    this.options.send(this.pending.request);
    return id;
  }
  progress(id: string, importing: IconImportProgress) {
    if (this.pending?.request.id !== id) return;
    this.pending.request = { ...this.pending.request, importing: { ...importing } };
    this.options.send(this.pending.request);
  }
  closeProgress(id: string) {
    if (this.pending?.request.id !== id) return;
    this.pending = undefined;
    this.options.send(null);
  }
  async complete(id: string, operation?: ImageLibraryDialogOperation) {
    const pending = this.pending;
    if (!pending || pending.request.id !== id)
      throw Error(hostText('services.imageLibraryDialogs.busyEnded'));
    if (pending.request.kind === 'import-progress') {
      if (operation) throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      if (!pending.request.cancelling) {
        pending.request = { ...pending.request, cancelling: true };
        pending.abort?.();
        this.options.send(pending.request);
      }
      return;
    }
    if (pending.busy) throw Error(hostText('services.imageLibraryDialogs.pending'));
    if (operation) {
      if (
        (operation.kind === 'text-save') !==
          ['text-create', 'text-edit'].includes(pending.request.kind) ||
        pending.request.kind === 'text-preview'
      )
        throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      if ((operation.kind === 'delete-image') !== (pending.request.kind === 'delete-image'))
        throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      if ((operation.kind === 'rename-images') !== (pending.request.kind === 'rename-images'))
        throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      if (
        (operation.kind === 'source-add') !== (pending.request.kind === 'source-add') ||
        (operation.kind === 'source-edit') !== (pending.request.kind === 'source-edit') ||
        (operation.kind === 'source-remove') !== (pending.request.kind === 'source-remove') ||
        (operation.kind === 'folder') !== pending.request.kind.startsWith('folder-') ||
        (operation.kind === 'import-set') !== (pending.request.kind === 'import-set')
      )
        throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      pending.busy = true;
      try {
        await this.options.edit(operation, pending.request);
      } catch (e) {
        pending.busy = false;
        this.options.failed(pending.request);
        throw e;
      }
    }
    if (this.pending !== pending) return;
    this.pending = undefined;
    this.options.send(null);
    pending.resolve(operation);
  }
  cancel() {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      pending.abort?.();
      this.options.send(null);
      pending.resolve();
    }
  }
}

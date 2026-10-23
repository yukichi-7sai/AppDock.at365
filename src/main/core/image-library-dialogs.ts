import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type {
  ImageLibraryDialogRequest,
  ImageLibraryDialogOperation,
} from '../../shared/image-library-page';
/** Main owns the request lifetime; the trusted host renderer owns native dialogs. */
export class ImageLibraryDialogs {
  private pending?: {
    request: ImageLibraryDialogRequest;
    resolve(operation?: ImageLibraryDialogOperation): void;
    busy?: boolean;
  };
  constructor(
    private options: {
      send(request: ImageLibraryDialogRequest | null): void;
      edit(
        operation: ImageLibraryDialogOperation,
        request: ImageLibraryDialogRequest,
      ): Promise<void>;
      failed(): void;
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
  async complete(id: string, operation?: ImageLibraryDialogOperation) {
    const pending = this.pending;
    if (!pending || pending.request.id !== id)
      throw Error(hostText('services.imageLibraryDialogs.busyEnded'));
    if (pending.busy) throw Error(hostText('services.imageLibraryDialogs.pending'));
    if (operation) {
      if ((operation.kind === 'delete-image') !== (pending.request.kind === 'delete-image'))
        throw Error(hostText('services.imageLibraryDialogs.invalidOperation'));
      pending.busy = true;
      try {
        await this.options.edit(operation, pending.request);
      } catch (e) {
        pending.busy = false;
        this.options.failed();
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
      this.options.send(null);
      pending.resolve();
    }
  }
}

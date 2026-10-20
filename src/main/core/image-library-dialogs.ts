import { randomUUID } from 'node:crypto';
import type { ImageLibraryDialogRequest } from '../../shared/image-library-page';
import type { ImageLibraryEdit } from '../../shared/registered-images';
/** Main owns the request lifetime; the trusted host renderer owns native dialogs. */
export class ImageLibraryDialogs {
  private pending?: {
    request: ImageLibraryDialogRequest;
    resolve(operation?: ImageLibraryEdit): void;
  };
  constructor(
    private options: {
      send(request: ImageLibraryDialogRequest | null): void;
      edit(operation: ImageLibraryEdit): Promise<void>;
      failed(): void;
    },
  ) {}
  current() {
    return this.pending?.request ?? null;
  }
  open(request: Omit<ImageLibraryDialogRequest, 'id'>) {
    if (this.pending) throw Error('開いている画像の編集を終えてください。');
    return new Promise<ImageLibraryEdit | undefined>((resolve) => {
      this.pending = { request: { ...structuredClone(request), id: randomUUID() }, resolve };
      this.options.send(this.pending.request);
    });
  }
  async complete(id: string, operation?: ImageLibraryEdit) {
    const pending = this.pending;
    if (!pending || pending.request.id !== id) throw Error('画像の編集が終了しています。');
    if (operation) {
      try {
        await this.options.edit(operation);
      } catch (e) {
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

import { hostText } from '../../shared/i18n';
import {
  editImageLibrary,
  parseImageLibrary,
  type ImageLibrary,
  type ImageLibraryEdit,
} from '../../shared/registered-images';
import type { SettingsStore } from './settings';

export class ImageLibrarySettingsError extends Error {
  readonly code = 'REVISION_CONFLICT';
  constructor() {
    super(hostText('services.sharedRegisteredImages.changed'));
  }
}

/** Classification owns settings only. Planning never reads or changes original image files. */
export class ImageLibrarySettings {
  constructor(
    private settings: Pick<SettingsStore, 'value' | 'revision' | 'save'>,
    private writable: () => void,
  ) {}
  get revision() {
    return this.settings.revision;
  }
  snapshot() {
    return parseImageLibrary(this.settings.value.imageLibrary);
  }
  plan(value: ImageLibrary, expectedRevision: number) {
    this.writable();
    if (this.revision !== expectedRevision) throw new ImageLibrarySettingsError();
    const before = JSON.stringify(this.settings.value.imageLibrary);
    const current = this.snapshot(),
      next = parseImageLibrary(value);
    const changed = JSON.stringify(current) !== JSON.stringify(next);
    return {
      changed,
      commit: (preflight?: () => void) => {
        this.writable();
        preflight?.();
        if (
          this.revision !== expectedRevision ||
          JSON.stringify(this.settings.value.imageLibrary) !== before
        )
          throw new ImageLibrarySettingsError();
        if (changed)
          this.settings.save({ ...this.settings.value, imageLibrary: next }, expectedRevision);
      },
    };
  }
  edit(operation: ImageLibraryEdit) {
    this.writable();
    this.plan(
      editImageLibrary(this.settings.value.imageLibrary, operation),
      this.revision,
    ).commit();
  }
}

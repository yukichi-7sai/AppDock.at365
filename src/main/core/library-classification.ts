import { soundGroupsForBrowser, soundLibraryFromBrowser } from '../../shared/sound-library';
import type { LibraryMedia } from '../../shared/library-assets';
import { libraryText } from '../../shared/library-text';
import {
  editImageLibrary,
  parseImageLibrary,
  type ImageLibrary,
  type ImageLibraryEdit,
  type ImageGroup,
  imageKey,
} from '../../shared/registered-images';
import type { SettingsStore } from './settings';

export class ImageLibrarySettingsError extends Error {
  readonly code = 'REVISION_CONFLICT';
  constructor(media: LibraryMedia = 'image') {
    super(libraryText(media, 'services.sharedRegisteredImages.changed'));
  }
}

/** Classification owns settings only. Planning never reads or changes original image files. */
export class LibraryClassificationStore {
  constructor(
    private settings: Pick<SettingsStore, 'value' | 'revision' | 'save'>,
    private writable: () => void,
    readonly media: LibraryMedia = 'image',
  ) {}
  private get value() {
    return this.media === 'image'
      ? this.settings.value.imageLibrary
      : soundGroupsForBrowser(this.settings.value.soundLibrary);
  }
  get revision() {
    return this.settings.revision;
  }
  snapshot() {
    return parseImageLibrary(this.value, this.media);
  }
  plan(value: ImageLibrary, expectedRevision: number) {
    this.writable();
    if (this.revision !== expectedRevision) throw new ImageLibrarySettingsError(this.media);
    const before = JSON.stringify(this.value);
    const current = this.snapshot(),
      next = parseImageLibrary(value, this.media);
    const changed = JSON.stringify(current) !== JSON.stringify(next);
    return {
      changed,
      commit: (preflight?: () => void) => {
        this.writable();
        preflight?.();
        if (this.revision !== expectedRevision || JSON.stringify(this.value) !== before)
          throw new ImageLibrarySettingsError(this.media);
        if (changed)
          this.settings.save(
            {
              ...this.settings.value,
              ...(this.media === 'image'
                ? { imageLibrary: next }
                : { soundLibrary: soundLibraryFromBrowser(next) }),
            },
            expectedRevision,
          );
      },
    };
  }
  edit(operation: ImageLibraryEdit) {
    this.writable();
    this.plan(editImageLibrary(this.value, operation, this.media), this.revision).commit();
  }
  /** Add downloaded classifications in one revision, retaining manual names, order and memberships. */
  addImportedGroups(imported: ImageGroup[]) {
    const next = this.snapshot();
    const byId = new Map(next.groups.map((group) => [group.id, group]));
    const byName = new Map(next.groups.map((group) => [group.name.toLowerCase(), group]));
    for (const incoming of imported) {
      if (!incoming.images.length) continue;
      let group = byId.get(incoming.id) ?? byName.get(incoming.name.toLowerCase());
      if (!group) {
        group = { ...incoming, images: [] };
        next.groups.push(group);
        byId.set(group.id, group);
        byName.set(group.name.toLowerCase(), group);
      }
      const members = new Set(group.images.map(imageKey));
      for (const image of incoming.images) {
        if (!members.has(imageKey(image))) {
          group.images.push(image);
          members.add(imageKey(image));
        }
      }
    }
    this.plan(next, this.revision).commit();
  }
}

import { fileGroupsForBrowser, fileLibraryFromBrowser } from '../../shared/file-library';
import { snippetGroupId } from '../../shared/text-library';
import { hostText } from '../../shared/i18n';
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
      : fileGroupsForBrowser(
          this.media === 'text'
            ? this.settings.value.textLibrary
            : this.settings.value.soundLibrary,
          this.media,
        );
  }
  get revision() {
    return this.settings.revision;
  }
  snapshot() {
    const value = parseImageLibrary(this.value, this.media);
    if (this.media !== 'text') return value;
    const fixed = value.groups.find((group) => group.id === snippetGroupId);
    const others = value.groups.filter((group) => group !== fixed);
    const names = new Set(others.map((group) => group.name));
    const title = hostText('inputPalette.snippets');
    let name = title;
    for (let n = 1; names.has(name); n++) name = title + ' (' + n + ')';
    return { groups: [{ id: snippetGroupId, name, images: fixed?.images ?? [] }, ...others] };
  }
  plan(value: ImageLibrary, expectedRevision: number) {
    this.writable();
    if (this.revision !== expectedRevision) throw new ImageLibrarySettingsError(this.media);
    const before = JSON.stringify(this.value);
    const current = this.snapshot(),
      next = parseImageLibrary(value, this.media);
    if (
      this.media === 'text' &&
      (next.groups[0]?.id !== snippetGroupId || next.groups[0].name !== current.groups[0].name)
    )
      throw new ImageLibrarySettingsError(this.media);
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
                : this.media === 'text'
                  ? {
                      textLibrary: fileLibraryFromBrowser(
                        {
                          groups: next.groups.filter(
                            (g) => g.id !== snippetGroupId || g.images.length,
                          ),
                        },
                        'text',
                      ),
                    }
                  : { soundLibrary: fileLibraryFromBrowser(next) }),
            },
            expectedRevision,
          );
      },
    };
  }
  edit(operation: ImageLibraryEdit, orderGroups?: readonly Pick<ImageGroup, 'id' | 'name'>[]) {
    this.writable();
    if (operation.kind === 'order' && orderGroups) {
      const current = this.snapshot().groups;
      if (
        current.length !== orderGroups.length ||
        current.some(
          (group, index) =>
            group.id !== orderGroups[index].id || group.name !== orderGroups[index].name,
        )
      )
        throw new ImageLibrarySettingsError(this.media);
    }
    this.plan(editImageLibrary(this.snapshot(), operation, this.media), this.revision).commit();
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

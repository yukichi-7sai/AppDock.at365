import { libraryText } from '../../shared/library-text';
import type { LibraryMedia } from '../../shared/library-assets';
import { stateStorage, type StateStorage } from './state-storage';
import { gallerySize, libraryGallerySize, validGalleryWidth } from '../../shared/image-gallery';
import { defaultLibraryView, validLibraryView, type LibraryView } from '../../shared/library-view';
import {
  defaultImageLibraryLayout,
  validImageLibraryLayout,
  validImageGalleryViewState,
  type ImageGalleryViewState,
  type ImageLibraryLayout,
} from '../../shared/image-library-page';
type State = ImageGalleryViewState;
export class GalleryViewStateStore {
  private state: State = { schemaVersion: 1 };
  private blocked = false;
  private storage: StateStorage;
  error = '';
  private text = (key: string) => libraryText(this.media, key);
  constructor(
    storage: StateStorage | string,
    private media: LibraryMedia = 'image',
  ) {
    this.storage = stateStorage(storage);
    try {
      const value: any = this.storage.read();
      if (value === undefined) return;
      if (!validImageGalleryViewState(value)) throw Error('invalid state');
      this.state = value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.blocked = true;
        this.error = this.text('services.galleryViewState.readFailed');
      }
    }
  }
  get(surface: 'library' | 'picker') {
    return this.state[surface]?.cardWidth ?? (this.media === 'sound' ? 160 : gallerySize.initial);
  }
  save(surface: 'library' | 'picker', cardWidth: number) {
    if (
      !['library', 'picker'].includes(surface) ||
      !validGalleryWidth(cardWidth, libraryGallerySize)
    )
      throw Error(this.text('services.galleryViewState.invalidSize'));
    if (this.blocked) throw Error(this.error);
    const next: State = { ...this.state, [surface]: { ...this.state[surface], cardWidth } };
    this.write(next);
  }
  layout(surface: 'library' | 'picker' = 'library') {
    return structuredClone(this.state[surface]?.layout ?? defaultImageLibraryLayout);
  }
  saveLayout(layout: ImageLibraryLayout, surface: 'library' | 'picker' = 'library') {
    if (!['library', 'picker'].includes(surface) || !validImageLibraryLayout(layout))
      throw Error(this.text('services.galleryViewState.invalidSize'));
    if (this.blocked) throw Error(this.error);
    this.write({
      ...this.state,
      [surface]: {
        ...this.state[surface],
        cardWidth: this.get(surface),
        layout: structuredClone(layout),
      },
    });
  }
  view(): LibraryView {
    return structuredClone(this.state.library?.view ?? defaultLibraryView);
  }
  saveView(view: LibraryView) {
    if (!validLibraryView(view)) throw Error(this.text('services.galleryViewState.invalidSize'));
    if (this.blocked) throw Error(this.error);
    this.write({
      ...this.state,
      library: {
        ...this.state.library,
        cardWidth: this.get('library'),
        view: structuredClone(view),
      },
    });
  }
  private write(next: State) {
    try {
      this.storage.write(next);
    } catch {
      throw Error(this.text('services.galleryViewState.saveFailed'));
    }
    this.state = next;
  }
}

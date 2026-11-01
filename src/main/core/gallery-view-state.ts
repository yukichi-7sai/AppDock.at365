import { hostText } from '../../shared/i18n';
import { stateStorage, type StateStorage } from './state-storage';
import { gallerySize, libraryGallerySize, validGalleryWidth } from '../../shared/image-gallery';
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
  constructor(storage: StateStorage | string) {
    this.storage = stateStorage(storage);
    try {
      const value: any = this.storage.read();
      if (value === undefined) return;
      if (!validImageGalleryViewState(value)) throw Error('invalid state');
      this.state = value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.blocked = true;
        this.error = hostText('services.galleryViewState.readFailed');
      }
    }
  }
  get(surface: 'library' | 'picker') {
    return this.state[surface]?.cardWidth ?? gallerySize.initial;
  }
  save(surface: 'library' | 'picker', cardWidth: number) {
    if (
      !['library', 'picker'].includes(surface) ||
      !validGalleryWidth(cardWidth, surface === 'library' ? libraryGallerySize : gallerySize)
    )
      throw Error(hostText('services.galleryViewState.invalidSize'));
    if (this.blocked) throw Error(this.error);
    const next: State = { ...this.state, [surface]: { ...this.state[surface], cardWidth } };
    this.write(next);
  }
  layout() {
    return structuredClone(this.state.library?.layout ?? defaultImageLibraryLayout);
  }
  saveLayout(layout: ImageLibraryLayout) {
    if (!validImageLibraryLayout(layout))
      throw Error(hostText('services.galleryViewState.invalidSize'));
    if (this.blocked) throw Error(this.error);
    this.write({
      ...this.state,
      library: { cardWidth: this.get('library'), layout: structuredClone(layout) },
    });
  }
  private write(next: State) {
    try {
      this.storage.write(next);
    } catch {
      throw Error(hostText('services.galleryViewState.saveFailed'));
    }
    this.state = next;
  }
}

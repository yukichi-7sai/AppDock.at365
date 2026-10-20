import fs from 'node:fs';
import { atomicWrite } from './settings';
import { gallerySize, validGalleryWidth } from '../../shared/image-gallery';
type State = { schemaVersion: 1; library?: { cardWidth: number }; picker?: { cardWidth: number } };
export class GalleryViewStateStore {
  private state: State = { schemaVersion: 1 };
  private blocked = false;
  private previous?: Buffer;
  error = '';
  constructor(private file: string) {
    try {
      this.previous = fs.readFileSync(file);
      const value = JSON.parse(this.previous.toString('utf8').replace(/^\uFEFF/, ''));
      if (
        !value ||
        value.schemaVersion !== 1 ||
        Object.keys(value).some((k) => !['schemaVersion', 'library', 'picker'].includes(k)) ||
        ['library', 'picker'].some(
          (k) =>
            value[k] !== undefined &&
            (!value[k] ||
              Object.keys(value[k]).some((n) => n !== 'cardWidth') ||
              !validGalleryWidth(value[k].cardWidth)),
        )
      )
        throw Error('invalid state');
      this.state = value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.blocked = true;
        this.error = '表示サイズの保存ファイルを読み取れません。元のファイルを確認してください。';
      }
    }
  }
  get(surface: 'library' | 'picker') {
    return this.state[surface]?.cardWidth ?? gallerySize.initial;
  }
  save(surface: 'library' | 'picker', cardWidth: number) {
    if (!['library', 'picker'].includes(surface) || !validGalleryWidth(cardWidth))
      throw Error('画像サイズを確認してください。');
    if (this.blocked) throw Error(this.error);
    const next: State = { ...this.state, [surface]: { cardWidth } };
    const bytes = Buffer.from(JSON.stringify(next, null, 2));
    try {
      atomicWrite(this.file, bytes, { previous: this.previous });
    } catch {
      throw Error('表示サイズを保存できませんでした。保存先を確認して再試行してください。');
    }
    this.state = next;
    this.previous = bytes;
  }
}

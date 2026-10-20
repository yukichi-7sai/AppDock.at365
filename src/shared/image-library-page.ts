import type { GalleryAnchor, GalleryItem } from './image-gallery';
import type {
  ImageGroup,
  ImageLibraryEdit,
  RegisteredImageEntry,
  RegisteredImageRef,
} from './registered-images';
export interface ImageLibraryPageRequest {
  id: string;
  kind: 'image-library';
  route: 'image-library';
}
export type ImageLibraryDialogKind =
  'add' | 'rename' | 'delete' | 'order' | 'membership' | 'batch-add' | 'batch-remove' | 'preview';
export interface ImageLibraryDialogRequest {
  id: string;
  kind: ImageLibraryDialogKind;
  groups: ImageGroup[];
  images: RegisteredImageRef[];
  groupId?: string;
  entry?: RegisteredImageEntry;
}
export interface ImageLibraryDialogApi {
  onRequest(callback: (request: ImageLibraryDialogRequest | null) => void): () => void;
  complete(id: string, operation?: ImageLibraryEdit): Promise<void>;
}
export interface ImageLibraryPageModel {
  schemaVersion: 1;
  id: string;
  kind: 'image-library';
  contextId: 'primary';
  revision: number;
  dark: boolean;
  content: {
    groups: { id: string; title: string; count: number }[];
    group: string;
    query: string;
    items: GalleryItem[];
    total: number;
    selected: number;
    cardWidth: number;
    sizeError: string;
    error: string;
    message: string;
    busy: boolean;
    remaining: number;
    anchor?: GalleryAnchor;
    viewRevision: number;
    canAddGroup: boolean;
    canOrder: boolean;
    canRetryMembership: boolean;
  };
}
export type ImageLibraryPageAction = {
  id: string;
  type: 'gallery';
} & (
  | { command: 'query'; value: string }
  | { command: 'group'; groupId: string }
  | { command: 'select'; imageId: string; selected: boolean }
  | { command: 'select-all' | 'clear' | 'more' | 'reload' | 'add' | 'retry-membership' }
  | { command: 'width'; value: number; commit: boolean }
  | { command: 'anchor'; anchor?: GalleryAnchor }
  | { command: 'dialog'; kind: ImageLibraryDialogKind; imageId?: string; groupId?: string }
  | { command: 'image'; assetId: string; edge: number }
);

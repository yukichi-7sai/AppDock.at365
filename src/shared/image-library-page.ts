import type { GalleryAnchor, GalleryItem } from './image-gallery';
import type {
  ImageGroup,
  ImageLibraryEdit,
  RegisteredImageEntry,
  RegisteredImageRef,
} from './registered-images';
export interface IconImportProgress {
  phase: 'download' | 'metadata' | 'validate' | 'import' | 'groups';
  completed: number;
  total: number;
  added: number;
  reused: number;
  failed: number;
}
export interface ImageLibraryPageRequest {
  id: string;
  kind: 'image-library';
  route: 'image-library';
}
export type ImageLibraryDialogKind =
  | 'add'
  | 'rename'
  | 'delete'
  | 'order'
  | 'order-images'
  | 'membership'
  | 'batch-add'
  | 'batch-remove'
  | 'preview'
  | 'folder-create'
  | 'folder-rename'
  | 'folder-delete'
  | 'folder-move'
  | 'import-set'
  | 'import-progress'
  | 'delete-image';
export type ImageLibraryDialogOperation =
  | ImageLibraryEdit
  | { kind: 'delete-image' }
  | { kind: 'folder'; destination: string }
  | { kind: 'import-set'; setId: string };
export interface ImageLibraryDialogRequest {
  id: string;
  kind: ImageLibraryDialogKind;
  groups: ImageGroup[];
  images: RegisteredImageRef[];
  groupId?: string;
  entry?: RegisteredImageEntry;
  deleteBlocked?: boolean;
  folder?: string;
  folders?: string[];
  iconSets?: { id: string; name: string }[];
  importing?: IconImportProgress;
  cancelling?: boolean;
}
export interface ImageLibraryDialogApi {
  onRequest(callback: (request: ImageLibraryDialogRequest | null) => void): () => void;
  complete(id: string, operation?: ImageLibraryDialogOperation): Promise<void>;
}
export interface ImageLibraryPageModel {
  schemaVersion: 1;
  id: string;
  kind: 'image-library';
  contextId: 'primary';
  revision: number;
  dark: boolean;
  content: {
    iconSets: { id: string; name: string }[];
    importing?: IconImportProgress;
    folders: string[];
    folder: string;
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
    canRetryIconImport: boolean;
  };
}
export type ImageLibraryPageAction = {
  id: string;
  type: 'gallery';
} & (
  | { command: 'query'; value: string }
  | { command: 'folder'; folder: string }
  | { command: 'import-set'; setId: string }
  | { command: 'cancel-import' }
  | { command: 'retry-import' }
  | {
      command: 'folder-action';
      operation: 'create' | 'rename' | 'delete' | 'move-images';
      folder: string;
      destination?: string;
    }
  | { command: 'group'; groupId: string }
  | { command: 'select'; imageId: string; selected: boolean }
  | { command: 'select-range'; imageIds: string[]; additive: boolean }
  | { command: 'drag-start'; imageId: string }
  | { command: 'drop'; token: string; groupId: string }
  | { command: 'reorder'; token: string; imageId: string; after: boolean }
  | { command: 'select-all' | 'clear' | 'more' | 'reload' | 'add' | 'retry-membership' }
  | { command: 'width'; value: number; commit: boolean }
  | { command: 'anchor'; anchor?: GalleryAnchor }
  | { command: 'dialog'; kind: ImageLibraryDialogKind; imageId?: string; groupId?: string }
  | { command: 'image'; assetId: string; edge: number }
);

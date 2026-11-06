import type { GalleryAnchor, GalleryItem } from './image-gallery';
import { libraryGallerySize, validGalleryWidth } from './image-gallery';
import { validLibraryView, type LibraryView } from './library-view';
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
export type ImageLibraryPageRequest = { id: string } & (
  | { kind: 'image-library'; route: 'image-library' }
  | { kind: 'sound-library'; route: 'sound-library' }
  | { kind: 'text-library'; route: 'text-library' }
);
export type ImageLibraryDialogKind =
  | 'text-create'
  | 'text-duplicate'
  | 'text-edit'
  | 'text-preview'
  | 'add'
  | 'rename'
  | 'delete'
  | 'order'
  | 'order-images'
  | 'membership'
  | 'batch-add'
  | 'batch-remove'
  | 'preview'
  | 'rename-images'
  | 'folder-create'
  | 'folder-rename'
  | 'folder-delete'
  | 'folder-move'
  | 'import-set'
  | 'import-progress'
  | 'delete-image';
export type ImageLibraryDialogOperation =
  | { kind: 'text-save'; name: string; body: string }
  | ImageLibraryEdit
  | { kind: 'delete-image' }
  | { kind: 'rename-images'; names: string[] }
  | { kind: 'folder'; destination: string }
  | { kind: 'import-set'; setId: string };
export interface ImageLibraryDialogRequest {
  media?: import('./library-assets').LibraryMedia;
  id: string;
  kind: Exclude<ImageLibraryDialogKind, 'text-duplicate'>;
  groups: ImageGroup[];
  images: RegisteredImageRef[];
  groupId?: string;
  entry?: RegisteredImageEntry;
  entries?: RegisteredImageEntry[];
  deleteBlocked?: boolean;
  folder?: string;
  folders?: string[];
  iconSets?: { id: string; name: string }[];
  importing?: IconImportProgress;
  cancelling?: boolean;
  document?: import('./text-library').LibraryTextDocument;
}
export interface ImageLibraryLayout {
  sidebarWidth: number;
  collapsedGroups: string[];
  collapsedFolders: string[];
}
export const defaultImageLibraryLayout: ImageLibraryLayout = {
  sidebarWidth: 220,
  collapsedGroups: [],
  collapsedFolders: [],
};
export function validImageLibraryLayout(value: unknown): value is ImageLibraryLayout {
  if (!value || typeof value !== 'object') return false;
  const v = value as ImageLibraryLayout;
  return (
    Object.keys(v).every((k) =>
      ['sidebarWidth', 'collapsedGroups', 'collapsedFolders'].includes(k),
    ) &&
    Number.isInteger(v.sidebarWidth) &&
    v.sidebarWidth >= 160 &&
    v.sidebarWidth <= 480 &&
    [v.collapsedGroups, v.collapsedFolders].every(
      (a) =>
        Array.isArray(a) && a.every((s) => typeof s === 'string') && new Set(a).size === a.length,
    )
  );
}
export type ImageLibraryFileAction =
  'copy-files' | 'copy-paths' | 'copy-image' | 'copy-text' | 'reveal';
export interface ImageGalleryViewState {
  schemaVersion: 1;
  library?: { cardWidth: number; layout?: ImageLibraryLayout; view?: LibraryView };
  picker?: { cardWidth: number; layout?: ImageLibraryLayout };
}
export function validImageGalleryViewState(value: unknown): value is ImageGalleryViewState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as ImageGalleryViewState;
  return (
    v.schemaVersion === 1 &&
    Object.keys(v).every((key) => ['schemaVersion', 'library', 'picker'].includes(key)) &&
    (['library', 'picker'] as const).every((surface) => {
      const item = v[surface];
      return (
        item === undefined ||
        (!!item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          Object.keys(item).every(
            (key) =>
              key === 'cardWidth' || key === 'layout' || (surface === 'library' && key === 'view'),
          ) &&
          validGalleryWidth(item.cardWidth, libraryGallerySize) &&
          (!('view' in item) || item.view === undefined || validLibraryView(item.view)) &&
          (item.layout === undefined || validImageLibraryLayout(item.layout)))
      );
    })
  );
}
export interface ImageLibraryDialogApi {
  onRequest(callback: (request: ImageLibraryDialogRequest | null) => void): () => void;
  complete(id: string, operation?: ImageLibraryDialogOperation): Promise<void>;
}
export interface ImageLibraryPageModel {
  schemaVersion: 1;
  id: string;
  kind: 'image-library' | 'sound-library' | 'text-library';
  contextId: 'primary';
  revision: number;
  dark: boolean;
  content: {
    playback?: import('./registered-images').LibraryPlayback;
    indexing?: boolean;
    iconSets: { id: string; name: string }[];
    importing?: IconImportProgress;
    folders: string[];
    folder: string;
    groups: { id: string; title: string; count: number; fixed?: boolean }[];
    group: string;
    query: string;
    items: GalleryItem[];
    total: number;
    selected: number;
    cardWidth: number;
    layout: ImageLibraryLayout;
    view: LibraryView;
    sizeError: string;
    error: string;
    message: string;
    messageRevision: number;
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
  | { command: 'sound-generation' }
  | { command: 'image-generation' }
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
  | { command: 'select-target'; imageId: string }
  | { command: 'file-action'; operation: ImageLibraryFileAction; imageId?: string }
  | { command: 'open-folder'; folder?: string }
  | { command: 'layout'; value: ImageLibraryLayout }
  | { command: 'view'; value: LibraryView }
  | { command: 'select-range'; imageIds: string[]; additive: boolean }
  | { command: 'drag-start'; imageId: string }
  | { command: 'drop'; token: string; groupId: string }
  | { command: 'drop-folder'; token: string; folder: string }
  | { command: 'remove-from-group'; token?: string }
  | { command: 'reorder'; token: string; imageId: string; after: boolean }
  | { command: 'select-all' | 'clear' | 'more' | 'reload' | 'add' | 'retry-membership' }
  | { command: 'width'; value: number; commit: boolean }
  | { command: 'anchor'; anchor?: GalleryAnchor }
  | {
      command: 'dialog';
      kind: ImageLibraryDialogKind;
      imageId?: string;
      groupId?: string;
      folder?: string;
    }
  | { command: 'image'; assetId: string; edge: number }
  | { command: 'stop-playback' }
);

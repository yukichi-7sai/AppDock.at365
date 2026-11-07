import { libraryText } from './library-text';
import { imagePath } from './image-paths';
import { libraryReference, snippetGroupId, type LibraryMedia } from './library-assets';

export interface RegisteredImageRef {
  file: string;
}
export interface ImageGroup {
  id: string;
  name: string;
  images: RegisteredImageRef[];
}
export interface ImageLibrary {
  groups: ImageGroup[];
}
export interface RegisteredImageEntry {
  ref: RegisteredImageRef;
  width: number;
  height: number;
  bytes: number;
  thumbnail: string;
  /** A safe, present file that can be requested; pixels are validated on first use. */
  available: boolean;
  /** Optional richer status for gallery adapters. Unknown dimensions are zero until first use. */
  state?: 'ready' | 'missing' | 'error';
  /** Opaque file-version token, not an image-content hash. */
  generation?: string;
  durationMs?: number;
}
export interface LibraryPlayback {
  file: string;
  state: 'loading' | 'waiting' | 'playing';
  error?: string;
}
export interface ImageLibrarySnapshot {
  sources?: import('./library-sources').LibrarySourceSnapshot[];
  playback?: LibraryPlayback;
  folders?: string[];
  images: RegisteredImageEntry[];
  groups: ImageGroup[];
  revision: number;
  error?: string;
}
export type ImagePickResult =
  { cancelled: true } | { cancelled: false; image: RegisteredImageRef | null; name?: string };
export type ImageLibraryEdit =
  | { kind: 'add'; group: ImageGroup }
  | { kind: 'update'; group: ImageGroup; before: ImageGroup }
  | { kind: 'delete'; id: string; before: ImageGroup }
  | { kind: 'order'; ids: string[]; before: string[] }
  | {
      kind: 'membership-batch';
      groupId: string;
      mode: 'add' | 'remove';
      images: { image: RegisteredImageRef; before: string[] }[];
    }
  | { kind: 'membership'; image: RegisteredImageRef; ids: string[]; before: string[] };
export interface ImageLibraryApi {
  media?: LibraryMedia;
  play?(ref: RegisteredImageRef): Promise<void>;
  stop?(): Promise<void>;
  retain?(image: RegisteredImageRef): Promise<RegisteredImageRef>;
  snapshot(): Promise<ImageLibrarySnapshot>;
  register(): Promise<RegisteredImageRef | null>;
  edit(operation: ImageLibraryEdit): Promise<void>;
  createImageSession(): Promise<string>;
  releaseImageSession(session: string): Promise<void>;
  preview(image: RegisteredImageRef, original?: boolean, session?: string): Promise<string | null>;
  galleryImage(
    image: RegisteredImageRef,
    generation: string,
    edge: number,
    session?: string,
  ): Promise<string>;
  galleryView(): Promise<{
    cardWidth: number;
    layout: import('./image-library-page').ImageLibraryLayout;
    error: string;
  }>;
  saveGalleryWidth(value: number): Promise<void>;
  saveGalleryLayout(value: import('./image-library-page').ImageLibraryLayout): Promise<void>;
  pick(current?: RegisteredImageRef | null): Promise<ImagePickResult>;
  onChanged(callback: () => void): () => void;
  onPickRequest?(
    callback: (request: { id: string; current: RegisteredImageRef | null } | null) => void,
  ): () => void;
  completePick?(id: string, result: ImagePickResult): Promise<void>;
  onPickBackdrop?(
    callback: (
      surfaces: {
        image: string;
        bounds: { x: number; y: number; width: number; height: number };
      }[],
    ) => void,
  ): () => void;
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const imageFilename = (v: unknown): v is string => imagePath(v);
export function imageReference(v: unknown): v is RegisteredImageRef {
  return object(v) && Object.keys(v).length === 1 && imageFilename(v.file);
}
export const imageKey = (v: RegisteredImageRef) => v.file.toLowerCase();
export function parseImageLibrary(value: unknown, media: LibraryMedia = 'image'): ImageLibrary {
  const text = (key: string) => libraryText(media, key);
  if (value === undefined) return { groups: [] };
  if (
    !object(value) ||
    Object.keys(value).some((k) => k !== 'groups') ||
    !Array.isArray(value.groups)
  )
    throw Error(text('services.sharedRegisteredImages.groupLimit'));
  const ids = new Set<string>(),
    names = new Set<string>();
  const groups = value.groups.map((g: unknown): ImageGroup => {
    if (
      !object(g) ||
      Object.keys(g).some((k) => !['id', 'name', 'images'].includes(k)) ||
      typeof g.id !== 'string' ||
      (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(g.id) && !(media === 'text' && g.id === snippetGroupId)) ||
      ids.has(g.id) ||
      typeof g.name !== 'string' ||
      !g.name.trim() ||
      g.name.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(g.name) ||
      names.has(g.name.trim().toLowerCase()) ||
      !Array.isArray(g.images) ||
      !g.images.every((ref: unknown) => libraryReference(ref, media))
    )
      throw Error(text('services.sharedRegisteredImages.invalidGroup'));
    if (new Set(g.images.map(imageKey)).size !== g.images.length)
      throw Error(text('services.sharedRegisteredImages.membershipLimit'));
    ids.add(g.id);
    names.add(g.name.trim().toLowerCase());
    return { id: g.id, name: g.name.trim(), images: structuredClone(g.images) };
  });
  return { groups };
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function editImageLibrary(
  current: ImageLibrary | undefined,
  op: ImageLibraryEdit,
  media: LibraryMedia = 'image',
): ImageLibrary {
  const text = (key: string) => libraryText(media, key);
  const next = parseImageLibrary(current, media);
  const groupsById = new Map(next.groups.map((group) => [group.id, group]));
  const conflict = () => {
    throw Error(text('services.sharedRegisteredImages.changed'));
  };
  if (!object(op)) throw Error(text('services.sharedRegisteredImages.invalidOperation'));
  if (op.kind === 'add') {
    if (groupsById.has(op.group?.id)) conflict();
    next.groups.push(op.group);
  } else if (op.kind === 'update' || op.kind === 'delete') {
    const id = op.kind === 'update' ? op.group?.id : op.id;
    const index = next.groups.findIndex((g) => g.id === id);
    if (index < 0 || !equal(next.groups[index], op.before)) conflict();
    if (op.kind === 'update') next.groups[index] = op.group;
    else next.groups.splice(index, 1);
  } else if (op.kind === 'order') {
    if (
      !equal(
        next.groups.map((g) => g.id),
        op.before,
      ) ||
      !Array.isArray(op.ids) ||
      op.ids.length !== next.groups.length ||
      new Set(op.ids).size !== op.ids.length ||
      op.ids.some((id) => !groupsById.has(id))
    )
      conflict();
    next.groups = op.ids.map((id) => groupsById.get(id)!);
  } else if (op.kind === 'membership') {
    if (
      !libraryReference(op.image, media) ||
      !Array.isArray(op.ids) ||
      !Array.isArray(op.before) ||
      new Set(op.ids).size !== op.ids.length ||
      op.ids.some((id) => !groupsById.has(id))
    )
      throw Error(text('services.sharedRegisteredImages.invalidDestination'));
    const memberships = next.groups
      .filter((g) => g.images.some((i) => imageKey(i) === imageKey(op.image)))
      .map((g) => g.id)
      .sort();
    if (!equal(memberships, [...op.before].sort())) conflict();
    const destinations = new Set(op.ids);
    for (const g of next.groups) {
      if (!destinations.has(g.id))
        g.images = g.images.filter((i) => imageKey(i) !== imageKey(op.image));
      else if (!g.images.some((i) => imageKey(i) === imageKey(op.image))) g.images.push(op.image);
    }
  } else if (op.kind === 'membership-batch') {
    if (
      !['add', 'remove'].includes(op.mode) ||
      !groupsById.has(op.groupId) ||
      !Array.isArray(op.images) ||
      !op.images.length ||
      op.images.some(
        (v) =>
          !object(v) ||
          !libraryReference(v.image, media) ||
          !Array.isArray(v.before) ||
          v.before.some((id) => typeof id !== 'string'),
      ) ||
      new Set(op.images.map((v) => imageKey(v.image))).size !== op.images.length
    )
      throw Error(text('services.sharedRegisteredImages.invalidSelection'));
    // Validate every prior membership before applying anything. Save the whole result once.
    const memberships = new Map<string, string[]>();
    for (const group of next.groups)
      for (const image of group.images) {
        const key = imageKey(image);
        const ids = memberships.get(key) ?? [];
        ids.push(group.id);
        memberships.set(key, ids);
      }
    for (const item of op.images) {
      const before = (memberships.get(imageKey(item.image)) ?? []).sort();
      if (!equal(before, [...item.before].sort())) conflict();
    }
    const group = groupsById.get(op.groupId)!;
    const selected = new Set(op.images.map(({ image }) => imageKey(image)));
    if (op.mode === 'remove')
      group.images = group.images.filter((image) => !selected.has(imageKey(image)));
    else {
      const existing = new Set(group.images.map(imageKey));
      for (const { image } of op.images)
        if (!existing.has(imageKey(image))) group.images.push(image);
    }
  } else throw Error(text('services.sharedRegisteredImages.unsupportedOperation'));
  return parseImageLibrary(next, media);
}

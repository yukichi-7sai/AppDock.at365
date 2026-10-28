import { hostText } from './i18n';
import { assetFilename } from './asset-names';

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
}
export interface ImageLibrarySnapshot {
  images: RegisteredImageEntry[];
  groups: ImageGroup[];
  revision: number;
  error?: string;
}
export type ImagePickResult =
  { cancelled: true } | { cancelled: false; image: RegisteredImageRef | null };
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
  snapshot(): Promise<ImageLibrarySnapshot>;
  register(): Promise<RegisteredImageRef | null>;
  edit(operation: ImageLibraryEdit): Promise<void>;
  preview(image: RegisteredImageRef, original?: boolean): Promise<string | null>;
  galleryImage(image: RegisteredImageRef, generation: string, edge: number): Promise<string>;
  galleryView(): Promise<{ cardWidth: number; error: string }>;
  saveGalleryWidth(value: number): Promise<void>;
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
export const imageFilename = (v: unknown): v is string =>
  assetFilename(v) && /\.(png|jpe?g|webp)$/i.test(v);
export function imageReference(v: unknown): v is RegisteredImageRef {
  return object(v) && Object.keys(v).length === 1 && imageFilename(v.file);
}
export const imageKey = (v: RegisteredImageRef) => v.file.toLowerCase();
export function parseImageLibrary(value: unknown): ImageLibrary {
  if (value === undefined) return { groups: [] };
  if (
    !object(value) ||
    Object.keys(value).some((k) => k !== 'groups') ||
    !Array.isArray(value.groups) ||
    value.groups.length > 64
  )
    throw Error(hostText('services.sharedRegisteredImages.groupLimit'));
  const ids = new Set<string>(),
    names = new Set<string>();
  let count = 0;
  const groups = value.groups.map((g: unknown): ImageGroup => {
    if (
      !object(g) ||
      Object.keys(g).some((k) => !['id', 'name', 'images'].includes(k)) ||
      typeof g.id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(g.id) ||
      ids.has(g.id) ||
      typeof g.name !== 'string' ||
      !g.name.trim() ||
      g.name.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(g.name) ||
      names.has(g.name.trim().toLowerCase()) ||
      !Array.isArray(g.images) ||
      g.images.length > 512 ||
      !g.images.every(imageReference)
    )
      throw Error(hostText('services.sharedRegisteredImages.invalidGroup'));
    if (
      new Set(g.images.map(imageKey)).size !== g.images.length ||
      (count += g.images.length) > 4096
    )
      throw Error(hostText('services.sharedRegisteredImages.membershipLimit'));
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
): ImageLibrary {
  const next = parseImageLibrary(current);
  const conflict = () => {
    throw Error(hostText('services.sharedRegisteredImages.changed'));
  };
  if (!object(op)) throw Error(hostText('services.sharedRegisteredImages.invalidOperation'));
  if (op.kind === 'add') {
    if (next.groups.some((g) => g.id === op.group?.id)) conflict();
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
      op.ids.some((id) => !next.groups.some((g) => g.id === id))
    )
      conflict();
    next.groups = op.ids.map((id) => next.groups.find((g) => g.id === id)!);
  } else if (op.kind === 'membership') {
    if (
      !imageReference(op.image) ||
      !Array.isArray(op.ids) ||
      !Array.isArray(op.before) ||
      new Set(op.ids).size !== op.ids.length ||
      op.ids.some((id) => !next.groups.some((g) => g.id === id))
    )
      throw Error(hostText('services.sharedRegisteredImages.invalidDestination'));
    const memberships = next.groups
      .filter((g) => g.images.some((i) => imageKey(i) === imageKey(op.image)))
      .map((g) => g.id)
      .sort();
    if (!equal(memberships, [...op.before].sort())) conflict();
    for (const g of next.groups) {
      g.images = g.images.filter((i) => imageKey(i) !== imageKey(op.image));
      if (op.ids.includes(g.id)) g.images.push(op.image);
    }
  } else if (op.kind === 'membership-batch') {
    if (
      !['add', 'remove'].includes(op.mode) ||
      !next.groups.some((g) => g.id === op.groupId) ||
      !Array.isArray(op.images) ||
      !op.images.length ||
      op.images.length > 4096 ||
      op.images.some(
        (v) =>
          !object(v) ||
          !imageReference(v.image) ||
          !Array.isArray(v.before) ||
          v.before.some((id) => typeof id !== 'string'),
      ) ||
      new Set(op.images.map((v) => imageKey(v.image))).size !== op.images.length
    )
      throw Error(hostText('services.sharedRegisteredImages.invalidSelection'));
    // Validate every prior membership before applying anything. Save the whole result once.
    for (const item of op.images) {
      const before = next.groups
        .filter((g) => g.images.some((i) => imageKey(i) === imageKey(item.image)))
        .map((g) => g.id)
        .sort();
      if (!equal(before, [...item.before].sort())) conflict();
    }
    const group = next.groups.find((g) => g.id === op.groupId)!;
    for (const { image } of op.images) {
      group.images = group.images.filter((i) => imageKey(i) !== imageKey(image));
      if (op.mode === 'add') group.images.push(image);
    }
  } else throw Error(hostText('services.sharedRegisteredImages.unsupportedOperation'));
  return parseImageLibrary(next);
}

import { validGroupId } from '../../shared/applet-pages';
import {
  validImageGalleryViewState,
  type ImageGalleryViewState,
} from '../../shared/image-library-page';
import { parseWindowState, type WindowState } from './window-state';

export interface DeviceUiState {
  ribbon?: {
    schemaVersion: 1;
    expanded: Record<string, boolean>;
    displayMode?: 'compact' | 'expanded';
  };
  gallery?: ImageGalleryViewState;
  windows?: Record<string, WindowState>;
}
const object = (value: any): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function parseDeviceUiState(value: unknown): DeviceUiState {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['ribbon', 'gallery', 'windows'].includes(key))
  )
    throw Error('Invalid device UI state');
  if (value.ribbon !== undefined) {
    const r = value.ribbon;
    if (
      !object(r) ||
      r.schemaVersion !== 1 ||
      !object(r.expanded) ||
      Object.keys(r).some((key) => !['schemaVersion', 'expanded', 'displayMode'].includes(key)) ||
      (r.displayMode !== undefined && !['compact', 'expanded'].includes(r.displayMode)) ||
      Object.entries(r.expanded).some(
        ([key, open]) => !validGroupId(key) || typeof open !== 'boolean',
      )
    )
      throw Error('Invalid ribbon UI state');
  }
  if (value.gallery !== undefined) {
    if (!validImageGalleryViewState(value.gallery)) throw Error('Invalid gallery UI state');
  }
  if (value.windows !== undefined) {
    if (!object(value.windows)) throw Error('Invalid window UI state');
    for (const [key, state] of Object.entries(value.windows)) {
      if (!key || ['__proto__', 'constructor', 'prototype'].includes(key))
        throw Error('Invalid window state key');
      parseWindowState(state);
    }
  }
  return structuredClone(value) as DeviceUiState;
}

import type { GestureSettings } from './gestures';

export type IndicatorDirection = 'up' | 'down' | 'left' | 'right';
export interface GestureIndicatorModel {
  x: number;
  y: number;
  process: string;
  directions: IndicatorDirection[];
  captions: string[];
  opacity: number;
  style: GestureSettings['indicatorStyle'];
  captionRows: number;
}
export type GestureIndicatorNotice =
  | { visible: false; revision: number }
  | ({ visible: true; revision: number } & GestureIndicatorModel);
export interface GestureIndicatorFrame {
  sequence: number;
  model: GestureIndicatorModel | null;
  followCursor: boolean;
}
export interface GestureIndicatorApi {
  connect(): Promise<GestureIndicatorFrame>;
  onChanged(callback: (frame: GestureIndicatorFrame) => void): () => void;
  measured(sequence: number, width: number, height: number): void;
  follow(sequence: number): void;
}
export function readGestureIndicatorNotice(value: unknown): GestureIndicatorNotice | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as GestureIndicatorNotice;
  if (!Number.isSafeInteger(v.revision) || v.revision < 0) return;
  if (v.visible === false) return { visible: false, revision: v.revision };
  if (
    v.visible !== true ||
    !Number.isInteger(v.x) ||
    !Number.isInteger(v.y) ||
    Math.abs(v.x) > 2147483647 ||
    Math.abs(v.y) > 2147483647 ||
    typeof v.process !== 'string' ||
    v.process.length > 260 ||
    !Array.isArray(v.directions) ||
    v.directions.length < 1 ||
    v.directions.length > 2 ||
    v.directions.some((d) => !['up', 'down', 'left', 'right'].includes(d)) ||
    !Array.isArray(v.captions) ||
    v.captions.length < 1 ||
    v.captions.length > 4 ||
    v.captions.some((c) => typeof c !== 'string' || c.length > 8192) ||
    !Number.isFinite(v.opacity) ||
    v.opacity < 0.1 ||
    v.opacity > 1 ||
    !['compact', 'pill', 'ring', 'classic'].includes(v.style) ||
    !Number.isInteger(v.captionRows) ||
    v.captionRows < 0 ||
    v.captionRows > 4
  )
    return;
  return {
    visible: true,
    revision: v.revision,
    x: v.x,
    y: v.y,
    process: v.process,
    directions: [...v.directions],
    captions: [...v.captions],
    opacity: v.opacity,
    style: v.style,
    captionRows: v.captionRows,
  };
}
declare global {
  interface Window {
    appdockGestureIndicator: GestureIndicatorApi;
  }
}

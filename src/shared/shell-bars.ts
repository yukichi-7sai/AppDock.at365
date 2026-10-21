export interface ShellBarViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
import type { ShellAppletApi } from './shell';

export type ShellBarRegion = 'titlebar' | 'statusbar';
export interface ShellBarModel {
  schemaVersion: 1;
  contextId: 'primary';
  region: ShellBarRegion;
  revision: number;
  dark: boolean;
  version: string;
  paletteKey: string;
  maximized: boolean;
  runningApplets: number;
  update: {
    busy: boolean;
    blocked: boolean;
    phase: string;
    cancellable: boolean;
    progress?: {
      name: string;
      index: number;
      count: number;
      receivedBytes: number;
      totalBytes?: number;
    };
  };
  /** Opaque host-issued IDs. Unavailable operations are omitted. */
  actions: Partial<
    Record<
      'palette' | 'notifications' | 'minimize' | 'maximize' | 'close' | 'update' | 'cancel',
      string
    >
  >;
}
export interface ShellBarAction {
  sessionId: string;
  requestId: string;
  actionId: string;
}
/** Both built-in and external title/status bars use this same local bridge. */
export interface ShellBarApi extends ShellAppletApi {
  connect(): Promise<{ sessionId: string; providerAppletId: string; snapshot: ShellBarModel }>;
  ready(sessionId: string): Promise<void>;
  invoke(action: ShellBarAction): Promise<unknown>;
  onChanged(callback: (model: ShellBarModel) => void): () => void;
  focusHost(edge: 'before' | 'after'): Promise<void>;
  onFocus(callback: (edge: 'first' | 'last') => void): () => void;
  shortcut(key: string): Promise<unknown>;
}

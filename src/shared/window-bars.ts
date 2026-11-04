export interface WindowBarViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowBarRegion = 'titlebar' | 'statusbar';
export interface WindowBarModel {
  schemaVersion: 1;
  contextId: 'primary';
  region: WindowBarRegion;
  revision: number;
  dark: boolean;
  version: string;
  paletteKey: string;
  maximized: boolean;
  runningApplets: number;
  activeNotificationCount: number;
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
      | 'back'
      | 'forward'
      | 'palette'
      | 'notifications'
      | 'minimize'
      | 'maximize'
      | 'close'
      | 'update'
      | 'cancel',
      string
    >
  >;
}
export interface WindowBarAction {
  sessionId: string;
  requestId: string;
  actionId: string;
}
/** Private bridge for host-owned title/status bars. */
export interface WindowBarApi {
  connect(): Promise<{ sessionId: string; snapshot: WindowBarModel }>;
  ready(sessionId: string): Promise<void>;
  invoke(action: WindowBarAction): Promise<unknown>;
  onChanged(callback: (model: WindowBarModel) => void): () => void;
  focusHost(edge: 'before' | 'after'): Promise<void>;
  onFocus(callback: (edge: 'first' | 'last') => void): () => void;
  shortcut(key: string): Promise<unknown>;
}

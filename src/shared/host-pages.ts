import type { LogEntry } from './contracts';

export type LogScope = { type: 'all' } | { type: 'applet'; id: string } | { type: 'web' };
export interface LogFilters {
  source: string;
  level: 'all' | 'info' | 'warn' | 'error';
  text: string;
}
/** Requests belong to a mounted host slot, not to the presentation provider. */
export interface LogPageRequest {
  id: string;
  route: string;
  kind: 'logs';
  scope: LogScope;
  source: string;
}
export interface HomePageRequest {
  id: string;
  route: 'home';
  kind: 'home';
  /** Read-only projection from saved host settings. */
  appletOrder: string[];
}
export type HostPageRequest =
  | LogPageRequest
  | HomePageRequest
  | import('./notification-center').NotificationCenterRequest
  | import('./image-library-page').ImageLibraryPageRequest;
export interface LogPageModel {
  schemaVersion: 1;
  id: string;
  contextId: 'primary';
  kind: 'logs';
  revision: number;
  dark: boolean;
  content: {
    scope: LogScope;
    filters: LogFilters;
    sources: { id: string; title: string }[];
    entries: LogEntry[];
    limit: number;
  };
}
export interface HomePageModel {
  schemaVersion: 1;
  id: string;
  contextId: 'primary';
  kind: 'home';
  revision: number;
  dark: boolean;
  content: {
    stats: { running: number; errors: number; applets: number; commands: number };
    pins: {
      id: string;
      title: string;
      extension: string;
      available: boolean;
      disabledReason?: string;
      actionId: string;
    }[];
    applets: {
      id: string;
      title: string;
      description: string;
      state: 'waiting' | 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
      runtime: 'node' | 'dotnet' | 'native' | 'web';
      collection?: boolean;
      version: string;
      actionId: string;
    }[];
    actions: { palette: string; logs: string; applets: string };
    busy: boolean;
    error: string;
    message: string;
  };
}
export type HostPageModel =
  | LogPageModel
  | HomePageModel
  | import('./notification-center').NotificationCenterModel
  | import('./image-library-page').ImageLibraryPageModel;
export interface HomeCommandResult {
  message: string;
  error: string;
}
export type HostPageAction =
  | import('./image-library-page').ImageLibraryPageAction
  | import('./notification-center').NotificationCenterAction
  | { id: string; type: 'filters'; filters: LogFilters }
  | { id: string; type: 'open-directory' }
  | { id: string; type: 'invoke'; actionId: string };
/** Private bridge for the trusted host renderer; never exposed to Shells or Applets. */
export interface HostPageApi {
  open(request: HostPageRequest): Promise<HostPageModel | null>;
  get(id?: string): Promise<HostPageModel | null>;
  act(action: HostPageAction): Promise<unknown>;
  close(id: string): Promise<void>;
  onChanged(callback: (model: HostPageModel) => void): () => void;
}

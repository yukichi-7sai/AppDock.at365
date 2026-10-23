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
export type HostPageRequest =
  | LogPageRequest
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
export type HostPageModel =
  | LogPageModel
  | import('./notification-center').NotificationCenterModel
  | import('./image-library-page').ImageLibraryPageModel;
export type HostPageAction =
  | import('./image-library-page').ImageLibraryPageAction
  | import('./notification-center').NotificationCenterAction
  | { id: string; type: 'filters'; filters: LogFilters }
  | { id: string; type: 'open-directory' };
/** Private bridge for the trusted host renderer; never exposed to Shells or Applets. */
export interface HostPageApi {
  open(request: HostPageRequest): Promise<HostPageModel | null>;
  get(id?: string): Promise<HostPageModel | null>;
  act(action: HostPageAction): Promise<unknown>;
  close(id: string): Promise<void>;
  onChanged(callback: (model: HostPageModel) => void): () => void;
}

import type { UiCommand } from './commands';
import type { ShellAppletApi } from './shell';
import { validCommandId } from './command-id';

/** Host-owned content; presentation providers may implement each kind independently. */
export interface CommandPaletteRequest {
  requestId: string;
  mode: 'execute' | 'select';
  commandIds?: string[];
  pins?: string[];
  shortcuts?: Record<string, string[]>;
  initialCommandId?: string;
}
export function validSettingsPaletteRequest(request: CommandPaletteRequest): boolean {
  return (
    !!request &&
    (request.mode === 'select' ||
      (request.mode === 'execute' &&
        validCommandId(request.initialCommandId) &&
        Object.keys(request).every((key) =>
          ['requestId', 'mode', 'initialCommandId'].includes(key),
        )))
  );
}
export type CommandPaletteResult =
  { status: 'selected' | 'executed'; commandId: string } | { status: 'cancelled'; reason: string };
export interface CommandPaletteModel {
  schemaVersion: 1;
  id: string;
  contextId: 'primary';
  kind: 'command-palette';
  revision: number;
  dark: boolean;
  language?: import('./host-language').HostLanguage;
  modal: true;
  content: {
    mode: 'execute' | 'select';
    commands: UiCommand[];
    pins: string[];
    shortcuts: Record<string, string[]>;
    busy: boolean;
    error: string;
    initialCommandId?: string;
  };
}
export interface RibbonGroupModel {
  schemaVersion: 1;
  id: string;
  contextId: 'primary';
  kind: 'ribbon-group';
  revision: number;
  dark: boolean;
  modal: true;
  content: {
    groupId: string;
    title: string;
    anchor: import('./ribbon').RibbonAnchor;
    parent: import('./shell').RibbonView['items'][number];
    /** Source ribbon rectangle in the same host CSS coordinates as anchor. */
    viewport?: import('./ribbon').RibbonAnchor;
    displayMode?: import('./ribbon').RibbonDisplayMode;
    items: import('./shell').RibbonView['items'];
  };
}
export type OverlayModel = CommandPaletteModel | RibbonGroupModel;
export type OverlayAction =
  | { id: string; type: 'ribbonChoose'; actionId: string; requestId: string }
  | { id: string; type: 'dismiss' }
  | { id: string; type: 'choose'; commandId: string }
  | { id: string; type: 'togglePin'; commandId: string }
  | { id: string; type: 'movePin'; commandId: string; direction: -1 | 1; visibleIds: string[] };
export interface ShellOverlayApi extends ShellAppletApi {
  connect(): Promise<{ sessionId: string; providerAppletId: string; snapshot: RibbonGroupModel }>;
  ready(sessionId: string, options?: { reusable?: boolean; modelId?: string }): Promise<void>;
  act(action: OverlayAction): Promise<void>;
  asset(id: string): Promise<{ dataUrl: string }>;
  onChanged(callback: (model: RibbonGroupModel) => void): () => void;
  onSuspended?(callback: () => void): () => void;
}
/** Only exposed to the fixed host-owned command palette. */
export interface CommandPaletteViewApi {
  connect(): Promise<{ sessionId: string; snapshot: CommandPaletteModel }>;
  ready(sessionId: string, modelId: string): Promise<void>;
  act(action: Exclude<OverlayAction, { type: 'ribbonChoose' }>): Promise<void>;
  onChanged(callback: (model: CommandPaletteModel) => void): () => void;
  onSuspended(callback: () => void): () => void;
}

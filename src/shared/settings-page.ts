import type { ExtensionSnapshot, GlobalHotKeyStatus, HostSnapshot, Settings } from './contracts';
import type { UiCommand } from './commands';
import type { SettingsPageDefinition, SettingsItem } from './settings-catalog';
import type { SettingsEdit } from './settings-editing';
export interface SettingsPageRequest {
  id: string;
  route: 'settings' | 'extensions';
  kind: 'settings';
  context: 'full' | 'applet';
  pageId?: string;
  sidebarWidth?: number;
  hostWidth?: number;
}
/** Page values are an allowlisted projection, never Settings or HostSnapshot. */
export interface SettingsPageModel {
  schemaVersion: 2;
  id: string;
  contextId: 'primary';
  kind: 'settings';
  revision: number;
  dark: boolean;
  content: {
    context: SettingsPageRequest['context'];
    sidebarWidth: number;
    hostWidth: number;
    page: SettingsPageDefinition;
    values: Record<string, unknown>;
    navigation: { id: string; title: string; owner?: string }[];
    query: string;
    results: (SettingsItem & { pageTitle: string })[];
    move?: { id: string; itemId: string; pageId: string; completed?: boolean };
    editing: {
      sessionId: string;
      editRevision: number;
      pending: boolean;
      error: string;
      mode: 'form' | 'json';
    };
    actions: Record<string, string>;
    auxiliary: SettingsPageAuxiliary;
  };
}
export interface SettingsPageAuxiliary {
  storage?: {
    canSwitch: boolean;
    local: boolean;
    signature: string;
    revision: number;
    files: { scope: 'shared' | 'device'; name: string }[];
  };
  settingsFiles?: {
    scope: 'shared' | 'device';
    path: string;
    recovered: boolean;
    errors: string[];
    canRestore: boolean;
  }[];
  legacyLocalData?: import('./legacy-local-data').LegacyLocalDataState;
  settingsHealth?: {
    restartRequired: boolean;
    reasons: string[];
    errors: string[];
    recovered: boolean;
    canRestore: boolean;
    busy: boolean;
    launchRecovery?: boolean;
  };
  ai?: {
    connections: { id: string; apiKeyConfigured: boolean; keyRevision: string; error?: string }[];
    jobs: import('./ai').AiJob[];
  };
  tts?: { apiKeyConfigured: boolean; error?: string; jobs: import('./tts').TtsJob[] };
  notificationSpeech?: {
    defaults: { defaultVoice: string; defaultSpeed: number };
    configured: boolean;
    voiceListRevision: number;
    jobs: import('./tts').TtsJob[];
  };
  shellRegions?: import('./shell').ShellRegionsSnapshot;
  notificationTypes?: import('./notification-types').NotificationTypeEntry[];
  applets?: ExtensionSnapshot[];
  commands?: UiCommand[];
  statuses?: GlobalHotKeyStatus[];
  launch?: HostSnapshot['launch'];
  runtime?: HostSnapshot['runtime'];
  version?: string;
  updates?: HostSnapshot['updates'];
  accounts?: HostSnapshot['webAccounts'];
  accountReferences?: {
    saved: { id: string; name: string; accountId: string }[];
  };
  permissions?: HostSnapshot['appletApi'];
  avatarUrl?: string | null;
}
export type SettingsPageOperation =
  | {
      kind: 'edit';
      action: Exclude<SettingsEdit, { type: 'values' | 'select-page' }>;
    }
  | { kind: 'invoke'; actionId: string; args?: unknown[] }
  | { kind: 'select'; pageId: string }
  | { kind: 'sidebar-width'; width: number }
  | { kind: 'search'; text: string }
  | { kind: 'move'; itemId: string }
  | { kind: 'moved'; requestId: string; pageId: string };
/** UI selection state lives for the primary context, independently of a Shell View. */
export interface SettingsNavigationState {
  query: string;
  move?: SettingsPageModel['content']['move'];
}
export interface SettingsPageAction {
  id: string;
  type: 'settings';
  sessionId: string;
  editRevision: number;
  operationId: string;
  operation: SettingsPageOperation;
}

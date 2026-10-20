import type { Settings } from './contracts';
/** Host input coordinator metadata. Values always come from the persisted store. */
export interface SettingsInputState {
  sessionId: string;
  editRevision: number;
  revision: number;
  value: Settings;
  mode: 'form' | 'json';
  pending: boolean;
  pageId: string;
}
export type SettingsEdit =
  | { type: 'select-page'; pageId: string }
  | {
      type: 'page-values';
      storageScope?: string;
      pageId: string;
      before: Record<string, unknown>;
      value: Record<string, unknown>;
    }
  | {
      type: 'partial-text';
      pageId: string;
      before: Record<string, unknown>;
      value: string;
      storageScope?: string;
    }
  | { type: 'values'; before: Settings; value: Settings }
  | { type: 'mode'; value: 'form' | 'json' }
  | { type: 'reload' };
export interface SettingsEditRequest {
  sessionId: string;
  operationId: string;
  editRevision: number;
  action: SettingsEdit;
}

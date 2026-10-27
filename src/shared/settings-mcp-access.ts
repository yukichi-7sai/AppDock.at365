import type { SettingDefinition } from './contracts';

export type SettingsMcpLockReason = 'private' | 'unsupported';
export interface SettingsMcpFieldAccess {
  reason: SettingsMcpLockReason | null;
}
export interface SettingsMcpItemAccess extends SettingsMcpFieldAccess {
  fields?: Record<string, SettingsMcpFieldAccess>;
}
/** Trusted settings UI metadata only; no setting values, defaults or credentials. */
export interface SettingsMcpAccess {
  items: Record<string, SettingsMcpItemAccess>;
}
export interface SettingsUiReference {
  pageId: string;
  key: string;
  fieldKey?: string;
}
export type SettingsUiBinding = (field?: SettingDefinition) => SettingsUiReference[];

/** Owners bind stable setting identities, never individual icon visibility. */
export const settingsUiFields =
  (
    pages: string | readonly string[],
    key: (field: SettingDefinition) => string = (field) => field.key,
  ): SettingsUiBinding =>
  (field) =>
    field
      ? (typeof pages === 'string' ? [pages] : pages).map((pageId) => ({ pageId, key: key(field) }))
      : [];
export const settingsUiGroup =
  (pageId: string, key: string): SettingsUiBinding =>
  (field) => [{ pageId, key, ...(field ? { fieldKey: field.key } : {}) }];

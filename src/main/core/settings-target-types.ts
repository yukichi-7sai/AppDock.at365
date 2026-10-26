import type { SettingDefinition, SettingOption } from '../../shared/contracts';

export interface SettingsFieldPlan {
  changed: string[];
  before: Record<string, unknown>;
  values: Record<string, unknown>;
  applies: Record<string, string>;
  overrides?: Record<string, unknown>;
  /** Async owners recheck preflight before persistence and roll back prepared effects if it fails. */
  commit(preflight?: () => void): void | Promise<void>;
}
interface SettingsTargetBase {
  targetId: string;
  ownerId: string;
  title: string;
  category: string;
  available: boolean;
  fields: SettingDefinition[];
  applies(key: string): string;
  options?(field: SettingDefinition): SettingOption[];
  inputSchema?(field: SettingDefinition): Record<string, unknown>;
  writable?(field: SettingDefinition): boolean;
  resettable?(field: SettingDefinition): boolean;
  inheritable?(field: SettingDefinition): boolean;
  schemaContext?(): unknown;
  overrides(): Record<string, unknown> | undefined;
}
export interface SettingsFieldTarget extends SettingsTargetBase {
  kind?: 'fields';
  values(): Record<string, unknown>;
  plan(changes: Record<string, unknown>, reset: string[], revision: string): SettingsFieldPlan;
}
export interface SettingsListTarget extends SettingsTargetBase {
  kind: 'list';
  operations?: readonly ('add' | 'update' | 'remove' | 'reorder')[];
  definition: SettingDefinition;
  maxItems?: number;
  createRow?(values: Record<string, unknown>): Record<string, unknown>;
  prepareRow?(row: Record<string, unknown>, keys: string[]): void;
  validateField?(field: SettingDefinition, value: unknown): void;
  removable?(row: Record<string, unknown>): boolean;
  itemWritable?(row: Record<string, unknown>, field: SettingDefinition): boolean;
  rows(): Record<string, unknown>[];
  plan(rows: Record<string, unknown>[], revision: string): SettingsFieldPlan;
}
export type SettingsTarget = SettingsFieldTarget | SettingsListTarget;
export class SettingsTargetError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

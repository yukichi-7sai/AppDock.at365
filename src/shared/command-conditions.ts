import { hostText } from './i18n';
import {
  normalizeProcessName,
  prepareProcessNames,
  processNameIndex,
  stringNameIndex,
} from './settings-indexes';
export type CommandScope =
  'global' | 'app' | 'pages' | 'owner' | 'applets' | 'desktop' | 'browser' | 'exe';

export interface CommandCondition {
  scope: CommandScope;
  pageOrAppletIds: readonly string[];
  processes: readonly string[];
  excludeDesktop: boolean;
  excludedProcesses?: readonly string[];
}
export interface CommandTarget {
  window: string;
  processName?: string;
  windowClass?: string;
  desktop?: boolean;
}
export interface TriggerContext {
  host: { focused?: boolean; pageId?: string; appletId?: string };
  target?: CommandTarget;
}
export interface ConditionEnvironment {
  excludedProcesses?: readonly string[];
  browsers?: readonly string[];
  requireChromiumWindowClass?: boolean;
}
export const defaultConditionEnvironment = () => ({
  browsers: ['chrome', 'msedge', 'brave', 'vivaldi', 'opera', 'chromium', 'thorium'],
  requireChromiumWindowClass: false,
});
export function processNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== 'string' || !/^[\p{L}\p{N}_. -]{1,120}$/u.test(v.trim()))
  )
    throw Error(hostText('settings.command-conditions.processes'));
  const names = [
    ...new Set(
      value.map((v) =>
        v
          .trim()
          .replace(/\.exe$/i, '')
          .toLowerCase(),
      ),
    ),
  ];
  prepareProcessNames(names);
  return names;
}

/** Normalize binding formats without changing their persisted representation. */
export function commandCondition(when: {
  scope: CommandScope;
  appletIds: readonly string[];
  processes?: readonly string[];
  excludeDesktop?: boolean;
  excludedProcesses?: readonly string[];
}): CommandCondition {
  return {
    scope: when.scope,
    pageOrAppletIds: when.appletIds,
    processes: when.processes ?? [],
    excludeDesktop: when.excludeDesktop ?? false,
    excludedProcesses: when.excludedProcesses ?? [],
  };
}

export function matchesCommandCondition(
  when: CommandCondition,
  context: TriggerContext,
  ownerId?: string | null,
  environment: ConditionEnvironment = {},
): boolean {
  const { host, target } = context;
  const process = target?.processName ? normalizeProcessName(target.processName) : undefined;
  if (
    (environment.excludedProcesses?.length || when.excludedProcesses?.length) &&
    (!process ||
      (environment.excludedProcesses &&
        processNameIndex(environment.excludedProcesses).has(process)) ||
      (when.excludedProcesses && processNameIndex(when.excludedProcesses).has(process)))
  )
    return false;
  if (when.excludeDesktop && target?.desktop !== false) return false;
  switch (when.scope) {
    case 'global':
      return true;
    case 'app':
      return host.focused === true;
    case 'pages':
      return host.focused === true && (!!host.pageId || !!host.appletId);
    case 'owner':
      return host.focused === true && !!ownerId && host.appletId === ownerId;
    case 'applets':
      return (
        host.focused === true &&
        ((!!host.pageId && stringNameIndex(when.pageOrAppletIds).has(host.pageId)) ||
          (!!host.appletId && stringNameIndex(when.pageOrAppletIds).has(host.appletId)))
      );
    case 'desktop':
      return target?.desktop === true;
    case 'browser':
      return (
        !!process &&
        !!environment.browsers &&
        processNameIndex(environment.browsers).has(process) &&
        (!environment.requireChromiumWindowClass ||
          target?.windowClass?.startsWith('Chrome_WidgetWin_') === true)
      );
    case 'exe':
      return !!process && processNameIndex(when.processes).has(process);
    default:
      return false;
  }
}

/** Only the owned InputHost connection may supply these facts to a trigger adapter. */
export function readCommandTarget(value: unknown): CommandTarget | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const target = value as Record<string, unknown>;
  if (
    typeof target.window !== 'string' ||
    !/^\d{1,20}$/.test(target.window) ||
    (target.processName != null &&
      (typeof target.processName !== 'string' || target.processName.length > 120)) ||
    (target.windowClass != null &&
      (typeof target.windowClass !== 'string' || target.windowClass.length > 256)) ||
    (target.desktop != null && typeof target.desktop !== 'boolean')
  )
    return;
  return {
    window: target.window,
    processName: target.processName == null ? undefined : (target.processName as string),
    windowClass: target.windowClass == null ? undefined : (target.windowClass as string),
    desktop: target.desktop == null ? undefined : (target.desktop as boolean),
  };
}

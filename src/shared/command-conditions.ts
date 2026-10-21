export type CommandScope =
  'global' | 'app' | 'pages' | 'owner' | 'applets' | 'desktop' | 'browser' | 'exe';

export interface CommandCondition {
  scope: CommandScope;
  pageOrAppletIds: readonly string[];
  processes: readonly string[];
  excludeDesktop: boolean;
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
  browsers?: readonly string[];
  requireChromiumWindowClass?: boolean;
}

/** Normalize binding formats without changing their persisted representation. */
export function commandCondition(when: {
  scope: CommandScope;
  appletIds: readonly string[];
  processes?: readonly string[];
  excludeDesktop?: boolean;
}): CommandCondition {
  return {
    scope: when.scope,
    pageOrAppletIds: [...when.appletIds],
    processes: [...(when.processes ?? [])],
    excludeDesktop: when.excludeDesktop ?? false,
  };
}
const processName = (name: string) => name.replace(/\.exe$/i, '').toLowerCase();
const containsProcess = (names: readonly string[], name: string) =>
  names.some((entry) => processName(entry) === processName(name));

export function matchesCommandCondition(
  when: CommandCondition,
  context: TriggerContext,
  ownerId?: string | null,
  environment: ConditionEnvironment = {},
): boolean {
  const { host, target } = context;
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
        ((!!host.pageId && when.pageOrAppletIds.includes(host.pageId)) ||
          (!!host.appletId && when.pageOrAppletIds.includes(host.appletId)))
      );
    case 'desktop':
      return target?.desktop === true;
    case 'browser':
      return (
        !!target?.processName &&
        !!environment.browsers &&
        containsProcess(environment.browsers, target.processName) &&
        (!environment.requireChromiumWindowClass ||
          target.windowClass?.startsWith('Chrome_WidgetWin_') === true)
      );
    case 'exe':
      return !!target?.processName && containsProcess(when.processes, target.processName);
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

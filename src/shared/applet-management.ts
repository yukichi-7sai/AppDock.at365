import { hostText } from './i18n';
import type { ExtensionSnapshot } from './contracts';
import { orderApplets } from './applet-order';

/** Package rows exclude generated pages; the WebApplet provider remains a normal package. */
export function managedApplets(applets: ExtensionSnapshot[], order: string[] = []) {
  return orderApplets(
    applets.filter((a) => a.sourceKind !== 'builtin' && !a.collection),
    order,
  );
}

export function reorderManagedApplets(
  applets: ExtensionSnapshot[],
  saved: string[],
  ordered: unknown,
  original: unknown,
) {
  const ids = new Set(managedApplets(applets).map((a) => a.id));
  const sequence = [...saved, ...applets.map((a) => a.id).filter((id) => !saved.includes(id))];
  const current = sequence.filter((id) => ids.has(id));
  if (
    !Array.isArray(ordered) ||
    !Array.isArray(original) ||
    JSON.stringify(current) !== JSON.stringify(original) ||
    ordered.length !== current.length ||
    new Set(ordered).size !== current.length ||
    ordered.some((id) => !ids.has(id))
  )
    throw Error(hostText('services.sharedAppletManagement.orderChanged'));
  let index = 0;
  return sequence.map((id) => (ids.has(id) ? (ordered[index++] as string) : id));
}

export type AppletOperation = 'enable' | 'disable' | 'restart';
export const appletManagementId = (id: string, operation: AppletOperation) =>
  `appdock.applets.${id}.${operation}`;

/** Host-owned commands; Applets cannot grant themselves lifecycle privileges. */
export function appletManagementCommands(applets: ExtensionSnapshot[]) {
  return applets.flatMap((a) =>
    (['enable', 'disable', 'restart'] as const)
      .filter((operation) => a.sourceKind !== 'builtin' || operation === 'restart')
      .map((operation) => ({
        id: appletManagementId(a.id, operation),
        title: hostText(`services.sharedAppletManagement.${operation}`, { name: a.displayName }),
        extension: 'AppDock',
        extensionId: null,
        appletId: a.id,
        operation,
        available:
          !['starting', 'stopping'].includes(a.state) && (operation !== 'restart' || a.enabled),
      })),
  );
}

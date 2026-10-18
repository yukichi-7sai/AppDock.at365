import type { ExtensionSnapshot } from '../../shared/contracts';
import { hostCommands } from '../../shared/commands';

export interface AutomationCommand {
  id: string;
  title: string;
  description?: string;
  appletId: string | null;
  available: boolean;
  unavailableReason: string | null;
  completion: 'accepted' | 'handlerReturned' | 'settingsSaved' | 'lifecycleApplied';
  permission?:
    | 'customCommands.write'
    | 'settings.write'
    | 'applets.manage'
    | 'shortcuts.write'
    | 'gestures.write'
    | 'ribbon.write'
    | 'tray.write';
  inputSchema?: Record<string, unknown>;
}
export interface AutomationApplet {
  id: string;
  name: string;
  version: string;
  state: string;
  enabled: boolean;
  description: string;
  runtime: string;
  errorSummary: string | null;
}
// Deliberate product policy: never infer permission from a suffix, alias, or title.
const hostIds = new Set([
  'appdock.open',
  'appdock.settings.open',
  'appdock.commands.search',
  'appdock.applets.open',
  'appdock.logs.open',
  'appdock.updates.open',
]);
export function automationApplets(applets: ExtensionSnapshot[]): AutomationApplet[] {
  return applets.map((a) => ({
    id: a.id,
    name: a.displayName,
    version: a.version,
    state: a.state,
    enabled: a.enabled,
    description: (a.description ?? '').slice(0, 1000),
    runtime: a.runtime,
    // Raw startup errors can contain paths, URLs, and credentials.
    errorSummary:
      a.error || a.state === 'error'
        ? 'Appletの起動または表示に問題があります。AppDockのログで確認してください。'
        : null,
  }));
}
export function automationCommands(applets: ExtensionSnapshot[]): AutomationCommand[] {
  return [
    ...hostCommands
      .filter((c) => hostIds.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        appletId: null,
        available: true,
        unavailableReason: null,
        completion: 'accepted' as const,
      })),
    ...applets.flatMap((a) => {
      return a.commands
        .filter((c) => c.automation === true && !c.hidden && c.id.startsWith(a.id + '.'))
        .map((c) => {
          const available = a.enabled && a.state === 'running' && c.available;
          return {
            id: c.id,
            title: c.title,
            appletId: a.id,
            available,
            unavailableReason: available
              ? null
              : 'Appletが有効・稼働中で、操作を利用できる必要があります。',
            completion: 'handlerReturned' as const,
          };
        });
    }),
  ];
}

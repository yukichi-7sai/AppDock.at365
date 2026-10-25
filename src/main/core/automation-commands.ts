import { hostText } from '../../shared/i18n';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { hostCommandsForApplets } from '../../shared/commands';
import { settingsPageCommands } from '../../shared/settings-navigation';
import { updateCommands } from '../../shared/update-commands';

export interface AutomationCommand {
  id: string;
  title: string;
  description?: string;
  appletId: string | null;
  available: boolean;
  unavailableReason: string | null;
  completion: 'accepted' | 'handlerReturned' | 'settingsSaved' | 'lifecycleApplied';
  operation?: import('../../shared/applet-management').AppletOperation;
  permission?:
    | 'customCommands.write'
    | 'settings.write'
    | 'applets.manage'
    | 'shortcuts.write'
    | 'touchpadGestures.write'
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
        ? hostText('services.automationCommands.appletDisplayFailed')
        : null,
  }));
}
export function automationCommands(applets: ExtensionSnapshot[]): AutomationCommand[] {
  const pages = new Set(settingsPageCommands(applets).map((c) => c.id));
  const updates = new Set<string>(updateCommands.map((c) => c.id));
  return [
    ...hostCommandsForApplets(applets)
      .filter((c) => hostIds.has(c.id) || pages.has(c.id) || updates.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        ...('description' in c ? { description: c.description } : {}),
        appletId: null,
        available: true,
        unavailableReason: null,
        completion: updates.has(c.id) ? ('handlerReturned' as const) : ('accepted' as const),
      })),
    ...applets.flatMap((a) => {
      return a.commands
        .filter((c) => c.automation === true && !c.hidden && c.id.startsWith(a.id + '.'))
        .map((c) => {
          const available = a.enabled && a.state === 'running' && c.available;
          return {
            id: c.id,
            title: c.title,
            ...(c.description !== undefined ? { description: c.description } : {}),
            appletId: a.id,
            available,
            unavailableReason: available
              ? null
              : hostText('services.automationCommands.appletUnavailable'),
            completion: 'handlerReturned' as const,
          };
        });
    }),
  ];
}

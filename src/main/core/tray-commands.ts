import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { hostCommandsForApplets } from '../../shared/commands';
import { appletManagementCommands } from '../../shared/applet-management';
import { appletDisplayName } from '../../shared/applet-display-name';

export interface TrayCommandGroup {
  extensionId: string | null;
  title: string;
  commands: { id: string; title: string; enabled: boolean }[];
}

/** Applets may suggest tray labels, but only the user's opt-in controls visibility. */
export function trayCommandGroups(
  settings: Settings,
  extensions: ExtensionSnapshot[],
): TrayCommandGroup[] {
  const selected = new Set(settings.trayCommands);
  const groups: TrayCommandGroup[] = [
    {
      extensionId: null,
      title: 'AppDock',
      commands: [...hostCommandsForApplets(extensions), ...appletManagementCommands(extensions)]
        .filter((command) => selected.has(command.id))
        .map((command) => ({ ...command, enabled: command.available })),
    },
  ];
  for (const extension of extensions) {
    groups.push({
      extensionId: extension.id,
      title: appletDisplayName(extension),
      commands: extension.commands
        .filter((command) => selected.has(command.id))
        .map((command) => ({
          id: command.id,
          title: extension.tray.find((item) => item.command === command.id)?.title ?? command.title,
          enabled: command.available,
        })),
    });
  }
  return groups.filter((group) => group.commands.length);
}

/** Remove settings belonging to retired samples only when those samples aren't installed. */
export function withoutMissingSamples(
  settings: Settings,
  installedIds: Iterable<string>,
): Settings {
  const installed = new Set(installedIds);
  const retired = ['appdock.welcome', 'appdock.dotnet-demo'].filter((id) => !installed.has(id));
  const isRetired = (id: string) => retired.some((owner) => id.startsWith(owner + '.'));
  const next = structuredClone(settings);
  if (next.keybindings)
    next.keybindings = next.keybindings.filter((row) => !isRetired(row.command));
  for (const owner of retired) delete next.extensions[owner];
  for (const id of Object.keys(next.shortcuts)) if (isRetired(id)) delete next.shortcuts[id];
  next.globalShortcutCommands = next.globalShortcutCommands.filter((id) => !isRetired(id));
  next.pinnedCommands = next.pinnedCommands.filter((id) => !isRetired(id));
  next.trayCommands = next.trayCommands.filter((id) => !isRetired(id));
  if (next.trayMenu)
    next.trayMenu = next.trayMenu
      .filter((item) => item.type !== 'command' || !isRetired(item.command))
      .map((item) =>
        item.type === 'group'
          ? {
              ...item,
              children: item.children.filter(
                (child) => child.type !== 'command' || !isRetired(child.command),
              ),
            }
          : item,
      );
  if (isRetired(next.host.trayClickCommand)) next.host.trayClickCommand = 'appdock.open';
  if (next.host.trayDoubleClickCommand && isRetired(next.host.trayDoubleClickCommand))
    next.host.trayDoubleClickCommand = null;
  return next;
}

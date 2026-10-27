import { hostText } from './i18n';
import type { ExtensionSnapshot, Settings } from './contracts';
import { hostCommandsForApplets, validCommandId } from './commands';
import { appletManagementCommands } from './applet-management';
import { appletDisplayName } from './applet-display-name';

export const gesturePauseCommand = 'appdock.gestures.togglePause';
export const fixedTrayCommands = ['appdock.settings.open', 'appdock.quit'];
// The legacy maximum is 500 commands; migration can also add 500 groups and the pause item.
export const maximumTrayItems = 1500;
export type TrayMenuLeaf =
  { id: string; type: 'command'; command: string } | { id: string; type: 'separator' };
export type TrayMenuItem =
  TrayMenuLeaf | { id: string; type: 'group'; title: string; children: TrayMenuLeaf[] };

export const defaultTrayMenu = (): TrayMenuItem[] => [
  { id: 'tray.default.open', type: 'command', command: 'appdock.open' },
];

export function parseTrayMenu(value: unknown): TrayMenuItem[] {
  const ids = new Set<string>();
  function parse(items: unknown, nested = false): TrayMenuItem[] {
    if (!Array.isArray(items)) throw Error(hostText('settings.tray-menu.array'));
    return items.map((item) => {
      if (!item || typeof item !== 'object' || !validCommandId(item.id) || ids.has(item.id))
        throw Error(hostText('settings.tray-menu.id'));
      ids.add(item.id);
      if (ids.size > maximumTrayItems)
        throw Error(hostText('settings.tray-menu.limit', { maximumTrayItems: maximumTrayItems }));
      const id = item.id as string;
      if (item.type === 'separator') return { id, type: 'separator' };
      if (
        item.type === 'command' &&
        validCommandId(item.command) &&
        !fixedTrayCommands.includes(item.command)
      )
        return { id, type: 'command', command: item.command };
      if (
        item.type === 'group' &&
        !nested &&
        typeof item.title === 'string' &&
        item.title.trim() &&
        item.title.trim().length <= 80
      )
        return {
          id,
          type: 'group',
          title: item.title.trim(),
          children: parse(item.children, true) as TrayMenuLeaf[],
        };
      throw Error(hostText('settings.tray-menu.item'));
    });
  }
  return parse(value);
}

export function trayMenuCommandIds(items: TrayMenuItem[]): string[] {
  return [
    ...new Set(
      items.flatMap((item) =>
        item.type === 'group'
          ? trayMenuCommandIds(item.children)
          : item.type === 'command'
            ? [item.command]
            : [],
      ),
    ),
  ];
}

/** Resolve legacy opt-ins only when no layout exists; an explicit empty layout stays empty. */
export function getTrayMenu(settings: Settings, extensions: ExtensionSnapshot[]): TrayMenuItem[] {
  if (settings.trayMenu !== undefined) return settings.trayMenu;
  const selected = new Set(settings.trayCommands.filter((id) => !fixedTrayCommands.includes(id)));
  const items: TrayMenuItem[] = [];
  let serial = 0;
  const id = () => `tray.legacy.${++serial}`;
  const command = (command: string): TrayMenuLeaf => {
    selected.delete(command);
    return { id: id(), type: 'command', command };
  };
  for (const extension of extensions) {
    const commands = extension.commands.filter((c) => selected.has(c.id));
    if (commands.length)
      items.push({
        id: id(),
        type: 'group',
        title: appletDisplayName(extension).slice(0, 80),
        children: commands.map((c) => command(c.id)),
      });
  }
  if (items.length) items.push({ id: id(), type: 'separator' });
  for (const c of hostCommandsForApplets(extensions))
    if (selected.has(c.id)) items.push(command(c.id));
  for (const c of [...selected]) items.push(command(c));
  if (!trayMenuCommandIds(items).includes(gesturePauseCommand))
    items.push(command(gesturePauseCommand));
  return items;
}

export interface ResolvedTrayItem {
  id: string;
  type: 'command' | 'separator' | 'group';
  title?: string;
  command?: string;
  enabled?: boolean;
  disabledReason?: string;
  children?: ResolvedTrayItem[];
}
/** Shared by preview and native menu so unavailable commands and separators match. */
export function resolveTrayMenu(
  items: TrayMenuItem[],
  commands: { id: string; title: string; available: boolean; disabledReason?: string }[],
): ResolvedTrayItem[] {
  const catalog = new Map(commands.map((c) => [c.id, c]));
  const result: ResolvedTrayItem[] = [];
  for (const item of items) {
    if (item.type === 'separator') {
      if (result.length && result.at(-1)?.type !== 'separator') result.push(item);
    } else if (item.type === 'group') {
      const children = resolveTrayMenu(item.children, commands);
      if (children.length) result.push({ ...item, children });
    } else {
      const c = catalog.get(item.command);
      result.push({
        ...item,
        title: c?.title ?? item.command,
        enabled: c?.available ?? false,
        ...(c?.disabledReason ? { disabledReason: c.disabledReason } : {}),
      });
    }
  }
  if (result.at(-1)?.type === 'separator') result.pop();
  return result;
}

export function trayCommandCatalog(
  extensions: ExtensionSnapshot[],
  additional: import('./commands').UiCommand[] = [],
) {
  const base = [
    ...hostCommandsForApplets(extensions),
    ...appletManagementCommands(extensions),
    ...extensions.flatMap((e) =>
      e.commands.map((c) => ({
        ...c,
        title: e.tray.find((t) => t.command === c.id)?.title ?? c.title,
      })),
    ),
  ];
  return [...base, ...additional.filter((c) => !base.some((b) => b.id === c.id))];
}

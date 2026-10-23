import { hostText } from './i18n';
import { isRetiredShellRegion, isShellRegion } from './shell';
import type { Command, DeclaredCommand } from './contracts';
import { customDescription } from './custom-commands';

export const maxExtensionCommands = 256;

export function parseDeclaredCommands(id: string, value: unknown): DeclaredCommand[] | undefined {
  if (value === undefined) return undefined;
  const commands = parseExtensionCommands(id, value);
  const ids = new Set(commands.map((command) => command.id));
  return commands.map((command, index) => {
    const declaration = (value as Record<string, unknown>[])[index];
    if (declaration.automation !== undefined && typeof declaration.automation !== 'boolean')
      throw new Error(hostText('services.sharedExtensionCommands.invalidAutomation'));
    if (declaration.automation === true && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(command.id))
      throw new Error(hostText('services.sharedExtensionCommands.invalidExternalId'));
    if (
      declaration.activateOnExecute !== undefined &&
      typeof declaration.activateOnExecute !== 'boolean'
    )
      throw new Error(hostText('services.sharedExtensionCommands.invalidActivation'));
    const requirement = declaration.shellRequirement;
    if (
      requirement !== undefined &&
      (!requirement ||
        typeof requirement !== 'object' ||
        Array.isArray(requirement) ||
        Object.keys(requirement).some((k) => !['region', 'state'].includes(k)) ||
        (!isShellRegion((requirement as any).region) &&
          !isRetiredShellRegion((requirement as any).region)) ||
        !['resolved', 'visible'].includes((requirement as any).state))
    )
      throw Error(hostText('services.sharedExtensionCommands.invalidShellRequirement'));
    const aliases = declaration.aliases;
    if (aliases !== undefined) {
      if (!Array.isArray(aliases) || aliases.length > 8)
        throw new Error(hostText('services.sharedExtensionCommands.aliasLimit'));
      for (const alias of aliases) {
        if (
          typeof alias !== 'string' ||
          !alias.startsWith(id + '.') ||
          alias.length > 200 ||
          ids.has(alias)
        )
          throw new Error(hostText('services.sharedExtensionCommands.invalidAliases'));
        ids.add(alias);
      }
    }
    return {
      ...command,
      ...(requirement
        ? { shellRequirement: requirement as import('./shell').ShellRequirement }
        : {}),
      ...(declaration.automation !== undefined
        ? { automation: declaration.automation as boolean }
        : {}),
      ...(aliases !== undefined ? { aliases: aliases as string[] } : {}),
      ...(declaration.activateOnExecute !== undefined
        ? { activateOnExecute: declaration.activateOnExecute as boolean }
        : {}),
    };
  });
}

export function parseExtensionCommands(id: string, value: unknown): Command[] {
  if (!Array.isArray(value) || value.length > maxExtensionCommands)
    throw new Error(
      hostText('services.sharedExtensionCommands.countLimit', {
        count: String(maxExtensionCommands),
      }),
    );
  const seen = new Set<string>();
  return value.map((command) => {
    if (
      !command ||
      typeof command !== 'object' ||
      typeof command.id !== 'string' ||
      !command.id.startsWith(id + '.') ||
      command.id.length > 200 ||
      typeof command.title !== 'string' ||
      !command.title.trim() ||
      command.title.length > 200 ||
      seen.has(command.id)
    )
      throw new Error(hostText('services.sharedExtensionCommands.invalidRegistration'));
    seen.add(command.id);
    return {
      id: command.id,
      title: command.title,
      ...(command.description !== undefined
        ? { description: customDescription(command.description) }
        : {}),
    };
  });
}

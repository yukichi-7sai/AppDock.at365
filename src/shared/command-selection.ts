import { rankCommands, type UiCommand } from './commands';
import { commandTextPlain } from './command-text';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja');
export function commandSelectionProvider(command: UiCommand): string {
  if (command.customDefinitionId) return 'custom';
  if (command.extensionId === null) return 'host';
  return command.extensionId === undefined
    ? `unknown:${command.extension}`
    : `applet:${command.extensionId}`;
}
export function commandSelectionProviderTitle(command: UiCommand): string {
  return command.extensionId?.startsWith('at365.')
    ? command.extension
        .replace(/^Applet\./, '')
        .replace(/\.at365$/, '')
        .trim() || command.extension
    : command.extension;
}
/** Build search text once per catalog; selection never changes execution availability. */
export function commandSelectionCatalog(commands: UiCommand[], pins: string[]) {
  const references = new Map(commands.map((command) => [command.id, command]));
  const favorites = new Set(pins);
  return rankCommands(
    commands.filter((command) => !command.hidden && !command.missing),
    pins,
  ).map((command) => {
    const description = commandTextPlain(command.description ?? '', references);
    return {
      command,
      description,
      provider: commandSelectionProvider(command),
      providerTitle: commandSelectionProviderTitle(command),
      favorite: favorites.has(command.id),
      search: normalize(`${command.title} ${description} ${command.extension} ${command.id}`),
    };
  });
}
export function filterCommandSelection(
  catalog: ReturnType<typeof commandSelectionCatalog>,
  query: string,
  provider: string,
) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return catalog.filter(
    (entry) =>
      (provider === 'all' ||
        (provider === 'favorites' ? entry.favorite : entry.provider === provider)) &&
      terms.every((term) => entry.search.includes(term)),
  );
}

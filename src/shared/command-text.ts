import { parseDescriptionText, pageLinkKey, type DescriptionToken } from './description-text';

export type CommandTextToken = DescriptionToken;
export interface CommandReference {
  id: string;
  title: string;
  available: boolean;
  disabledReason?: string;
}
export const parseCommandText = parseDescriptionText;
export function commandTextPlain(
  text: string,
  references: ReadonlyMap<string, Pick<CommandReference, 'title'>> = new Map(),
  pages: ReadonlyMap<string, { title: string }> = new Map(),
): string {
  return parseCommandText(text)
    .map((token) =>
      token.kind === 'text'
        ? token.text
        : token.kind === 'command'
          ? (references.get(token.id)?.title ?? token.id)
          : (pages.get(pageLinkKey(token))?.title ?? token.id),
    )
    .join('');
}
export function commandTextIds(texts: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const text of texts)
    for (const token of parseCommandText(text)) if (token.kind === 'command') ids.add(token.id);
  return ids;
}
export function commandReferences(
  ids: ReadonlySet<string>,
  commands: readonly (CommandReference & { hidden?: boolean })[],
): CommandReference[] {
  return commands
    .filter((c) => ids.has(c.id) && !c.hidden)
    .map(({ id, title, available, disabledReason }) => ({ id, title, available, disabledReason }));
}
type Description = { description?: string; fields?: Description[] };
export function definitionCommandTexts(definition: Description): string[] {
  return [
    definition.description ?? '',
    ...(definition.fields ?? []).flatMap(definitionCommandTexts),
  ];
}

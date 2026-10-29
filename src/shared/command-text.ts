import { validCommandId } from './command-id';

export type CommandTextToken = { kind: 'text'; text: string } | { kind: 'command'; id: string };
export interface CommandReference {
  id: string;
  title: string;
  available: boolean;
  disabledReason?: string;
}
export function parseCommandText(text: string): CommandTextToken[] {
  const result: CommandTextToken[] = [];
  const append = (value: string) => {
    if (!value) return;
    const previous = result.at(-1);
    if (previous?.kind === 'text') previous.text += value;
    else result.push({ kind: 'text', text: value });
  };
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('[command:', cursor);
    if (start < 0) break;
    const end = text.indexOf(']', start + 9);
    if (end < 0) break;
    const id = text.slice(start + 9, end);
    if (!validCommandId(id)) append(text.slice(cursor, end + 1));
    else if (start > cursor && text[start - 1] === '\\') {
      append(text.slice(cursor, start - 1));
      append(text.slice(start, end + 1));
    } else {
      append(text.slice(cursor, start));
      result.push({ kind: 'command', id });
    }
    cursor = end + 1;
  }
  append(text.slice(cursor));
  return result;
}
export function commandTextPlain(
  text: string,
  references: ReadonlyMap<string, Pick<CommandReference, 'title'>> = new Map(),
): string {
  if (!text.includes('[command:')) return text;
  return parseCommandText(text)
    .map((token) =>
      token.kind === 'text' ? token.text : (references.get(token.id)?.title ?? token.id),
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

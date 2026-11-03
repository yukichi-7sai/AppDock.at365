import { validCommandId } from './command-id';

export type PageLinkTarget = { kind: 'page' | 'setting'; id: string };
export type DescriptionToken =
  { kind: 'text'; text: string } | { kind: 'command'; id: string } | PageLinkTarget;
export const pageLinkKey = ({ kind, id }: PageLinkTarget) => `${kind}:${id}`;
export function validPageLinkTarget(value: unknown): value is PageLinkTarget {
  if (!value || typeof value !== 'object') return false;
  const { kind, id } = value as PageLinkTarget;
  if (kind !== 'page' && kind !== 'setting') return false;
  return (
    typeof id === 'string' &&
    (validCommandId(id) ||
      (kind === 'page'
        ? /^page:[a-z0-9][a-z0-9.-]*:[a-z0-9][a-z0-9.-]*$/
        : /^applet:[a-z0-9][a-z0-9.-]*$/
      ).test(id))
  );
}

/** Only explicit metadata references are parsed. Names and saved input stay literal. */
export function parseDescriptionText(text: string): DescriptionToken[] {
  const tokens: DescriptionToken[] = [];
  const append = (value: string) => {
    if (!value) return;
    const previous = tokens.at(-1);
    if (previous?.kind === 'text') previous.text += value;
    else tokens.push({ kind: 'text', text: value });
  };
  const pattern = /\[(command|page|setting):/g;
  let cursor = 0;
  for (let match; (match = pattern.exec(text));) {
    const start = match.index;
    const end = text.indexOf(']', pattern.lastIndex);
    if (end < 0) break;
    const kind = match[1] as 'command' | 'page' | 'setting';
    const id = text.slice(pattern.lastIndex, end);
    if (!(kind === 'command' ? validCommandId(id) : validPageLinkTarget({ kind, id })))
      append(text.slice(cursor, end + 1));
    else if (start > cursor && text[start - 1] === '\\') {
      append(text.slice(cursor, start - 1));
      append(text.slice(start, end + 1));
    } else {
      append(text.slice(cursor, start));
      tokens.push({ kind, id });
    }
    cursor = pattern.lastIndex = end + 1;
  }
  append(text.slice(cursor));
  return tokens;
}
export function pageLinkIds(texts: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const text of texts)
    for (const token of parseDescriptionText(text))
      if (token.kind === 'page' || token.kind === 'setting') ids.add(pageLinkKey(token));
  return ids;
}

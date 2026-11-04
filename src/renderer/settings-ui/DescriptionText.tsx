import { Fragment, useMemo } from 'react';
import { parseDescriptionText } from '../../shared/description-text';
import { commandTextPlain } from '../../shared/command-text';
import { CommandLink, useCommandReferences } from './CommandLink';
import { PageLink, usePageReferences } from './PageLink';

/** Only explicit metadata descriptions opt in; saved inputs remain ordinary text. */
export function DescriptionText({
  text,
  interactive = true,
  focusFallback,
}: {
  text: string;
  interactive?: boolean;
  focusFallback?: () => HTMLElement | null;
}) {
  const commands = useCommandReferences();
  const pages = usePageReferences();
  const tokens = useMemo(() => parseDescriptionText(text), [text]);
  if (!interactive) return commandTextPlain(text, commands, pages);
  return tokens.map((token, index) => (
    <Fragment key={token.kind === 'text' ? index : `${index}:${token.kind}:${token.id}`}>
      {token.kind === 'text' ? (
        token.text
      ) : token.kind === 'command' ? (
        <CommandLink commandId={token.id} focusFallback={focusFallback} />
      ) : (
        <PageLink {...token} focusFallback={focusFallback} />
      )}
    </Fragment>
  ));
}

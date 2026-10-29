import { Fragment, useMemo } from 'react';
import { parseCommandText, commandTextPlain } from '../../shared/command-text';
import { CommandLink, useCommandReferences } from './CommandLink';

/** Only metadata descriptions opt in; user settings and arbitrary React nodes stay untouched. */
export function CommandText({ text, interactive = true }: { text: string; interactive?: boolean }) {
  const references = useCommandReferences();
  const tokens = useMemo(() => parseCommandText(text), [text]);
  if (!interactive) return commandTextPlain(text, references);
  return tokens.map((token, index) => (
    <Fragment key={index}>
      {token.kind === 'text' ? token.text : <CommandLink commandId={token.id} />}
    </Fragment>
  ));
}

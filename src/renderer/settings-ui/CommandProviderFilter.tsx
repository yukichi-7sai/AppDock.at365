import { Icon } from '../../shared/ui-icons';
import type { Ref } from 'react';

export function CommandProviderFilter({
  title,
  onClear,
  ref,
}: {
  title: string;
  onClear?(): void;
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p className="command-provider-filter" ref={ref}>
      <span>
        対象: <strong>{title}</strong>
      </span>
      <button
        type="button"
        className="command-provider-clear"
        title="絞り込みを解除"
        aria-label={`${title}の絞り込みを解除`}
        onClick={onClear}
      >
        <Icon name="close" size={16} />
      </button>
    </p>
  );
}

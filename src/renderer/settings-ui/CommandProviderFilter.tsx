import { Icon } from '../../shared/ui-icons';

export function CommandProviderFilter({ title, onClear }: { title: string; onClear?(): void }) {
  return (
    <p className="command-provider-filter">
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

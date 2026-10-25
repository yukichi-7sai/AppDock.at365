import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { Icon } from '../../shared/ui-icons';
import type { Ref } from 'react';

export function CommandProviderFilter({
  title,
  label = hostText('settings.commandProviderFilter.target'),
  onClear,
  ref,
}: {
  title: string;
  label?: string;
  onClear?(): void;
  ref?: Ref<HTMLParagraphElement>;
}) {
  const { t: translate } = useHostTranslation();
  return (
    <p className="command-provider-filter" ref={ref} data-testid="command-provider-filter">
      <span title={`${label}: ${title}`}>
        {label}: <strong>{title}</strong>
      </span>
      <button
        type="button"
        className="command-provider-clear"
        data-testid="command-provider-filter-clear"
        title={translate('settings.commandProviderFilter.clear')}
        aria-label={translate('settings.commandProviderFilter.clearTarget', { title: title })}
        onClick={onClear}
      >
        <Icon name="close" size={16} />
      </button>
    </p>
  );
}

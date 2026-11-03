import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { Icon, type IconName } from '../../shared/ui-icons';
import type { ReactNode, Ref } from 'react';

export function CommandProviderFilter({
  title,
  label = hostText('settings.commandProviderFilter.target'),
  icon,
  kind = 'command',
  onClear,
  ref,
  children,
}: {
  title: string;
  label?: string;
  icon?: IconName;
  kind?: 'provider' | 'input' | 'command';
  onClear?(): void;
  ref?: Ref<HTMLParagraphElement>;
  children?: ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  return (
    <p
      className="command-provider-filter"
      ref={ref}
      data-testid="command-provider-filter"
      data-filter-kind={kind}
    >
      <span
        title={`${label}: ${title}`}
        role={children != null || icon ? 'img' : undefined}
        aria-label={children != null || icon ? `${label}: ${title}` : undefined}
      >
        {children ?? (
          <>
            {icon && (
              <span className="command-provider-filter-icon" aria-hidden="true" data-icon={icon}>
                <Icon name={icon} size={16} />
              </span>
            )}
            <span className="command-provider-filter-label">
              {!icon && `${label}: `}
              <strong>{title}</strong>
            </span>
          </>
        )}
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

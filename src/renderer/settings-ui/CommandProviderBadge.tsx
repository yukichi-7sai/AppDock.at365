import { useHostTranslation } from '../HostTranslation';
import type { UiCommand } from '../../shared/commands';
import type { BindingProviderFilter } from './useBindingCommandFilter';
import { Icon, type IconName } from '../../shared/ui-icons';

/** Compact presentation only; filtering always uses the original owner ID. */
export function CommandProviderBadge({
  command,
  selected,
  onSelect,
  icon,
}: {
  command: UiCommand;
  selected?: string | null;
  onSelect?(provider: BindingProviderFilter, trigger: HTMLButtonElement): void;
  icon?: IconName;
}) {
  const { t } = useHostTranslation();
  const shortName = command.extensionId?.startsWith('at365.')
    ? command.extension
        .replace(/^Applet\./, '')
        .replace(/\.at365$/, '')
        .trim() || command.extension
    : command.extension;
  const label = shortName + (command.hidden ? t('settings.commandBindingList.compatibility') : '');
  const owner = command.extensionId;
  const props = {
    className: 'command-provider-badge',
    title: command.extension,
    'data-testid': `command-provider:${command.id}`,
  };
  const iconName = icon ?? (owner === null ? 'home' : 'extensions');
  const content = (
    <>
      <span className="command-provider-badge-icon" aria-hidden="true" data-icon={iconName}>
        <Icon name={iconName} size={16} />
      </span>
      <span className="command-provider-badge-label">{label}</span>
    </>
  );
  return onSelect && owner !== undefined ? (
    <button
      {...props}
      type="button"
      aria-label={t('settings.commandBindingList.filterProvider', { title: command.extension })}
      aria-pressed={selected === owner}
      onClick={(event) => onSelect({ id: owner, title: shortName }, event.currentTarget)}
    >
      {content}
    </button>
  ) : (
    <span {...props}>{content}</span>
  );
}

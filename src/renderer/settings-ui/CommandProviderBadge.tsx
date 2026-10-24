import { useHostTranslation } from '../HostTranslation';
import type { UiCommand } from '../../shared/commands';
import type { BindingProviderFilter } from './useBindingCommandFilter';

/** Compact presentation only; filtering always uses the original owner ID. */
export function CommandProviderBadge({
  command,
  selected,
  onSelect,
}: {
  command: UiCommand;
  selected?: string | null;
  onSelect?(provider: BindingProviderFilter, trigger: HTMLButtonElement): void;
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
  return onSelect && owner !== undefined ? (
    <button
      {...props}
      type="button"
      aria-label={t('settings.commandBindingList.filterProvider', { title: command.extension })}
      aria-pressed={selected === owner}
      onClick={(event) => onSelect({ id: owner, title: shortName }, event.currentTarget)}
    >
      {label}
    </button>
  ) : (
    <span {...props}>{label}</span>
  );
}

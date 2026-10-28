import type { ReactNode } from 'react';
import { Icon } from '../../shared/ui-icons';
import { SettingsInput } from './SettingsInput';

/** Search and caller-defined choices for a settings list; filtering stays local to its owner. */
export function SettingsListFilters({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  children,
}: {
  search: string;
  onSearch(value: string): void;
  searchLabel: string;
  searchPlaceholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="command-shortcut-tools settings-list-filters">
      <div className="command-shortcut-search">
        <span aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <SettingsInput
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      {children}
    </div>
  );
}

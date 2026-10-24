import { useHostTranslation } from '../HostTranslation';
import { SettingsInput } from './SettingsInput';
import type { ReactNode } from 'react';
import { CommandProviderFilter } from './CommandProviderFilter';
import type { BindingInputFilter } from './useBindingCommandFilter';
import { CommandListSummary, CommandListToolbar } from './CommandListScroll';
import { Icon } from '../../shared/ui-icons';
export function CommandBindingToolbar({
  inputName,
  inputKind,
  count,
  visibleCount,
  filter,
  statusFilter,
  setFilter,
  setStatusFilter,
  showRegistrationErrors = false,
  children,
  inputFilter,
  clearInputFilter,
}: {
  inputName: string;
  inputKind: 'shortcut' | 'gesture';
  count: number;
  visibleCount: number;
  filter: string;
  statusFilter: string;
  setFilter(value: string): void;
  setStatusFilter(value: string): void;
  showRegistrationErrors?: boolean;
  children?: ReactNode;
  inputFilter?: BindingInputFilter | null;
  clearInputFilter?(): void;
}) {
  const { t: translate } = useHostTranslation();
  return (
    <CommandListToolbar>
      <div className="command-shortcut-tools">
        <div className="command-shortcut-search">
          <span aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <SettingsInput
            type="search"
            aria-label={translate('settings.commandBindingToolbar.search', {
              inputName: inputName,
            })}
            placeholder={translate('settings.commandBindingToolbar.searchPlaceholder', {
              value: inputName,
            })}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <select
          className="shortcut-status-filter"
          aria-label={translate('settings.commandBindingToolbar.filter', { inputName: inputName })}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">{translate('settings.commandBindingToolbar.all')}</option>
          <option value="assigned">{translate('settings.commandBindingToolbar.assigned')}</option>
          <option value="unassigned">
            {translate('settings.commandBindingToolbar.unassigned')}
          </option>
          {showRegistrationErrors && (
            <option value="conflict">
              {translate('settings.commandBindingToolbar.applyError')}
            </option>
          )}
        </select>
      </div>
      <CommandListSummary
        className="command-shortcut-summary"
        filter={
          inputFilter ? (
            <CommandProviderFilter
              label={
                inputKind === 'gesture'
                  ? translate('settings.commandBindingToolbar.gesture')
                  : translate('settings.commandBindingToolbar.key')
              }
              title={inputFilter.label}
              onClear={clearInputFilter}
            />
          ) : (
            children
          )
        }
        actions={
          <>
            {(filter || statusFilter !== 'all' || inputFilter) && (
              <button
                className="text-button"
                onClick={() => {
                  setFilter('');
                  setStatusFilter('all');
                  clearInputFilter?.();
                }}
              >
                {translate('settings.commandBindingToolbar.clear')}
              </button>
            )}
          </>
        }
      >
        <span role="status">
          {translate('settings.commandBindingToolbar.visibleCount', {
            visible: visibleCount,
            total: count,
          })}
        </span>
      </CommandListSummary>
    </CommandListToolbar>
  );
}

import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { useSettingsControls } from '../settings-ui/api';
import { CommandBindingToolbar } from '../settings-ui/CommandBindingToolbar';
import { CommandProviderFilter } from '../settings-ui/CommandProviderFilter';
import { useEffect, useRef, useState } from 'react';
import { normalizeShortcut, type UiCommand } from '../../shared/commands';
import { useBindingCommandFilter } from '../settings-ui/useBindingCommandFilter';
import type { Settings, GlobalHotKeyStatus } from '../../shared/contracts';
import {
  getKeybindings,
  externalShortcutScope,
  getKeybindingOptions,
  keybindingConditionLabel,
  type Keybinding,
} from '../../shared/keybindings';
import { ShortcutCommandList } from '../settings-ui/ShortcutCommandList';
import { SettingsSection } from '../settings-ui/SettingsSections';
import { hostSettingItem } from '../../shared/settings-catalog';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';
import { CommandTargetFilter } from '../settings-ui/CommandSettingsNavigation';

/** Settings adds catalog-wide discovery around the same command list used by Applet details. */
export function ShortcutsEditor({
  owned = [],
  commands,
  settings,
  onChange,
  statuses,
  applets,
  provider,
  clearProvider,
}: {
  owned?: Keybinding[];
  commands: UiCommand[];
  settings: Settings;
  onChange(value: Settings): void;
  statuses: GlobalHotKeyStatus[];
  applets: { id: string; title: string }[];
  provider?: { id: string; title: string; request: number };
  clearProvider?(): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const {
    provider: activeProvider,
    selectProvider,
    clearProvider: clearProviderFilter,
    target,
    filter,
    setFilter,
    statusFilter,
    setStatusFilter,
    inputFilter,
    selectInput,
    clearInput,
  } = useBindingCommandFilter(provider, clearProvider);
  const [error, setError] = useState('');
  const lastStatuses = useRef(statuses);
  useEffect(() => {
    if (statuses.length) lastStatuses.current = statuses;
  }, [statuses]);
  const displayedStatuses = statuses.length ? statuses : lastStatuses.current;
  const rows = [...getKeybindings(settings), ...owned];
  const known = new Map(commands.map((command) => [command.id, command]));
  for (const row of rows)
    if (!known.has(row.command))
      known.set(row.command, {
        id: row.command,
        title: row.command,
        extension: translate('settings.shortcutsEditor.unknownCommand'),
        available: false,
      });
  const catalog = [...known.values()].filter(
    (command) => !command.hidden || rows.some((row) => row.command === command.id),
  );
  const statusError = (row: Keybinding) =>
    row.enabled && externalShortcutScope(row.when.scope) && known.get(row.command)?.available
      ? displayedStatuses.find(
          (status) => status.commandId === row.command && status.shortcut === row.key,
        )?.error
      : undefined;
  const terms = filter.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = catalog.filter((command) => {
    if (!inputFilter) {
      if (target) return command.id === target.id;
      if (activeProvider && command.extensionId !== activeProvider.id) return false;
    }
    const assigned = rows.filter((row) => row.command === command.id);
    if (inputFilter && !assigned.some((row) => normalizeShortcut(row.key) === inputFilter.key))
      return false;
    const text = [
      command.title,
      command.id,
      command.extension,
      ...assigned.map(
        (row) =>
          `${row.key} ${keybindingConditionLabel(row.when, command.extensionId ? command.extension : undefined, applets)}`,
      ),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return (
      terms.every((term) => text.includes(term)) &&
      (statusFilter === 'all' ||
        (statusFilter === 'assigned' && assigned.length > 0) ||
        (statusFilter === 'unassigned' && !assigned.length) ||
        (statusFilter === 'conflict' && assigned.some((row) => statusError(row))))
    );
  });
  useSettingsFeedback({ error });
  return (
    <>
      <SettingsSection
        collapsible
        title={hostSettingItem('shortcuts', 'options').title}
        {...settingAnchor('shortcuts', 'options')}
      >
        <CommandExecutionModeField
          pageId="shortcuts"
          value={getKeybindingOptions(settings).executionMode}
          onChange={(executionMode) =>
            onChange({
              ...settings,
              keybindingOptions: { ...getKeybindingOptions(settings), executionMode },
            })
          }
        />
        <InputBrowserOptions
          pageId="shortcuts"
          value={getKeybindingOptions(settings)}
          onChange={(patch) =>
            onChange({
              ...settings,
              keybindingOptions: { ...getKeybindingOptions(settings), ...patch },
            })
          }
        />
      </SettingsSection>
      <CommandListSection
        title={hostSettingItem('shortcuts', 'keybindings').title}
        description={rows.length >= 2000 ? translate('settings.shortcutsEditor.limit') : undefined}
        className="shortcuts-editor command-shortcuts"
        {...settingAnchor('shortcuts', 'keybindings')}
      >
        <CommandBindingToolbar
          inputKind="shortcut"
          inputName={translate('settings.shortcutsEditor.title')}
          count={catalog.length}
          visibleCount={visible.length}
          filter={filter}
          statusFilter={statusFilter}
          setFilter={setFilter}
          setStatusFilter={setStatusFilter}
          showRegistrationErrors
          inputFilter={inputFilter}
          clearInputFilter={clearInput}
        >
          {target ? (
            <CommandTargetFilter />
          ) : (
            activeProvider && (
              <CommandProviderFilter title={activeProvider.title} onClear={clearProviderFilter} />
            )
          )}
        </CommandBindingToolbar>

        <ShortcutCommandList
          owned={owned}
          commands={visible}
          allCommands={catalog}
          settings={settings}
          applets={applets}
          onChange={onChange}
          showProvider
          selectedInput={inputFilter?.key}
          onInputFilter={selectInput}
          selectedProvider={activeProvider?.id}
          onProviderFilter={selectProvider}
          statusError={statusError}
          onRetry={() =>
            void settingsControls.retryGlobalHotKeys().catch((reason) => setError(String(reason)))
          }
        />
      </CommandListSection>
    </>
  );
}

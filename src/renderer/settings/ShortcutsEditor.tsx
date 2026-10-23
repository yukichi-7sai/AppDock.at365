import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { settingAnchor } from '../settings-ui/setting-anchor';
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
import { ShortcutOrderDialog } from '../settings-ui/ShortcutOrderDialog';
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
  const settingsControls = useSettingsControls();
  const {
    target,
    filter,
    setFilter,
    statusFilter,
    setStatusFilter,
    inputFilter,
    selectInput,
    clearInput,
  } = useBindingCommandFilter(provider?.request, clearProvider);
  const [error, setError] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
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
        extension: '未確認のコマンド',
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
      if (provider && command.extensionId !== provider.id) return false;
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
        hint={hostSettingItem('shortcuts', 'options').description}
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
      <SettingsSection
        title={hostSettingItem('shortcuts', 'keybindings').title}
        description={
          rows.length >= 2000
            ? '割り当ては2000件までです。追加するには既存の割り当てを削除してください。'
            : undefined
        }
        hint="＋で割り当てを追加します。"
        className="shortcuts-editor command-shortcuts"
        {...settingAnchor('shortcuts', 'keybindings')}
      >
        <CommandBindingToolbar
          inputName="ショートカットキー"
          count={catalog.length}
          visibleCount={visible.length}
          filter={filter}
          statusFilter={statusFilter}
          setFilter={setFilter}
          setStatusFilter={setStatusFilter}
          onOrder={() => setOrderOpen(true)}
          showRegistrationErrors
          inputFilter={inputFilter}
          clearInputFilter={clearInput}
        >
          {target ? (
            <CommandTargetFilter />
          ) : (
            provider && <CommandProviderFilter title={provider.title} onClear={clearProvider} />
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
          statusError={statusError}
          onRetry={() =>
            void settingsControls.retryGlobalHotKeys().catch((reason) => setError(String(reason)))
          }
        />
        {orderOpen && (
          <ShortcutOrderDialog
            settings={settings}
            commands={catalog}
            applets={applets}
            onChange={onChange}
            onClose={() => setOrderOpen(false)}
          />
        )}
      </SettingsSection>
    </>
  );
}

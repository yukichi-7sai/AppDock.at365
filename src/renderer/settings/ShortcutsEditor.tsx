import type { Settings } from '../../shared/contracts';
import { getKeybindingOptions } from '../../shared/keybindings';
import { SettingsField, SettingsSection } from '../settings-ui/SettingsSections';
import { Toggle } from '../settings-ui/Toggle';
import { hostSettingItem } from '../../shared/settings-catalog';
import { useHostTranslation } from '../HostTranslation';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { TriggerExcludedProcessesField } from '../settings-ui/TriggerExcludedProcessesField';

export function ShortcutsEditor({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange(value: Settings): void;
}) {
  const options = getKeybindingOptions(settings);
  const { t } = useHostTranslation();
  const enabledTitle = hostSettingItem('shortcuts', 'enabled').title;
  return (
    <>
      <SettingsSection data-testid="key-gesture-options" {...settingAnchor('shortcuts', 'options')}>
        <SettingsField
          title={enabledTitle}
          hint={t('settings.shortcutsEditor.enabledHint')}
          {...settingAnchor('shortcuts', 'enabled')}
        >
          <Toggle
            label={enabledTitle}
            checked={options.enabled}
            onChange={(enabled) =>
              onChange({ ...settings, keybindingOptions: { ...options, enabled } })
            }
          />
        </SettingsField>
        <CommandExecutionModeField
          pageId="shortcuts"
          value={getKeybindingOptions(settings).executionMode}
          onChange={(executionMode) =>
            onChange({
              ...settings,
              keybindingOptions: {
                ...settings.keybindingOptions,
                enabled: options.enabled,
                excludedProcesses: options.excludedProcesses,
                inputExecutionModes: options.inputExecutionModes,
                executionMode,
              },
            })
          }
        />
        <TriggerExcludedProcessesField
          pageId="shortcuts"
          values={options.excludedProcesses}
          onChange={(excludedProcesses) =>
            onChange({
              ...settings,
              keybindingOptions: {
                ...settings.keybindingOptions,
                enabled: options.enabled,
                executionMode: options.executionMode,
                inputExecutionModes: options.inputExecutionModes,
                excludedProcesses,
              },
            })
          }
        />
      </SettingsSection>
      <InputBrowserOptions pageId="shortcuts" settings={settings} onChange={onChange} />
    </>
  );
}

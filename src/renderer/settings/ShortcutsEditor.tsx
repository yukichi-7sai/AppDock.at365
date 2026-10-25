import type { Settings } from '../../shared/contracts';
import { getKeybindingOptions } from '../../shared/keybindings';
import { SettingsSection } from '../settings-ui/SettingsSections';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';
import { settingAnchor } from '../settings-ui/setting-anchor';

export function ShortcutsEditor({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange(value: Settings): void;
}) {
  return (
    <>
      <SettingsSection data-testid="key-gesture-options" {...settingAnchor('shortcuts', 'options')}>
        <CommandExecutionModeField
          pageId="shortcuts"
          value={getKeybindingOptions(settings).executionMode}
          onChange={(executionMode) =>
            onChange({ ...settings, keybindingOptions: { executionMode } })
          }
        />
      </SettingsSection>
      <InputBrowserOptions pageId="shortcuts" settings={settings} onChange={onChange} />
    </>
  );
}

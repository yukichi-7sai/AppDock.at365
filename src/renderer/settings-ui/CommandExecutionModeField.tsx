import { useHostTranslation } from '../HostTranslation';
import type { GestureExecutionMode } from '../../shared/command-execution-mode';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from './setting-anchor';
import { SettingsField } from './SettingsSections';

/** All trigger settings use the same label, choices, hint and layout. */
export function CommandExecutionModeField({
  pageId,
  value,
  onChange,
}: {
  pageId: 'shortcuts' | 'gestures' | 'touchpad-gestures';
  value: GestureExecutionMode;
  onChange(value: GestureExecutionMode): void;
}) {
  const { t: translate } = useHostTranslation();
  const item = hostSettingItem(pageId, 'executionMode');
  return (
    <SettingsField
      title={item.title}
      hint={translate('settings.commandExecutionModeField.hint')}
      {...settingAnchor(pageId, 'executionMode')}
    >
      <select
        aria-label={item.title}
        value={value}
        onChange={(event) => onChange(event.target.value as GestureExecutionMode)}
      >
        <option value="first">{translate('settings.commandExecutionModeField.first')}</option>
        <option value="all">{translate('settings.commandExecutionModeField.all')}</option>
      </select>
    </SettingsField>
  );
}

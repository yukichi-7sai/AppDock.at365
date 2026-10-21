import type { CommandExecutionMode } from '../../shared/command-execution';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from './setting-anchor';
import { SettingsField } from './SettingsSections';

/** Both input settings use the same label, choices, hint and layout. */
export function CommandExecutionModeField({
  pageId,
  value,
  onChange,
}: {
  pageId: 'shortcuts' | 'gestures';
  value: CommandExecutionMode;
  onChange(value: CommandExecutionMode): void;
}) {
  const item = hostSettingItem(pageId, 'executionMode');
  return (
    <SettingsField
      title={item.title}
      hint="操作と「いつ・どこで」の条件に一致したコマンドを、登録順に選びます。"
      {...settingAnchor(pageId, 'executionMode')}
    >
      <select
        aria-label={item.title}
        value={value}
        onChange={(event) => onChange(event.target.value as CommandExecutionMode)}
      >
        <option value="first">最初の1つ</option>
        <option value="all">すべて</option>
      </select>
    </SettingsField>
  );
}

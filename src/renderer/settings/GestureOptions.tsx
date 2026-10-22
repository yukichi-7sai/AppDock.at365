import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, numberInput } from '../settings-ui/SettingsInput';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsField, SettingsSection } from '../settings-ui/SettingsSections';
import type { GestureSettings } from '../../shared/gestures';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';
function Names({
  itemKey,
  values,
  change,
  hint,
}: {
  itemKey: string;
  values: string[];
  change: (values: string[]) => void;
  hint?: string;
}) {
  const label = hostSettingItem('gestures', itemKey).title;
  return (
    <SettingsField title={label} hint={hint} {...settingAnchor('gestures', itemKey)}>
      <SettingsInput
        aria-label={label}
        value={values.join(', ')}
        placeholder="chrome.exe, firefox.exe"
        onChange={(e) =>
          change(
            e.target.value
              .split(/[\n,]/)
              .map((v) => v.trim())
              .filter(Boolean),
          )
        }
      />
    </SettingsField>
  );
}

export function GestureOptions({
  gestures,
  change,
}: {
  gestures: GestureSettings;
  change(patch: Partial<GestureSettings>): void;
}) {
  return (
    <SettingsSection
      collapsible
      className="gesture-settings-section"
      title={hostSettingItem('gestures', 'options').title}
      hint={`${hostSettingItem('gestures', 'options').description ?? ''} 何も操作せず右ボタンを離すと、通常の右クリックになります。`}
      {...settingAnchor('gestures', 'options')}
    >
      <SettingsField
        title={hostSettingItem('gestures', 'enabled').title}
        hint="右ボタンを押しながら、移動・クリック・ホイール・キーで操作。一時停止はトレイから切り替えられます。"
        {...settingAnchor('gestures', 'enabled')}
      >
        <Toggle
          label={hostSettingItem('gestures', 'enabled').title}
          checked={gestures.enabled}
          onChange={(enabled) => change({ enabled })}
        />
      </SettingsField>
      <SettingsField
        title={hostSettingItem('gestures', 'activateOnStart').title}
        hint="右ボタンを押した場所をアクティブにして、その対象でジェスチャーを開始します。"
        {...settingAnchor('gestures', 'activateOnStart')}
      >
        <Toggle
          label={hostSettingItem('gestures', 'activateOnStart').title}
          checked={gestures.activateOnStart ?? false}
          onChange={(activateOnStart) => change({ activateOnStart })}
        />
      </SettingsField>
      <CommandExecutionModeField
        pageId="gestures"
        value={gestures.executionMode}
        onChange={(executionMode) => change({ executionMode })}
      />
      <SettingsField
        group="操作感"
        title={hostSettingItem('gestures', 'distance').title}
        {...settingAnchor('gestures', 'distance')}
      >
        <SettingsInput
          aria-label={hostSettingItem('gestures', 'distance').title}
          type="number"
          min="5"
          max="500"
          value={gestures.distance}
          onChange={(e) => change({ distance: numberInput(e.target.value) })}
        />
      </SettingsField>
      <SettingsField
        group="操作感"
        title={hostSettingItem('gestures', 'wheelDelayMs').title}
        {...settingAnchor('gestures', 'wheelDelayMs')}
      >
        <SettingsInput
          aria-label={hostSettingItem('gestures', 'wheelDelayMs').title}
          type="number"
          min="0"
          max="5000"
          value={gestures.wheelDelayMs}
          onChange={(e) => change({ wheelDelayMs: numberInput(e.target.value) })}
        />
      </SettingsField>
      <SettingsField
        group="待機表示"
        title={hostSettingItem('gestures', 'indicatorPosition').title}
        hint="選択した実行方法に合わせて、実行対象のコマンドを表示します。"
        {...settingAnchor('gestures', 'indicatorPosition')}
      >
        <select
          aria-label={hostSettingItem('gestures', 'indicatorPosition').title}
          value={gestures.indicatorPosition}
          onChange={(e) =>
            change({
              indicatorPosition: e.target.value as GestureSettings['indicatorPosition'],
            })
          }
        >
          <option value="gesture-start">ジェスチャー開始地点</option>
          <option value="window-center">対象ウィンドウの中央</option>
          <option value="monitor-center">カーソルのあるモニターの中央</option>
          <option value="none">表示なし</option>
        </select>
      </SettingsField>
      <SettingsField
        group="待機表示"
        title={hostSettingItem('gestures', 'indicatorOpacity').title}
        {...settingAnchor('gestures', 'indicatorOpacity')}
      >
        <SettingsInput
          aria-label={hostSettingItem('gestures', 'indicatorOpacity').title}
          type="number"
          min="0.1"
          max="1"
          step="0.05"
          disabled={gestures.indicatorPosition === 'none'}
          value={gestures.indicatorOpacity}
          onChange={(e) => change({ indicatorOpacity: numberInput(e.target.value) })}
        />
      </SettingsField>
      <SettingsField
        group="待機表示"
        title={hostSettingItem('gestures', 'indicatorShowNoAction').title}
        hint="OFFの場合、割り当てに一致しない移動では表示しません。"
        {...settingAnchor('gestures', 'indicatorShowNoAction')}
      >
        <Toggle
          label={hostSettingItem('gestures', 'indicatorShowNoAction').title}
          checked={gestures.indicatorShowNoAction}
          onChange={(indicatorShowNoAction) => change({ indicatorShowNoAction })}
        />
      </SettingsField>
      <InputBrowserOptions pageId="gestures" value={gestures} onChange={change} />
      <Names
        hint="この一覧のアプリでは、すべてのジェスチャーを無効にします。"
        itemKey="excludedProcesses"
        values={gestures.excludedProcesses}
        change={(excludedProcesses) => change({ excludedProcesses })}
      />
    </SettingsSection>
  );
}

import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea, numberInput } from '../settings-ui/SettingsInput';
import { useEffect, useState } from 'react';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsSection } from '../settings-ui/SettingsSections';
import type { GestureSettings } from '../../shared/gestures';
function Names({
  itemKey,
  values,
  change,
}: {
  itemKey: string;
  values: string[];
  change: (values: string[]) => void;
}) {
  const label = hostSettingItem('gestures', itemKey).title;
  const [text, setText] = useState(values.join(', '));
  useEffect(() => setText(values.join(', ')), [JSON.stringify(values)]);
  return (
    <label className="gesture-option" {...settingAnchor('gestures', itemKey)}>
      <span>{label}</span>
      <SettingsInput
        aria-label={label}
        value={text}
        placeholder="chrome.exe, firefox.exe"
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          change(
            text
              .split(/[\n,]/)
              .map((v) => v.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
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
      description={hostSettingItem('gestures', 'options').description}
      {...settingAnchor('gestures', 'options')}
    >
      <p className="settings-help">
        一時停止はトレイから切り替えられます。何も操作せず右ボタンを離すと、通常の右クリックになります。
      </p>
      <Names
        itemKey="browsers"
        values={gestures.browsers}
        change={(browsers) => change({ browsers })}
      />
      <Names
        itemKey="excludedProcesses"
        values={gestures.excludedProcesses}
        change={(excludedProcesses) => change({ excludedProcesses })}
      />
      <div className="gesture-enabled" {...settingAnchor('gestures', 'requireChromiumWindowClass')}>
        <Toggle
          label={hostSettingItem('gestures', 'requireChromiumWindowClass').title}
          checked={gestures.requireChromiumWindowClass}
          onChange={(requireChromiumWindowClass) => change({ requireChromiumWindowClass })}
        />
        {hostSettingItem('gestures', 'requireChromiumWindowClass').title}
      </div>{' '}
      <p className="settings-help">
        Firefoxなどではオフにします。WebBrowserToolsの操作対象もこの一覧を使います。exe名のみを指定し、パスは含めません。
      </p>
      <div className="gesture-options-grid">
        <label className="gesture-option" {...settingAnchor('gestures', 'distance')}>
          <span>{hostSettingItem('gestures', 'distance').title}</span>
          <SettingsInput
            type="number"
            min="5"
            max="500"
            value={gestures.distance}
            onChange={(e) => change({ distance: numberInput(e.target.value) })}
          />
        </label>
        <label className="gesture-option" {...settingAnchor('gestures', 'wheelDelayMs')}>
          <span>{hostSettingItem('gestures', 'wheelDelayMs').title}</span>
          <SettingsInput
            type="number"
            min="0"
            max="5000"
            value={gestures.wheelDelayMs}
            onChange={(e) => change({ wheelDelayMs: numberInput(e.target.value) })}
          />
        </label>
        <label className="gesture-option" {...settingAnchor('gestures', 'indicatorPosition')}>
          <span>{hostSettingItem('gestures', 'indicatorPosition').title}</span>
          <select
            value={gestures.indicatorPosition}
            onChange={(e) =>
              change({ indicatorPosition: e.target.value as typeof gestures.indicatorPosition })
            }
          >
            <option value="gesture-start">ジェスチャー開始地点</option>
            <option value="window-center">対象ウィンドウの中央</option>
          </select>
        </label>
        <label className="gesture-option" {...settingAnchor('gestures', 'indicatorOpacity')}>
          <span>{hostSettingItem('gestures', 'indicatorOpacity').title}</span>
          <SettingsInput
            type="number"
            min="0.1"
            max="1"
            step="0.05"
            value={gestures.indicatorOpacity}
            onChange={(e) => change({ indicatorOpacity: numberInput(e.target.value) })}
          />
        </label>
      </div>
    </SettingsSection>
  );
}

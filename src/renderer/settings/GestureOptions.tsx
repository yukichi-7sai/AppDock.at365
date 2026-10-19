import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, numberInput } from '../settings-ui/SettingsInput';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsField, SettingsSection } from '../settings-ui/SettingsSections';
import { SettingsHint } from '../settings-ui/SettingsHint';
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
  return (
    <label className="gesture-option" {...settingAnchor('gestures', itemKey)}>
      <span>{label}</span>
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
      <SettingsField
        title={hostSettingItem('gestures', 'enabled').title}
        description="右ボタンを押しながら、移動・クリック・ホイール・キーで操作。一時停止はトレイから切り替えられます。"
        {...settingAnchor('gestures', 'enabled')}
      >
        <Toggle
          label={hostSettingItem('gestures', 'enabled').title}
          checked={gestures.enabled}
          onChange={(enabled) => change({ enabled })}
        />
      </SettingsField>
      <SettingsField
        title={hostSettingItem('gestures', 'executionMode').title}
        description="操作と「いつ・どこで」の条件に一致したコマンドを、登録順に選びます。"
        {...settingAnchor('gestures', 'executionMode')}
      >
        <select
          aria-label={hostSettingItem('gestures', 'executionMode').title}
          value={gestures.executionMode}
          onChange={(e) =>
            change({ executionMode: e.target.value as GestureSettings['executionMode'] })
          }
        >
          <option value="first">最初の1つ</option>
          <option value="all">すべて</option>
        </select>
      </SettingsField>
      <SettingsField title="操作感">
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
        </div>
      </SettingsField>
      <SettingsField
        title="待機表示"
        description="選択した実行方法に合わせて、実行対象のコマンドを表示します。"
      >
        <div className="gesture-options-grid">
          <label className="gesture-option" {...settingAnchor('gestures', 'indicatorPosition')}>
            <span>{hostSettingItem('gestures', 'indicatorPosition').title}</span>
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
              <option value="none">表示なし</option>
            </select>
          </label>
          <label className="gesture-option" {...settingAnchor('gestures', 'indicatorOpacity')}>
            <span>{hostSettingItem('gestures', 'indicatorOpacity').title}</span>
            <SettingsInput
              type="number"
              min="0.1"
              max="1"
              step="0.05"
              disabled={gestures.indicatorPosition === 'none'}
              value={gestures.indicatorOpacity}
              onChange={(e) => change({ indicatorOpacity: numberInput(e.target.value) })}
            />
          </label>
        </div>
      </SettingsField>
      <SettingsField
        title="Webブラウザ"
        description="exe名のみを指定し、パスは含めません。WebBrowserToolsの操作対象もこの一覧を使います。"
      >
        <Names
          itemKey="browsers"
          values={gestures.browsers}
          change={(browsers) => change({ browsers })}
        />
        <div
          className="gesture-enabled"
          {...settingAnchor('gestures', 'requireChromiumWindowClass')}
        >
          <Toggle
            label={hostSettingItem('gestures', 'requireChromiumWindowClass').title}
            checked={gestures.requireChromiumWindowClass}
            onChange={(requireChromiumWindowClass) => change({ requireChromiumWindowClass })}
          />
          <span>{hostSettingItem('gestures', 'requireChromiumWindowClass').title}</span>
        </div>
        <p className="settings-help">FirefoxなどではChromiumウィンドウの条件をオフにします。</p>
      </SettingsField>
      <SettingsField
        title="除外"
        description="この一覧のアプリでは、すべてのジェスチャーを無効にします。"
      >
        <Names
          itemKey="excludedProcesses"
          values={gestures.excludedProcesses}
          change={(excludedProcesses) => change({ excludedProcesses })}
        />
      </SettingsField>
      <SettingsHint className="settings-help">
        何も操作せず右ボタンを離すと、通常の右クリックになります。
      </SettingsHint>
    </SettingsSection>
  );
}

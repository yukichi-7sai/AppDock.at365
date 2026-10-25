import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, numberInput } from '../settings-ui/SettingsInput';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsField, SettingsSection } from '../settings-ui/SettingsSections';
import type { GestureSettings } from '../../shared/gestures';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { GestureIndicatorPreview } from './GestureIndicatorPreview';
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
  const { t: translate } = useHostTranslation();
  return (
    <>
      <SettingsSection data-testid="mouse-gesture-enablement">
        <SettingsField
          title={hostSettingItem('gestures', 'enabled').title}
          hint={translate('settings.gestureOptions.enabledHint')}
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
          hint={translate('settings.gestureOptions.activateHint')}
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
          group={translate('settings.gestureOptions.feel')}
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
          group={translate('settings.gestureOptions.feel')}
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
          group={translate('settings.gestureOptions.indicator')}
          title={hostSettingItem('gestures', 'indicatorPosition').title}
          hint={translate('settings.gestureOptions.indicatorHint')}
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
            <option value="gesture-start">
              {translate('settings.gestureOptions.startPosition')}
            </option>
            <option value="window-center">
              {translate('settings.gestureOptions.windowCenter')}
            </option>
            <option value="monitor-center">
              {translate('settings.gestureOptions.monitorCenter')}
            </option>
            <option value="none">{translate('settings.gestureOptions.hidden')}</option>
          </select>
        </SettingsField>
        <SettingsField
          group={translate('settings.gestureOptions.indicator')}
          title={hostSettingItem('gestures', 'indicatorStyle').title}
          {...settingAnchor('gestures', 'indicatorStyle')}
        >
          <select
            aria-label={hostSettingItem('gestures', 'indicatorStyle').title}
            value={gestures.indicatorStyle}
            disabled={gestures.indicatorPosition === 'none'}
            onChange={(e) =>
              change({ indicatorStyle: e.target.value as GestureSettings['indicatorStyle'] })
            }
          >
            <option value="compact">{translate('settings.gestureOptions.styleCompact')}</option>
            <option value="pill">{translate('settings.gestureOptions.stylePill')}</option>
            <option value="ring">{translate('settings.gestureOptions.styleRing')}</option>
            <option value="classic">{translate('settings.gestureOptions.styleClassic')}</option>
          </select>
        </SettingsField>
        <SettingsField
          group={translate('settings.gestureOptions.indicator')}
          title={hostSettingItem('gestures', 'indicatorOpacity').title}
          hint={translate('settings.gestureOptions.opacityHint')}
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
          group={translate('settings.gestureOptions.indicator')}
          title={translate('settings.gestureOptions.preview')}
        >
          <GestureIndicatorPreview
            style={gestures.indicatorStyle}
            opacity={gestures.indicatorOpacity}
            hidden={gestures.indicatorPosition === 'none'}
          />
        </SettingsField>
        <SettingsField
          group={translate('settings.gestureOptions.indicator')}
          title={hostSettingItem('gestures', 'indicatorShowNoAction').title}
          hint={translate('settings.gestureOptions.noActionHint')}
          {...settingAnchor('gestures', 'indicatorShowNoAction')}
        >
          <Toggle
            label={hostSettingItem('gestures', 'indicatorShowNoAction').title}
            checked={gestures.indicatorShowNoAction}
            onChange={(indicatorShowNoAction) => change({ indicatorShowNoAction })}
          />
        </SettingsField>
        <Names
          hint={translate('settings.gestureOptions.excludedHint')}
          itemKey="excludedProcesses"
          values={gestures.excludedProcesses}
          change={(excludedProcesses) => change({ excludedProcesses })}
        />
      </SettingsSection>
    </>
  );
}

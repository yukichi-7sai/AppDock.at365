import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { SettingsInput } from './SettingsInput';
import { SettingsField } from './SettingsSections';
import { Toggle } from './Toggle';
import { settingAnchor } from './setting-anchor';

export function InputBrowserOptions({
  pageId,
  value,
  onChange,
}: {
  pageId: 'shortcuts' | 'gestures' | 'touchpad-gestures';
  value: { browsers: string[]; requireChromiumWindowClass: boolean };
  onChange(patch: Partial<typeof value>): void;
}) {
  const { t: translate } = useHostTranslation();
  const title = hostSettingItem(pageId, 'requireChromiumWindowClass').title;
  return (
    <>
      <SettingsField
        group={translate('settings.inputBrowserOptions.browser')}
        title={hostSettingItem(pageId, 'browsers').title}
        hint={
          translate('settings.inputBrowserOptions.executableHint') +
          (pageId === 'gestures'
            ? translate('settings.inputBrowserOptions.webToolsHint')
            : translate('settings.inputBrowserOptions.conditionHint'))
        }
        {...settingAnchor(pageId, 'browsers')}
      >
        <SettingsInput
          aria-label={hostSettingItem(pageId, 'browsers').title}
          value={value.browsers.join(', ')}
          placeholder="chrome.exe, firefox.exe"
          onChange={(event) =>
            onChange({
              browsers: event.target.value
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </SettingsField>
      <SettingsField
        group={translate('settings.inputBrowserOptions.browser')}
        title={title}
        description={translate('settings.inputBrowserOptions.chromiumHint')}
        {...settingAnchor(pageId, 'requireChromiumWindowClass')}
      >
        <Toggle
          label={title}
          checked={value.requireChromiumWindowClass}
          onChange={(requireChromiumWindowClass) => onChange({ requireChromiumWindowClass })}
        />
      </SettingsField>
    </>
  );
}

import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { SettingsInput } from './SettingsInput';
import { SettingsField, SettingsSection } from './SettingsSections';
import type { Settings } from '../../shared/contracts';
import { getCommandTriggerOptions } from '../../shared/command-trigger-options';
import { Toggle } from './Toggle';
import { settingAnchor } from './setting-anchor';

export function InputBrowserOptions({
  pageId,
  settings,
  onChange,
}: {
  pageId: 'shortcuts' | 'gestures' | 'touchpad-gestures';
  settings: Settings;
  onChange(value: Settings): void;
}) {
  const { t: translate } = useHostTranslation();
  const value = getCommandTriggerOptions(settings);
  const change = (patch: Partial<typeof value>) =>
    onChange({ ...settings, commandTriggerOptions: { ...value, ...patch } });
  const title = hostSettingItem(pageId, 'requireChromiumWindowClass').title;
  return (
    <SettingsSection
      title={translate('settings.commandTriggerOptions.title')}
      data-testid="gesture-common-options"
      {...settingAnchor(pageId, 'commonOptions')}
    >
      <SettingsField
        title={hostSettingItem(pageId, 'browsers').title}
        hint={
          translate('settings.inputBrowserOptions.executableHint') +
          translate('settings.inputBrowserOptions.conditionHint')
        }
        {...settingAnchor(pageId, 'browsers')}
      >
        <SettingsInput
          aria-label={hostSettingItem(pageId, 'browsers').title}
          value={value.browsers.join(', ')}
          placeholder="chrome, firefox"
          onChange={(event) =>
            change({
              browsers: event.target.value
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </SettingsField>
      <SettingsField
        title={title}
        description={translate('settings.inputBrowserOptions.chromiumHint')}
        {...settingAnchor(pageId, 'requireChromiumWindowClass')}
      >
        <Toggle
          label={title}
          checked={value.requireChromiumWindowClass}
          onChange={(requireChromiumWindowClass) => change({ requireChromiumWindowClass })}
        />
      </SettingsField>
    </SettingsSection>
  );
}

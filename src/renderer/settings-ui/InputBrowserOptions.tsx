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
  pageId: 'shortcuts' | 'gestures';
  value: { browsers: string[]; requireChromiumWindowClass: boolean };
  onChange(patch: Partial<typeof value>): void;
}) {
  const title = hostSettingItem(pageId, 'requireChromiumWindowClass').title;
  return (
    <>
      <SettingsField
        group="Webブラウザ"
        title={hostSettingItem(pageId, 'browsers').title}
        hint={
          'exe名のみを指定し、パスは含めません。' +
          (pageId === 'gestures'
            ? 'WebBrowserToolsの操作対象もこの一覧を使います。'
            : 'ショートカットキーのブラウザ条件に使います。')
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
        group="Webブラウザ"
        title={title}
        description="FirefoxなどではChromiumウィンドウの条件をオフにします。"
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

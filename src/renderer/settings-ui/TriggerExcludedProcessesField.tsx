import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { SettingsField } from './SettingsSections';
import { SettingsInput } from './SettingsInput';
import { settingAnchor } from './setting-anchor';

/** Trigger-wide exclusions share the same input and commit behavior. */
export function TriggerExcludedProcessesField({
  pageId,
  values,
  onChange,
}: {
  pageId: 'shortcuts' | 'gestures' | 'touchpad-gestures';
  values: readonly string[];
  onChange(values: string[]): void;
}) {
  const { t } = useHostTranslation();
  const title = hostSettingItem(pageId, 'excludedProcesses').title;
  return (
    <SettingsField
      title={title}
      hint={t('settings.triggerExcludedProcesses.hint')}
      {...settingAnchor(pageId, 'excludedProcesses')}
    >
      <SettingsInput
        data-testid="trigger-excluded-processes"
        aria-label={title}
        value={values.join(', ')}
        placeholder="notepad, explorer"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[,\n]/)
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
      />
    </SettingsField>
  );
}

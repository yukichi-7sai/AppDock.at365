import { useHostTranslation } from '../HostTranslation';
import { SettingsInput } from './SettingsInput';
import { SettingsField, SettingsSection } from './SettingsSections';
import type { Settings } from '../../shared/contracts';
import {
  commandTriggerSettingDefinitions,
  getCommandTriggerOptions,
} from '../../shared/command-trigger-options';
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
  return (
    <SettingsSection
      title={translate('settings.commandTriggerOptions.title')}
      data-testid="gesture-common-options"
      {...settingAnchor(pageId, 'commonOptions')}
    >
      {commandTriggerSettingDefinitions()
        .filter((field) => !field.secret)
        .map((field) => {
          const current = (value as Record<string, unknown>)[field.key] ?? field.default;
          const set = (next: unknown) => change({ [field.key]: next });
          return (
            <SettingsField
              key={field.key}
              title={field.title}
              hint={field.hint ? field.description : undefined}
              description={field.hint ? undefined : field.description}
              {...settingAnchor(pageId, field.key)}
            >
              {field.type === 'boolean' ? (
                <Toggle label={field.title} checked={Boolean(current)} onChange={set} />
              ) : field.type === 'select' ? (
                <select
                  aria-label={field.title}
                  value={String(current ?? '')}
                  onChange={(event) => set(event.target.value)}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <SettingsInput
                  aria-label={field.title}
                  type={field.type === 'number' ? 'number' : 'text'}
                  min={field.minimum}
                  max={field.maximum}
                  step={field.step}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  value={
                    field.type === 'string-list'
                      ? (current as string[]).join(', ')
                      : ((current as string | number) ?? '')
                  }
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    set(
                      field.type === 'string-list'
                        ? event.target.value
                            .split(/[\n,]/)
                            .map((part) => part.trim())
                            .filter(Boolean)
                        : field.type === 'number' && event.target.value !== ''
                          ? Number(event.target.value)
                          : event.target.value,
                    )
                  }
                />
              )}
            </SettingsField>
          );
        })}
    </SettingsSection>
  );
}

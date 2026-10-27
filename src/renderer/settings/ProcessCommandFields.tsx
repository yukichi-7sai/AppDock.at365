import { useHostTranslation } from '../HostTranslation';
import { useState, type ReactNode } from 'react';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { defaultProcessLaunch } from '../../shared/process-launch';
import { SettingsDescriptionIcon } from '../settings-ui/SettingsHintIcon';
import { CustomCommandOptions } from './CustomCommandOptions';
export function ProcessCommandFields({
  config,
  onChange,
  onValidity,
  advancedOptions,
}: {
  config: Record<string, unknown>;
  onChange(value: Record<string, unknown>): void;
  onValidity(valid: boolean): void;
  advancedOptions?: ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  const [args, setArgs] = useState(() => JSON.stringify(config.arguments ?? [], null, 2));
  const [error, setError] = useState('');
  return (
    <>
      <SettingsField title={translate('settings.processCommandFields.mode')}>
        <div className="custom-command-select">
          <select
            data-testid="custom-command-process-mode"
            aria-label={translate('settings.processCommandFields.mode')}
            value={String(config.mode ?? 'executable')}
            onChange={(e) => {
              const mode = e.target.value;
              onChange({
                ...(mode === 'executable'
                  ? defaultProcessLaunch()
                  : mode === 'cmd'
                    ? { mode, command: '' }
                    : { mode, script: '' }),
                workingDirectory: config.workingDirectory ?? '',
                showConsole: config.showConsole ?? false,
              });
              setArgs('[]');
              setError('');
              onValidity(true);
            }}
          >
            <option value="executable">
              {translate('settings.processCommandFields.executable')}
            </option>
            <option value="cmd">{translate('settings.processCommandFields.cmd')}</option>
            <option value="powershell">Windows PowerShell</option>
          </select>
          <SettingsDescriptionIcon
            title={translate('settings.processCommandFields.mode')}
            description={translate('settings.processCommandFields.modeHint')}
            testId="custom-command-process-info"
          />
        </div>
      </SettingsField>
      {config.mode === 'executable' ? (
        <>
          <SettingsField title={translate('settings.processCommandFields.executable')}>
            <SettingsInput
              aria-label={translate('settings.processCommandFields.executable')}
              value={String(config.executable ?? '')}
              maxLength={4096}
              placeholder={translate('settings.processCommandFields.path')}
              onChange={(e) => onChange({ ...config, executable: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            error={error ? error : ''}
            title={translate('settings.processCommandFields.args')}
            hint={translate('settings.processCommandFields.argsHint')}
          >
            <SettingsTextarea
              aria-label={translate('settings.processCommandFields.args')}
              value={args}
              rows={4}
              onChange={(e) => {
                setArgs(e.target.value);
                try {
                  const value = JSON.parse(e.target.value);
                  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
                    throw Error();
                  onChange({ ...config, arguments: value });
                  setError('');
                  onValidity(true);
                } catch {
                  setError(translate('settings.processCommandFields.argsArray'));
                  onValidity(false);
                }
              }}
            />
          </SettingsField>
        </>
      ) : (
        <SettingsField
          title={
            config.mode === 'cmd'
              ? translate('settings.processCommandFields.command')
              : translate('settings.processCommandFields.script')
          }
        >
          <SettingsTextarea
            aria-label={
              config.mode === 'cmd'
                ? translate('settings.processCommandFields.command')
                : translate('settings.processCommandFields.script')
            }
            rows={6}
            maxLength={8192}
            value={String(config[config.mode === 'cmd' ? 'command' : 'script'] ?? '')}
            onChange={(e) =>
              onChange({
                ...config,
                [config.mode === 'cmd' ? 'command' : 'script']: e.target.value,
              })
            }
          />
        </SettingsField>
      )}
      <CustomCommandOptions>
        <SettingsField title={translate('settings.processCommandFields.directory')}>
          <SettingsInput
            aria-label={translate('settings.processCommandFields.directory')}
            value={String(config.workingDirectory ?? '')}
            maxLength={4096}
            placeholder={translate('settings.processCommandFields.directoryHint')}
            onChange={(e) => onChange({ ...config, workingDirectory: e.target.value })}
          />
        </SettingsField>
        <SettingsChoice
          label={translate('settings.processCommandFields.showConsole')}
          checked={config.showConsole === true}
          onChange={(showConsole) => onChange({ ...config, showConsole })}
        />
        {advancedOptions}
      </CustomCommandOptions>
    </>
  );
}

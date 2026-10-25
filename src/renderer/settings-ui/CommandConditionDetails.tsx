import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useState } from 'react';
import { processNames } from '../../shared/command-conditions';
import type { Keybinding } from '../../shared/keybindings';
import { SettingsField } from './SettingsSections';
import { Toggle } from './Toggle';
import { SettingsTextarea } from './SettingsInput';

export function useConditionProcesses(when: Keybinding['when']) {
  const [processText, setProcessText] = useState((when.processes ?? []).join(', '));
  let processes: string[] = [],
    processError = '';
  if (when.scope === 'exe') {
    try {
      processes = processNames(
        processText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } catch {
      processError = hostText('settings.commandConditionDetails.processHint');
    }
  }
  return { processText, setProcessText, processes, processError };
}

/** Shared condition controls for all command trigger types. */
export function CommandConditionDetails({
  when,
  onChange,
  processText,
  setProcessText,
  processes,
  processError,
}: {
  when: Keybinding['when'];
  onChange(when: Keybinding['when']): void;
  processText: string;
  setProcessText(text: string): void;
  processes: string[];
  processError: string;
}) {
  const { t: translate } = useHostTranslation();
  return (
    <>
      {['global', 'exe'].includes(when.scope) && (
        <SettingsField
          className="binding-inline-toggle"
          title={translate('settings.commandConditionDetails.excludeDesktop')}
        >
          <Toggle
            label={translate('settings.commandConditionDetails.excludeDesktop')}
            checked={when.excludeDesktop ?? false}
            onChange={(excludeDesktop) => onChange({ ...when, excludeDesktop })}
          />
        </SettingsField>
      )}
      {when.scope === 'exe' && (
        <SettingsField
          title={translate('settings.commandConditionDetails.processes')}
          hint={translate('settings.commandConditionDetails.anyProcess')}
          error={
            processError ||
            (!processes.length ? translate('settings.commandConditionDetails.processRequired') : '')
          }
        >
          <SettingsTextarea
            aria-label={translate('settings.commandConditionDetails.processes')}
            rows={2}
            value={processText}
            placeholder="notepad.exe, explorer.exe"
            onChange={(event) => setProcessText(event.target.value)}
          />
        </SettingsField>
      )}
      {when.scope === 'global' && (
        <SettingsField
          title={translate('settings.commandConditionDetails.excludedProcesses')}
          description={translate('settings.commandConditionDetails.excludedProcessesPending')}
        >
          <SettingsTextarea
            data-testid="binding-excluded-processes"
            aria-label={translate('settings.commandConditionDetails.excludedProcesses')}
            rows={2}
            value=""
            disabled
          />
        </SettingsField>
      )}
    </>
  );
}

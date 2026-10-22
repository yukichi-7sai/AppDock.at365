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
      processError = 'パスを含めず、exe名をカンマまたは改行で区切ってください。';
    }
  }
  return { processText, setProcessText, processes, processError };
}

/** Shared condition controls for mouse gestures and shortcut keys. */
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
  return (
    <>
      {['global', 'exe'].includes(when.scope) && (
        <SettingsField title="デスクトップを除外">
          <Toggle
            label="デスクトップを除外"
            checked={when.excludeDesktop ?? false}
            onChange={(excludeDesktop) => onChange({ ...when, excludeDesktop })}
          />
        </SettingsField>
      )}
      {when.scope === 'exe' && (
        <SettingsField
          title="対象のexe名"
          hint="複数指定した場合は、いずれかに一致すると実行します。"
          error={processError || (!processes.length ? 'exe名を1件以上入力してください。' : '')}
        >
          <SettingsTextarea
            aria-label="対象のexe名"
            rows={2}
            value={processText}
            placeholder="notepad.exe, explorer.exe"
            onChange={(event) => setProcessText(event.target.value)}
          />
        </SettingsField>
      )}
    </>
  );
}

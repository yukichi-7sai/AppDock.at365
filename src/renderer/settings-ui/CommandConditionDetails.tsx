import { useState } from 'react';
import { processNames } from '../../shared/command-conditions';
import type { Keybinding } from '../../shared/keybindings';
import { SettingsHint } from './SettingsHint';
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
        <label className="gesture-desktop-exclusion">
          <input
            type="checkbox"
            checked={when.excludeDesktop ?? false}
            onChange={(event) => onChange({ ...when, excludeDesktop: event.target.checked })}
          />
          デスクトップを除外
        </label>
      )}
      {when.scope === 'browser' && (
        <SettingsHint as="small" className="gesture-condition-hint">
          画面上部の「動作設定」で指定したブラウザに適用します。
        </SettingsHint>
      )}
      {when.scope === 'exe' && (
        <label className="gesture-processes">
          <span>対象のexe名</span>
          <SettingsTextarea
            aria-label="対象のexe名"
            rows={2}
            value={processText}
            placeholder="notepad.exe, explorer.exe"
            onChange={(event) => setProcessText(event.target.value)}
          />
          <SettingsHint as="small">
            複数指定した場合は、いずれかに一致すると実行します。
          </SettingsHint>
          {(processError || !processes.length) && (
            <small role="alert">{processError || 'exe名を1件以上入力してください。'}</small>
          )}
        </label>
      )}
    </>
  );
}

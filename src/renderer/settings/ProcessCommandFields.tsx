import { useState } from 'react';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { defaultProcessLaunch } from '../../shared/process-launch';
export function ProcessCommandFields({
  config,
  onChange,
  onValidity,
}: {
  config: Record<string, unknown>;
  onChange(value: Record<string, unknown>): void;
  onValidity(valid: boolean): void;
}) {
  const [args, setArgs] = useState(() => JSON.stringify(config.arguments ?? [], null, 2));
  const [error, setError] = useState('');
  return (
    <>
      <SettingsField
        title="実行方法"
        description="起動受付を返します。終了待ち・標準出力の取得は行いません。"
      >
        <select
          aria-label="実行方法"
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
          <option value="executable">実行ファイル</option>
          <option value="cmd">コマンドプロンプト</option>
          <option value="powershell">Windows PowerShell</option>
        </select>
      </SettingsField>
      {config.mode === 'executable' ? (
        <>
          <SettingsField title="実行ファイル">
            <SettingsInput
              aria-label="実行ファイル"
              value={String(config.executable ?? '')}
              maxLength={4096}
              placeholder="実行する.exeの絶対パス"
              onChange={(e) => onChange({ ...config, executable: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            error={error ? error : ''}
            title="引数"
            hint={'文字列のJSON配列で指定します。例: ["ファイル名.txt", "--option"]'}
          >
            <SettingsTextarea
              aria-label="引数"
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
                  setError('文字列のJSON配列を指定してください。');
                  onValidity(false);
                }
              }}
            />
          </SettingsField>
        </>
      ) : (
        <SettingsField title={config.mode === 'cmd' ? 'コマンド' : 'スクリプト'}>
          <SettingsTextarea
            aria-label={config.mode === 'cmd' ? 'コマンド' : 'スクリプト'}
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
      <SettingsField title="作業フォルダー">
        <SettingsInput
          aria-label="作業フォルダー"
          value={String(config.workingDirectory ?? '')}
          maxLength={4096}
          placeholder="省略可。指定する場合は絶対パス"
          onChange={(e) => onChange({ ...config, workingDirectory: e.target.value })}
        />
      </SettingsField>
      <SettingsChoice
        label="コンソールを表示する"
        checked={config.showConsole === true}
        onChange={(showConsole) => onChange({ ...config, showConsole })}
      />
    </>
  );
}

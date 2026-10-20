import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsUrlInput, numberInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useState } from 'react';
import type { Settings, ExtensionSnapshot, UpdateState } from '../../shared/contracts';
import { createDefaultSettings } from '../../shared/settings-schema';
import { UpdateCheckTime } from '../settings-ui/VersionCheck';
import { SettingsSection, SettingsField, SettingsFeedback } from '../settings-ui/SettingsSections';
import { Toggle } from '../settings-ui/Toggle';

export function UpdateActions({ appletCount }: { appletCount: number }) {
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<UpdateState>({ busy: false, phase: '', results: [] });
  const [error, setError] = useState('');
  const checkedAt = state.results
    .map((result) => result.checkedAt)
    .sort()
    .at(-1);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void settingsControls.snapshot().then((snapshot) => {
        if (alive) setState(snapshot.updates);
      });
    };
    refresh();
    const unsubscribe = settingsControls.onChanged(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  const action = (callback: () => Promise<UpdateState>) => {
    setError('');
    void callback()
      .then(setState)
      .catch((error) => setError(String(error).replace(/^Error: /, '')));
  };
  return (
    <SettingsSection
      {...settingAnchor('about', 'updateActions')}
      title="まとめて更新"
      hint="更新候補を確認して準備します。最後の確認でキャンセルでき、適用する場合は1回の再起動にまとめます。"
    >
      <div className="settings-actions update-actions">
        <button
          className="update-primary"
          disabled={state.busy}
          onClick={() => action(() => settingsControls.installUpdates('all'))}
        >
          本体と全Appletを更新
        </button>
        <button
          className="text-button"
          disabled={state.busy || appletCount === 0}
          onClick={() => action(() => settingsControls.installUpdates('applets'))}
        >
          Appletを一括更新
        </button>
      </div>
      <div className="update-last-checked">
        <UpdateCheckTime checkedAt={checkedAt} />
      </div>
      <SettingsFeedback error={error} />
    </SettingsSection>
  );
}

export function UpdateSettings({
  settings,
  edit: onChange,
}: {
  settings: Settings;
  edit(next: Settings): void;
}) {
  const settingsControls = useSettingsControls();
  const edit = (change: (next: Settings) => void) => {
    const next = structuredClone(settings);
    change(next);
    onChange(next);
  };
  return (
    <SettingsSection
      title="更新の設定"
      hint="起動時の確認方法と、本体の更新元を変更できます。"
      collapsible
      {...settingAnchor('about', 'updates')}
    >
      <SettingsField
        title="AppDockの更新元"
        hint={hostSettingItem('about', 'hostSource').description}
        {...settingAnchor('about', 'hostSource')}
      >
        <SettingsUrlInput
          aria-label="AppDockの更新元"
          value={settings.updates.hostSource}
          onChange={(event) =>
            edit((next) => {
              next.updates.hostSource = event.target.value;
            })
          }
          placeholder="publishフォルダー / URL / github:owner/repo"
        />
        <button
          className="text-button"
          disabled={settings.updates.hostSource === createDefaultSettings().updates.hostSource}
          onClick={() =>
            edit((next) => {
              next.updates.hostSource = createDefaultSettings().updates.hostSource;
            })
          }
        >
          AppDockの更新元を既定に戻す
        </button>
      </SettingsField>
      {(
        [
          'checkHostOnStartup',
          'checkAppletsOnStartup',
          'notifyOnStartup',
          'allowSameVersion',
        ] as const
      ).map((key) => (
        <SettingsField
          key={key}
          title={hostSettingItem('about', key).title}
          {...settingAnchor('about', key)}
        >
          <Toggle
            label={hostSettingItem('about', key).title}
            checked={settings.updates[key]}
            onChange={(checked) =>
              edit((next) => {
                next.updates[key] = checked;
              })
            }
          />
        </SettingsField>
      ))}
      <SettingsField
        title={hostSettingItem('about', 'startupDelaySeconds').title}
        hint="0〜3,600秒で指定します。"
        {...settingAnchor('about', 'startupDelaySeconds')}
      >
        <SettingsInput
          aria-label="起動から確認までの秒数"
          type="number"
          min={0}
          max={3600}
          value={settings.updates.startupDelaySeconds}
          onChange={(event) =>
            edit((next) => {
              next.updates.startupDelaySeconds = numberInput(event.target.value);
            })
          }
        />
      </SettingsField>
      <p className="muted">
        起動時は更新情報の確認だけを行います。配布ファイルのダウンロードや適用は行いません。同じ版の再適用を許可しても古い版には戻しません。
      </p>
    </SettingsSection>
  );
}

export function AppletUpdateSource({
  extension,
  settings,
  edit,
}: {
  extension: ExtensionSnapshot;
  settings: Settings;
  edit(next: Settings): void;
}) {
  const settingsControls = useSettingsControls();
  const source = settings.extensions[extension.id]?.updateSource;
  const defaultSource = extension.updateRepository ? `github:${extension.updateRepository}` : '';
  const change = (value: string | undefined) => {
    const next = structuredClone(settings);
    const entry = next.extensions[extension.id] ?? { enabled: extension.enabled, settings: {} };
    if (value === undefined) delete entry.updateSource;
    else entry.updateSource = value;
    next.extensions[extension.id] = entry;
    edit(next);
  };
  return (
    <details className="update-disclosure applet-update-source">
      <summary>
        更新元の設定{' '}
        <span className="muted">
          {source === undefined ? '既定' : source === '' ? '無効' : 'カスタム'}
        </span>
      </summary>
      <div className="update-settings-content">
        <label className="update-source">
          <span>{extension.displayName}の更新元</span>
          <SettingsUrlInput
            aria-label={`${extension.displayName}の更新元`}
            value={source ?? defaultSource}
            placeholder="publishフォルダー / URL / github:owner/repo"
            onChange={(event) => change(event.target.value)}
          />
        </label>
        <p className="muted">
          {defaultSource ? `既定: ${defaultSource}` : 'このAppletには既定の更新元がありません。'}{' '}
          空欄を保存すると更新確認を無効にします。
        </p>
        <button
          className="text-button"
          disabled={source === undefined}
          onClick={() => change(undefined)}
        >
          既定に戻す
        </button>
      </div>
    </details>
  );
}

import { useSettingsControls } from './api';
import { useEffect, useState } from 'react';
import type { UpdateResult, UpdateState } from '../../shared/contracts';
export function UpdateCheckTime({ checkedAt }: { checkedAt?: string }) {
  const settingsControls = useSettingsControls();
  return (
    <time dateTime={checkedAt} className="muted">
      最終確認:{' '}
      {checkedAt
        ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(checkedAt),
          )
        : '未確認'}
    </time>
  );
}
const updateError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : '').replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
  return message || '更新を確認できませんでした。通信環境を確認して、もう一度お試しください。';
};

export function useUpdateState() {
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<UpdateState>({ busy: false, phase: '', results: [] });
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
  return state;
}

export function VersionDisplay({ version, result }: { version: string; result?: UpdateResult }) {
  const settingsControls = useSettingsControls();
  const available = result?.status === 'available' && result.currentVersion === version;
  return (
    <span className="version-display">
      <span className="settings-badge version-current">{version}</span>
      {available && result.latestVersion && (
        <span
          className="version-available"
          aria-label={`更新後のバージョン ${result.latestVersion}`}
        >
          <span aria-hidden="true">→</span>
          <span className="settings-badge">{result.latestVersion}</span>
        </span>
      )}
    </span>
  );
}

export function VersionCheck({
  id,
  details = false,
  disabled = false,
  compact = false,
}: {
  id?: string;
  details?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const settingsControls = useSettingsControls();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = useUpdateState();
  const result = state.results.find((result) => result.id === (id ?? 'host'));
  return (
    <span className="version-check">
      <span className="update-check-control">
        <button
          className={compact ? 'text-button' : 'update-primary'}
          disabled={busy || state.busy || disabled}
          title={disabled ? '設定の処理が完了するまでお待ちください。' : undefined}
          onClick={() => {
            setError('');
            setBusy(true);
            void (
              id
                ? settingsControls.installUpdates(id)
                : settingsControls.executeCommand('appdock.updates.installHost')
            )
              .catch((error) => setError(updateError(error)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? '処理中…' : id ? 'このAppletを更新' : 'AppDockを更新'}
        </button>
        {details && <UpdateCheckTime checkedAt={result?.checkedAt} />}
      </span>
      {details && result?.status !== 'current' && (
        <span className="update-result-inline" role="status">
          <span>
            {!result
              ? 'まだ更新を確認していません。'
              : result.status === 'available'
                ? `${result.latestVersion} が公開されています。`
                : result.status === 'unpublished'
                  ? '公開リリースが見つかりません。'
                  : result.status === 'unsupported'
                    ? '更新元が設定されていません。'
                    : result.message}
          </span>
          {result?.status === 'available' && result.releaseUrl && (
            <button
              className="text-button"
              onClick={() => {
                void settingsControls
                  .openReleases(id)
                  .catch((err: Error) => setError(updateError(err)));
              }}
            >
              リリースを開く
            </button>
          )}
        </span>
      )}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

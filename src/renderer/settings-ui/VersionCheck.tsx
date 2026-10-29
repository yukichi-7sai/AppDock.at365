import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from './SettingsButton';
import { SettingsActions, SettingsField } from './SettingsSections';
import { useSettingsFeedback } from './SettingsStatus';
import { useSettingsControls } from './api';
import { useEffect, useState } from 'react';
import type { UpdateResult, UpdateState } from '../../shared/contracts';
export function UpdateCheckTime({ checkedAt }: { checkedAt?: string }) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  return (
    <time dateTime={checkedAt} className="muted">
      {translate('settings.versionCheck.lastChecked')}{' '}
      {checkedAt
        ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(checkedAt),
          )
        : translate('settings.versionCheck.unchecked')}
    </time>
  );
}
export const updateError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : '').replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
  return message || hostText('settings.versionCheck.failed');
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
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const available = result?.status === 'available' && result.currentVersion === version;
  return (
    <span className="version-display">
      <span className="settings-badge version-current">{version}</span>
      {available && result.latestVersion && (
        <span
          className="version-available"
          aria-label={translate('settings.versionCheck.nextVersion', {
            latestVersion: result.latestVersion,
          })}
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
  embedded = false,
  standalone = false,
  disabledReason,
}: {
  id?: string;
  details?: boolean;
  disabled?: boolean;
  compact?: boolean;
  embedded?: boolean;
  standalone?: boolean;
  disabledReason?: string;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = useUpdateState();
  const result = state.results.find((result) => result.id === (id ?? 'host'));
  useSettingsFeedback({ error, busy, target: translate('settings.versionCheck.update') });
  const summary = !result
    ? translate('settings.versionCheck.notChecked')
    : result.status === 'available'
      ? translate('settings.versionCheck.available', {
          latestVersion: String(result.latestVersion),
        })
      : result.status === 'unpublished'
        ? translate('settings.versionCheck.noRelease')
        : result.status === 'unsupported'
          ? translate('settings.versionCheck.noRepository')
          : result.status === 'current'
            ? translate('settings.versionCheck.latest')
            : result.message;
  const content = (
    <>
      <span className="update-check-control">
        <SettingsButton
          pending={!!busy}
          icon={embedded}
          className={embedded ? 'about-host-update' : compact ? 'text-button' : 'update-primary'}
          disabled={busy || state.busy || disabled}
          title={
            disabled ? (disabledReason ?? translate('settings.versionCheck.pending')) : undefined
          }
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
          {id
            ? translate('settings.versionCheck.updateApplet')
            : translate('settings.versionCheck.updateHost')}
        </SettingsButton>
        {details && <UpdateCheckTime checkedAt={result?.checkedAt} />}
      </span>
      {details && result?.status !== 'current' && (
        <>
          {result?.status === 'available' && result.releaseUrl && (
            <button
              className="text-button"
              onClick={() => {
                void settingsControls
                  .openReleases(id)
                  .catch((err: Error) => setError(updateError(err)));
              }}
            >
              {translate('settings.versionCheck.openRelease')}
            </button>
          )}
        </>
      )}
    </>
  );
  return embedded ? (
    <div className="about-update-group">{content}</div>
  ) : standalone ? (
    <SettingsActions>{content}</SettingsActions>
  ) : (
    <SettingsField
      title={translate('settings.versionCheck.update')}
      description={details ? summary : undefined}
    >
      {content}
    </SettingsField>
  );
}

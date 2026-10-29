import { useId, useRef, useState } from 'react';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { Icon } from '../../shared/ui-icons';
import { appletSettingsPageId } from '../../shared/settings-catalog';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from './SettingsButton';
import { SettingsActions, SettingsField, SettingsSection } from './SettingsSections';
import { useSettingsFeedback } from './SettingsStatus';
import { useSettingsControls } from './api';
import { settingAnchor } from './setting-anchor';
import {
  UpdateCheckTime,
  VersionCheck,
  VersionDisplay,
  updateError,
  useUpdateState,
} from './VersionCheck';
import './applet-information.css';
import { SettingsAppIdentity } from './SettingsAppIdentity';

/** Manifest information shared by all installed Applet settings pages. */
export function AppletInformationPanel({
  applet,
  updateSource,
  busy = false,
  headingLevel = 2,
}: {
  applet: ExtensionSnapshot;
  updateSource?: string;
  busy?: boolean;
  headingLevel?: 1 | 2;
}) {
  const { t } = useHostTranslation();
  const headingId = useId();
  const controls = useSettingsControls();
  const updates = useUpdateState();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const result = updates.results.find((row) => row.id === applet.id);
  const source = updateSource ?? applet.updateRepository;
  const description = typeof applet.description === 'string' ? applet.description.trim() : '';
  const checkLabel = t('settings.appletInformation.checkUpdates');
  useSettingsFeedback({ error, busy: checking, target: checkLabel });
  return (
    <article
      className="applet-information"
      aria-labelledby={headingId}
      data-testid="applet-information"
      {...settingAnchor(appletSettingsPageId(applet.id), 'information')}
    >
      <SettingsAppIdentity
        icon={
          <span
            className="about-app-icon applet-identity-icon"
            aria-hidden="true"
            data-testid="applet-identity-icon"
            data-icon={applet.icon ?? 'extensions'}
          >
            <Icon name={applet.icon ?? 'extensions'} size={48} />
          </span>
        }
        name={applet.displayName}
        tagline={applet.tagline?.trim()}
        headingId={headingId}
        headingLevel={headingLevel}
        status={
          <span className="applet-information-state" data-testid="applet-information-state">
            <span className={`state ${applet.state}`}>
              {t(`settings.appletManagementSettings.${applet.state}`)}
            </span>
          </span>
        }
      >
        <VersionDisplay version={applet.version} result={result} />
        <SettingsButton
          icon
          className="about-update-check"
          title={checkLabel}
          aria-label={checkLabel}
          disabled={busy || updates.busy || !source}
          pending={checking}
          onClick={() => {
            if (pending.current) return;
            pending.current = true;
            setError('');
            setChecking(true);
            void controls
              .checkUpdates(applet.id)
              .then((checked) => {
                if (checked.status === 'error')
                  setError(checked.message ?? t('settings.versionCheck.failed'));
              })
              .catch((reason) => setError(updateError(reason)))
              .finally(() => {
                pending.current = false;
                setChecking(false);
              });
          }}
        >
          <Icon name="refresh" size={16} />
        </SettingsButton>
        {source && <UpdateCheckTime checkedAt={result?.checkedAt} />}
      </SettingsAppIdentity>
      {description && (
        <p className="applet-information-description" data-testid="applet-description">
          {description}
        </p>
      )}
      <VersionCheck
        id={applet.id}
        standalone
        disabled={busy || checking || !source}
        disabledReason={!source ? t('settings.versionCheck.noRepository') : undefined}
      />
      <SettingsSection
        variant="row"
        title={t('settings.appletInformation.details')}
        collapsible
        data-testid="applet-information-details"
      >
        <SettingsField title={t('settings.appletInformation.id')} description={applet.id} />
        {applet.minimumHostVersion && (
          <SettingsField
            title={t('settings.appletInformation.minimumHostVersion')}
            description={applet.minimumHostVersion}
          />
        )}
        {applet.updateRepository && (
          <SettingsField
            title={t('settings.appletInformation.repository')}
            description={applet.updateRepository}
          />
        )}
        {result?.releaseUrl && (
          <SettingsActions>
            <SettingsButton
              className="text-button"
              onClick={() => {
                void controls
                  .openReleases(applet.id)
                  .catch((reason) => setError(updateError(reason)));
              }}
            >
              {t('settings.versionCheck.openRelease')}
            </SettingsButton>
          </SettingsActions>
        )}
      </SettingsSection>
    </article>
  );
}

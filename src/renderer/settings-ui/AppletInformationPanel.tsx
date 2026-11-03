import { useId, useRef, useState, type MouseEvent } from 'react';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { Icon } from '../../shared/ui-icons';
import { CommandText } from './CommandText';
import { appletSettingsPageId } from '../../shared/settings-catalog';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from './SettingsButton';
import { SettingsActions } from './SettingsSections';
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
import { SettingsStatistic } from './SettingsStatistic';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import type { AppletPackagePlan } from '../../shared/applet-packages';
import { AppletUninstallDialog, type AppletActionInvoker } from './AppletPackageDialogs';

/** Manifest information shared by all installed Applet settings pages. */
export function AppletInformationPanel({
  applet,
  updateSource,
  busy = false,
  headingLevel = 2,
  management,
  stats,
  invoke,
}: {
  applet: ExtensionSnapshot;
  updateSource?: string;
  busy?: boolean;
  headingLevel?: 1 | 2;
  management: SettingsPageAuxiliary['appletManagement'];
  stats?: SettingsPageAuxiliary['appletStats'];
  invoke: AppletActionInvoker;
}) {
  const { t, language } = useHostTranslation();
  const headingId = useId();
  const controls = useSettingsControls();
  const updates = useUpdateState();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [errorTarget, setErrorTarget] = useState('');
  const pending = useRef(false);
  const openingRepository = useRef(false);
  const removalOpener = useRef<HTMLButtonElement | null>(null);
  type Operation = 'start' | 'stop' | 'restart' | 'uninstall' | 'commands';
  const [operation, setOperation] = useState<Operation>();
  const [removal, setRemoval] = useState<AppletPackagePlan>();
  const changing =
    busy ||
    checking ||
    !!operation ||
    !!management?.busy ||
    updates.busy ||
    ['starting', 'stopping'].includes(applet.state);
  const stop = operation === 'stop' || applet.state === 'running' || applet.state === 'stopping';
  const lifecycleLabel =
    operation === 'start' || applet.state === 'starting'
      ? t('settings.appletInformation.starting')
      : operation === 'stop' || applet.state === 'stopping'
        ? t('settings.appletInformation.stopping')
        : stop
          ? t('settings.appletInformation.stop')
          : applet.state === 'waiting'
            ? t('settings.appletManagementSettings.start')
            : t('settings.appletInformation.start');
  const commandsLabel = t('settings.appletInformation.openCommands');
  const run = async (kind: Operation) => {
    if (pending.current) return;
    pending.current = true;
    setOperation(kind);
    setError('');
    setErrorTarget(
      kind === 'commands'
        ? commandsLabel
        : kind === 'start' || kind === 'stop'
          ? lifecycleLabel
          : t(`settings.appletManagementSettings.${kind}`),
    );
    try {
      if (kind === 'restart') await invoke('manageApplet', [applet.id, 'restart']);
      else if (kind === 'start') await invoke('startAppletNow', [applet.id]);
      else if (kind === 'stop') await invoke('manageApplet', [applet.id, 'disable']);
      else if (kind === 'commands')
        await invoke('openAppletDestination', [applet.id, 'command-triggers']);
      else setRemoval(await invoke('prepareAppletUninstall', [applet.id]));
    } catch (reason) {
      setError(updateError(reason));
    } finally {
      pending.current = false;
      setOperation(undefined);
    }
  };
  const result = updates.results.find((row) => row.id === applet.id);
  const source = updateSource ?? applet.updateRepository;
  const description = typeof applet.description === 'string' ? applet.description.trim() : '';
  const checkLabel = t('settings.appletInformation.checkUpdates');
  const repositoryLabel = t('settings.appletInformation.openRepository');
  const openRepository = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (openingRepository.current) return;
    openingRepository.current = true;
    setError('');
    setErrorTarget(repositoryLabel);
    void invoke('openAppletRepository', [applet.id])
      .catch((reason) => setError(updateError(reason)))
      .finally(() => {
        openingRepository.current = false;
      });
  };
  useSettingsFeedback({ error, busy: checking || !!operation, target: errorTarget || checkLabel });
  return (
    <article
      className="applet-information"
      aria-labelledby={headingId}
      data-testid="applet-information"
      {...settingAnchor(appletSettingsPageId(applet.id), 'information')}
    >
      <div className="applet-information-top">
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
            disabled={changing || !source}
            pending={checking}
            onClick={() => {
              if (pending.current) return;
              pending.current = true;
              setError('');
              setErrorTarget(checkLabel);
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
        <SettingsStatistic
          label={t('settings.aboutSettings.commands')}
          count={stats?.commandCount}
          detail={t('settings.aboutSettings.available', {
            count: stats
              ? new Intl.NumberFormat(language).format(stats.availableCommandCount)
              : '—',
          })}
          testId="applet-command-count"
          title={commandsLabel}
          onClick={() => void run('commands')}
        />
      </div>
      {description && (
        <p className="applet-information-description" data-testid="applet-description">
          <CommandText text={description} />
        </p>
      )}
      <div className="applet-information-details" data-testid="applet-information-details">
        <dl className="applet-information-metadata">
          <div>
            <dt>{t('settings.appletInformation.id')}</dt>
            <dd>{applet.id}</dd>
          </div>
          {applet.minimumHostVersion && (
            <div>
              <dt>{t('settings.appletInformation.minimumHostVersion')}</dt>
              <dd>{applet.minimumHostVersion}</dd>
            </div>
          )}
          {applet.updateRepository && (
            <div>
              <dt>{t('settings.appletInformation.repository')}</dt>
              <dd>
                <a
                  className="applet-information-repository"
                  href={`https://github.com/${applet.updateRepository}`}
                  title={repositoryLabel}
                  onClick={openRepository}
                  onAuxClick={(event) => {
                    if (event.button === 1) openRepository(event);
                  }}
                >
                  <span>{applet.updateRepository}</span>
                  <Icon name="external-link" size={13} />
                </a>
              </dd>
            </div>
          )}
        </dl>
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
      </div>
      <SettingsActions className="applet-information-actions">
        <VersionCheck
          id={applet.id}
          inline
          disabled={changing || !source}
          disabledReason={!source ? t('settings.versionCheck.noRepository') : undefined}
        />
        <SettingsButton
          data-testid="applet-lifecycle"
          title={t(
            stop ? 'settings.appletInformation.stopHint' : 'settings.appletInformation.startHint',
          )}
          disabled={changing}
          pending={operation === 'start' || operation === 'stop'}
          onClick={() => void run(stop ? 'stop' : 'start')}
        >
          <Icon name={stop ? 'square' : 'play'} size={16} />
          {lifecycleLabel}
        </SettingsButton>
        <SettingsButton
          disabled={changing || !applet.enabled}
          pending={operation === 'restart'}
          onClick={() => void run('restart')}
        >
          <Icon name="power" size={16} />
          {t('settings.appletManagementSettings.restart')}
        </SettingsButton>
        <SettingsButton
          className="applet-information-uninstall"
          title={
            !management?.mutableIds.includes(applet.id)
              ? t('settings.appletManagementSettings.fileOperationsUnavailable')
              : undefined
          }
          disabled={changing || !management?.mutableIds.includes(applet.id)}
          pending={operation === 'uninstall'}
          onClick={(event) => {
            removalOpener.current = event.currentTarget;
            void run('uninstall');
          }}
        >
          <Icon name="trash" size={16} />
          {t('settings.appletManagementSettings.uninstall')}
        </SettingsButton>
      </SettingsActions>
      {removal && (
        <AppletUninstallDialog
          plan={removal}
          invoke={invoke}
          returnFocus={removalOpener.current}
          onClose={() => setRemoval(undefined)}
        />
      )}
    </article>
  );
}

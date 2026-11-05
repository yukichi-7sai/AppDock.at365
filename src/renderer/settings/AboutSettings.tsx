import { useEffect, useId, useRef, useState } from 'react';
import appIcon from '../../../assets/icon.svg';
import { useHostTranslation } from '../HostTranslation';
import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { settingAnchor } from '../settings-ui/setting-anchor';
import {
  VersionCheck,
  VersionDisplay,
  UpdateCheckTime,
  useUpdateState,
  updateError,
} from '../settings-ui/VersionCheck';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { useSettingsControls } from '../settings-ui/api';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { UpdateActions, UpdateSettings } from './UpdateSettings';
import { Icon } from '../../shared/ui-icons';
import './about.css';
import { AboutSystemSettings } from './AboutSystemSettings';
import { HostStartupTimingPanel } from './HostStartupTimingPanel';
import { SettingsAppIdentity } from '../settings-ui/SettingsAppIdentity';
import { SettingsStatistic } from '../settings-ui/SettingsStatistic';

export function AboutInformationPanel({
  settings,
  extensions,
  runtime,
  stats,
  version,
  busy,
  openApplets,
  openCommands,
}: {
  settings: Settings;
  extensions: ExtensionSnapshot[];
  runtime: NonNullable<SettingsPageAuxiliary['runtime']>;
  stats?: SettingsPageAuxiliary['aboutStats'];
  version: string;
  busy: boolean;
  openApplets(): void;
  openCommands(): void;
}) {
  const { t: translate, language } = useHostTranslation();
  const headingId = useId();
  const updates = useUpdateState();
  const controls = useSettingsControls();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<'restart' | 'quit'>();
  const pending = useRef(false);
  const changing = busy || checking || updates.busy || !!operation;
  const hostUpdate = updates.results.find((result) => result.id === 'host');
  const checkLabel = translate('settings.aboutSettings.checkUpdates');
  const [errorTarget, setErrorTarget] = useState('');
  useSettingsFeedback({ error, busy: checking || !!operation, target: errorTarget || checkLabel });
  const run = async (kind: 'restart' | 'quit') => {
    if (pending.current || changing) return;
    pending.current = true;
    setOperation(kind);
    setError('');
    setErrorTarget(translate(`settings.aboutSettings.${kind}`));
    try {
      await controls.executeCommand(`appdock.${kind}`);
      // Keep actions disabled after acceptance until the host has finished shutting down.
    } catch (reason) {
      setError(updateError(reason));
      pending.current = false;
      setOperation(undefined);
    }
  };
  const autoCheckedOnOpen = useRef(false);
  useEffect(() => {
    if (autoCheckedOnOpen.current || !controls.checkHostOnAboutOpen) return;
    autoCheckedOnOpen.current = true;
    if (!settings.updates.checkHostOnAboutOpen) return;
    let active = true;
    void controls.checkHostOnAboutOpen().catch((reason) => {
      if (active) setError(updateError(reason));
    });
    return () => {
      active = false;
    };
  }, [controls, settings.updates.checkHostOnAboutOpen]);
  const applets = extensions.filter((extension) => !extension.collection);
  const running = applets.filter((extension) => extension.state === 'running').length;
  const count = (value?: number) =>
    value === undefined ? '—' : new Intl.NumberFormat(language).format(value);
  return (
    <article className="about-overview" aria-labelledby={headingId} data-testid="about-overview">
      <div className="about-overview-top" {...settingAnchor('about', 'versions')}>
        <SettingsAppIdentity
          icon={<img className="about-app-icon" src={appIcon} alt="" width="80" height="80" />}
          name="AppDock.at365"
          tagline={translate('settings.aboutSettings.intro')}
          headingId={headingId}
          headingLevel={1}
          versionTestId="about-version"
        >
          <VersionDisplay version={version} result={hostUpdate} />
          <SettingsButton
            icon
            className="about-update-check"
            title={checkLabel}
            aria-label={checkLabel}
            pending={checking}
            disabled={changing}
            onClick={() => {
              setError('');
              setErrorTarget(checkLabel);
              setChecking(true);
              void controls
                .checkUpdates()
                .catch((reason) => setError(updateError(reason)))
                .finally(() => setChecking(false));
            }}
          >
            <Icon name="refresh" size={16} />
          </SettingsButton>
          <UpdateCheckTime checkedAt={hostUpdate?.checkedAt} />
        </SettingsAppIdentity>
        <div className="about-statistics">
          <SettingsStatistic
            label="Applet"
            count={applets.length}
            detail={translate('settings.aboutSettings.running', { count: count(running) })}
            testId="about-applet-count"
            title={translate('settings.aboutSettings.applets')}
            onClick={openApplets}
          />
          <SettingsStatistic
            label={translate('settings.aboutSettings.commands')}
            count={stats?.commandCount}
            detail={translate('settings.aboutSettings.available', {
              count: count(stats?.availableCommandCount),
            })}
            testId="about-command-count"
            title={translate('settings.aboutSettings.openCommands')}
            onClick={openCommands}
          />
        </div>
      </div>
      <div className="about-environment" {...settingAnchor('about', 'runtime')}>
        <dl className="about-runtime">
          {Object.entries({
            OS: `${runtime.platform === 'win32' ? 'Windows' : runtime.platform} / ${runtime.arch}`,
            Electron: runtime.electron,
            Chromium: runtime.chrome,
            'Node.js': runtime.node,
          }).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="about-actions">
        <div className="about-update-buttons">
          <UpdateActions appletCount={applets.length} disabled={changing} embedded />
          <VersionCheck disabled={changing} embedded />
          <SettingsButton
            icon
            data-testid="about-restart"
            title={translate('settings.aboutSettings.restartHint')}
            disabled={changing}
            pending={operation === 'restart'}
            onClick={() => void run('restart')}
          >
            <Icon name="power" size={16} />
            {translate('settings.aboutSettings.restart')}
          </SettingsButton>
        </div>
        <SettingsButton
          icon
          className="about-quit"
          data-testid="about-quit"
          title={translate('settings.aboutSettings.quitHint')}
          disabled={changing}
          pending={operation === 'quit'}
          onClick={() => void run('quit')}
        >
          <Icon name="square" size={16} />
          {translate('settings.aboutSettings.quit')}
        </SettingsButton>
      </div>
    </article>
  );
}

export function AboutSettings({
  settings,
  edit,
  auxiliary,
  busy,
  invoke,
}: {
  settings: Settings;
  edit(value: Settings): void;
  auxiliary: SettingsPageAuxiliary;
  busy: boolean;
  invoke(name: string, args?: unknown[]): Promise<unknown>;
}) {
  const { t } = useHostTranslation();
  return (
    <section
      className="settings-sections about-page"
      aria-label={t('settings.aboutSettings.title')}
    >
      <AboutSystemSettings
        settings={settings}
        edit={edit}
        auxiliary={auxiliary}
        busy={busy}
        invoke={invoke}
      />
      <UpdateSettings settings={settings} edit={edit} />
      <HostStartupTimingPanel timing={auxiliary.hostStartupTiming} />
    </section>
  );
}

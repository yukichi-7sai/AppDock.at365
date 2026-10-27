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
import { HostStartupTimingPanel } from './HostStartupTimingPanel';

export function AboutSettings({
  settings,
  edit,
  extensions,
  runtime,
  stats,
  startupTiming,
  version,
  busy,
  openApplets,
}: {
  settings: Settings;
  edit(value: Settings): void;
  extensions: ExtensionSnapshot[];
  runtime: NonNullable<SettingsPageAuxiliary['runtime']>;
  stats?: SettingsPageAuxiliary['aboutStats'];
  startupTiming?: SettingsPageAuxiliary['hostStartupTiming'];
  version: string;
  busy: boolean;
  openApplets(): void;
}) {
  const { t: translate, language } = useHostTranslation();
  const headingId = useId();
  const appletCountId = useId();
  const updates = useUpdateState();
  const controls = useSettingsControls();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const hostUpdate = updates.results.find((result) => result.id === 'host');
  const checkLabel = translate('settings.aboutSettings.checkUpdates');
  useSettingsFeedback({ error, busy: checking, target: checkLabel });
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
    <section
      className="settings-sections about-page"
      aria-label={translate('settings.aboutSettings.title')}
    >
      <article className="about-overview" aria-labelledby={headingId} data-testid="about-overview">
        <div className="about-overview-top" {...settingAnchor('about', 'versions')}>
          <div className="about-identity">
            <img className="about-app-icon" src={appIcon} alt="" width="80" height="80" />
            <div className="about-identity-copy">
              <p className="about-welcome">{translate('settings.aboutSettings.intro')}</p>
              <h2 id={headingId}>AppDock.at365</h2>
              <div className="about-version" data-testid="about-version">
                <VersionDisplay version={version} result={hostUpdate} />
                <SettingsButton
                  icon
                  className="about-update-check"
                  title={checkLabel}
                  aria-label={checkLabel}
                  pending={checking}
                  disabled={busy || updates.busy}
                  onClick={() => {
                    setError('');
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
              </div>
            </div>
          </div>
          <div className="about-statistics">
            <button
              type="button"
              className="about-applet-link"
              aria-label={translate('settings.aboutSettings.applets')}
              aria-describedby={appletCountId}
              onClick={openApplets}
            >
              <span className="about-statistic-label">Applet</span>
              <span
                id={appletCountId}
                className="about-statistic-count"
                data-testid="about-applet-count"
              >
                {count(applets.length)}
              </span>
              <small>
                {translate('settings.aboutSettings.running', { count: count(running) })}
              </small>
            </button>
            <div className="about-statistic">
              <span className="about-statistic-label">
                {translate('settings.aboutSettings.commands')}
              </span>
              <span className="about-statistic-count" data-testid="about-command-count">
                {count(stats?.commandCount)}
              </span>
              <small>
                {translate('settings.aboutSettings.available', {
                  count: count(stats?.availableCommandCount),
                })}
              </small>
            </div>
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
        <div className="about-update-buttons">
          <UpdateActions appletCount={applets.length} embedded />
          <VersionCheck disabled={busy || checking} embedded />
        </div>
      </article>
      <HostStartupTimingPanel timing={startupTiming} />
      <UpdateSettings settings={settings} edit={edit} />
    </section>
  );
}

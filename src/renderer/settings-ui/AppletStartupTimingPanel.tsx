import { useId } from 'react';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { appletSettingsPageId } from '../../shared/settings-catalog';
import { useHostTranslation } from '../HostTranslation';
import { SettingsContent, SettingsSection } from './SettingsSections';
import { SettingsTextarea } from './SettingsInput';
import { settingAnchor } from './setting-anchor';
import './startup-timing.css';

const phaseLabels = {
  prepare: 'settings.appletManagementSettings.startupPrepare',
  process: 'settings.appletManagementSettings.startupProcess',
  activate: 'settings.appletManagementSettings.startupActivate',
  validate: 'settings.appletManagementSettings.startupValidate',
} as const;

export function AppletStartupTimingPanel({ applet }: { applet: ExtensionSnapshot }) {
  const { t, language } = useHostTranslation();
  const dataId = useId();
  const timing = applet.startupTiming;
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const ms = (value: number) => `${number.format(value)} ms`;
  return (
    <SettingsSection
      title={t('settings.appletStartup.title')}
      hint={t('settings.appletManagementSettings.startupTimeHint')}
      data-testid="applet-startup-timing"
      {...settingAnchor(appletSettingsPageId(applet.id), 'startupTiming')}
      collapsible
    >
      {!timing ? (
        <p data-testid="applet-startup-state">
          {t(
            applet.state === 'starting'
              ? 'settings.appletManagementSettings.measuring'
              : 'settings.appletStartup.unmeasured',
          )}
        </p>
      ) : (
        <>
          <SettingsContent>
            <dl className="about-startup-summary">
              <div>
                <dt>{t('settings.appletStartup.total')}</dt>
                <dd data-testid="applet-startup-duration">{ms(timing.durationMs)}</dd>
              </div>
            </dl>
            <p data-testid="applet-startup-state">
              {t(
                timing.outcome === 'error'
                  ? 'settings.appletManagementSettings.startupPartial'
                  : 'settings.appletStartup.complete',
              )}
            </p>
            {!!timing.phases?.length && (
              <>
                <p className="about-startup-note">
                  {t('settings.appletManagementSettings.startupActivateHint')}
                </p>
                <div className="about-startup-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('settings.startup.phase')}</th>
                        <th>{t('settings.startup.duration')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timing.phases.map((row) => (
                        <tr key={row.phase}>
                          <td>{t(phaseLabels[row.phase])}</td>
                          <td>{ms(row.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SettingsContent>
          <SettingsSection variant="row" title={t('settings.startup.data')} collapsible>
            <SettingsContent className="about-startup-data">
              <label htmlFor={dataId}>{t('settings.startup.dataDescription')}</label>
              <SettingsTextarea
                id={dataId}
                value={JSON.stringify(timing, null, 2)}
                readOnly
                rows={10}
                spellCheck={false}
                data-testid="applet-startup-json"
              />
            </SettingsContent>
          </SettingsSection>
        </>
      )}
    </SettingsSection>
  );
}

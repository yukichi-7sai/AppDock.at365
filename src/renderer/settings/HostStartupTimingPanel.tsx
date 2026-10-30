import { useId } from 'react';
import type { HostStartupTiming } from '../../shared/host-startup-timing';
import { hostStartupCounts } from '../../shared/host-startup-timing';
import { useHostTranslation } from '../HostTranslation';
import { SettingsContent, SettingsSection } from '../settings-ui/SettingsSections';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import '../settings-ui/startup-timing.css';

export function HostStartupTimingPanel({ timing }: { timing?: HostStartupTiming }) {
  const { t, language } = useHostTranslation();
  const dataId = useId();
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const ms = (value?: number) => (value === undefined ? '—' : `${number.format(value)} ms`);
  return (
    <SettingsSection
      title={t('settings.startup.title')}
      hint={t('settings.startup.description')}
      data-testid="host-startup-timing"
      collapsible
    >
      {!timing ? (
        <p>{t('settings.startup.unavailable')}</p>
      ) : (
        <>
          <SettingsContent>
            <dl className="about-startup-summary">
              <div>
                <dt>{t('settings.startup.shown')}</dt>
                <dd data-testid="host-startup-shown">{ms(timing.milestones.shown)}</dd>
              </div>
              <div>
                <dt>{t('settings.startup.ready')}</dt>
                <dd data-testid="host-startup-ready">{ms(timing.milestones.ready)}</dd>
              </div>
              <div>
                <dt>{t('settings.startup.finished')}</dt>
                <dd>{ms(timing.elapsedMs)}</dd>
              </div>
              <div>
                <dt>{t('settings.startup.processEntry')}</dt>
                <dd>{ms(timing.processEntryMs)}</dd>
              </div>
            </dl>
            <p data-testid="host-startup-state">
              {t(timing.complete ? 'settings.startup.complete' : 'settings.startup.recording')}
            </p>
            <p className="about-startup-note">{t('settings.startup.overlap')}</p>
            <div className="about-startup-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('settings.startup.phase')}</th>
                    <th>{t('settings.startup.start')}</th>
                    <th>{t('settings.startup.duration')}</th>
                    <th>{t('settings.startup.state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {timing.phases.map((row) => (
                    <tr key={row.id} data-startup-phase={row.id}>
                      <td>{t(`settings.startup.phase.${row.id}`)}</td>
                      <td>{ms(row.startMs)}</td>
                      <td>{ms(row.durationMs)}</td>
                      <td>{t(`settings.startup.state.${row.state}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="about-startup-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('settings.startup.work')}</th>
                    <th>{t('settings.startup.calls')}</th>
                    <th>{t('settings.startup.total')}</th>
                    <th>{t('settings.startup.max')}</th>
                  </tr>
                </thead>
                <tbody>
                  {timing.work.map((row) => (
                    <tr key={row.id} data-startup-work={row.id}>
                      <td>{t(`settings.startup.work.${row.id}`)}</td>
                      <td>{number.format(row.calls)}</td>
                      <td>{ms(row.totalMs)}</td>
                      <td>{ms(row.maxMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="about-startup-counts">
              {hostStartupCounts.map((id) => (
                <div key={id}>
                  <dt>{t(`settings.startup.count.${id}`)}</dt>
                  <dd data-startup-count={id}>
                    {timing.counts[id] === undefined
                      ? '—'
                      : `${number.format(timing.counts[id]!)}${id.endsWith('Bytes') ? ' B' : ''}`}
                  </dd>
                </div>
              ))}
            </dl>
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
                data-testid="host-startup-json"
              />
            </SettingsContent>
          </SettingsSection>
        </>
      )}
    </SettingsSection>
  );
}

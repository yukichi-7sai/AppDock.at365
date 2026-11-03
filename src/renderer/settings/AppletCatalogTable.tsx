import { useEffect, useState } from 'react';
import type {
  AppletCatalogEntry,
  CatalogEdition,
  CatalogRelease,
} from '../../shared/applet-catalog';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { useHostTranslation } from '../HostTranslation';
import { SettingsListLayout } from '../settings-ui/SettingsListTable';
import { SettingsTableEmptyRow } from '../settings-ui/SettingsTable';
import { SettingsDescriptionIcon } from '../settings-ui/SettingsHintIcon';
import { VersionDisplay } from '../settings-ui/VersionCheck';
import type { AppletActionInvoker } from '../settings-ui/AppletPackageDialogs';

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short' });

function Edition({ value }: { value: CatalogEdition | 'unpublished' | 'error' }) {
  const { t } = useHostTranslation();
  if (typeof value === 'string')
    return (
      <span className="muted">
        {t(
          value === 'error'
            ? 'settings.appletCatalog.failed'
            : 'settings.appletCatalog.unpublished',
        )}
      </span>
    );
  return (
    <>
      <VersionDisplay version={value.version} />
      <time className="muted" dateTime={value.date}>
        {dateFormat.format(new Date(value.date))}
      </time>
    </>
  );
}

export function AppletCatalogTable({
  applets,
  query,
  disabled,
  invoke,
  onInstall,
}: {
  applets: ExtensionSnapshot[];
  query: string;
  disabled: boolean;
  invoke: AppletActionInvoker;
  onInstall(release: CatalogRelease): void;
}) {
  const { t } = useHostTranslation();
  const [entries, setEntries] = useState<AppletCatalogEntry[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void invoke('listAppletCatalog')
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, invoke]);
  const installed = new Set(applets.map((applet) => applet.id));
  const hasUnresolved = entries.some(
    ({ release, development }) => typeof release !== 'object' && typeof development !== 'object',
  );
  const candidates = entries.filter(
    ({ release, development }) =>
      (typeof release === 'object' || typeof development === 'object') &&
      !(typeof release === 'object' && installed.has(release.id)) &&
      !(typeof development === 'object' && installed.has(development.id)),
  );
  const retry =
    failed ||
    hasUnresolved ||
    candidates.some(
      ({ release, development }) =>
        release === 'error' ||
        development === 'error' ||
        (typeof release === 'object' && release.unavailable === 'package'),
    );
  const search = query.toLocaleLowerCase();
  const visible = candidates.filter(({ repository, release, development }) => {
    const info = typeof release === 'object' ? release : development;
    return [
      repository,
      ...(typeof info === 'object'
        ? [info.displayName, info.id, info.description, info.tagline]
        : []),
    ].some((text) => text?.toLocaleLowerCase().includes(search));
  });
  return (
    <section className="applet-catalog">
      <h3>{t('settings.appletCatalog.title')}</h3>
      <SettingsListLayout
        title={t('settings.appletCatalog.title')}
        toolbar={null}
        tableClassName="settings-list-table applet-catalog-table"
        actionsAlign="start"
      >
        <thead>
          <tr>
            <th>{t('settings.appletManagementSettings.name')}</th>
            <th>{t('settings.appletCatalog.release')}</th>
            <th title={t('settings.appletCatalog.developmentHint')}>
              {t('settings.appletCatalog.development')}
            </th>
            <th>{t('settings.appletManagementSettings.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ repository, release, development }) => {
            const info = typeof release === 'object' ? release : development;
            const hasInfo = typeof info === 'object';
            const available = typeof release === 'object' && !release.unavailable;
            return (
              <tr key={repository} data-catalog-repository={repository}>
                <td>
                  <span className="settings-title-with-hint">
                    <strong className="applet-management-name">
                      {hasInfo ? info.displayName : repository}
                    </strong>
                    {hasInfo && (
                      <SettingsDescriptionIcon
                        title={info.displayName}
                        description={info.description ?? info.tagline}
                      />
                    )}
                  </span>
                  {hasInfo && <small>{info.id}</small>}
                </td>
                <td>
                  <Edition value={release} />
                </td>
                <td>
                  <Edition value={development} />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-button applet-update-install"
                    disabled={disabled || !available}
                    onClick={() => {
                      if (available) onInstall(release);
                    }}
                  >
                    {t('settings.appletCatalog.install')}
                  </button>
                  {typeof release === 'object' && release.unavailable && (
                    <small>
                      {t(
                        release.unavailable === 'host'
                          ? 'settings.appletCatalog.needsHost'
                          : 'settings.appletCatalog.packageUnavailable',
                      )}
                    </small>
                  )}
                </td>
              </tr>
            );
          })}
          {!visible.length && (
            <SettingsTableEmptyRow
              colSpan={4}
              title={t(
                loading
                  ? 'settings.appletCatalog.loading'
                  : failed || (hasUnresolved && !candidates.length)
                    ? 'settings.appletCatalog.failed'
                    : candidates.length
                      ? 'settings.appletManagementSettings.noMatches'
                      : 'settings.appletCatalog.empty',
              )}
            />
          )}
        </tbody>
      </SettingsListLayout>
      {retry && (
        <button
          type="button"
          className="text-button"
          disabled={loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t('settings.appletCatalog.retry')}
        </button>
      )}
    </section>
  );
}

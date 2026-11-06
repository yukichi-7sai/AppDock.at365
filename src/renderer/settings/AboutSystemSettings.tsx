import { useHostTranslation } from '../HostTranslation';
import type { Settings } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { SettingsInput, numberInput } from '../settings-ui/SettingsInput';
import { Toggle } from '../settings-ui/Toggle';
import { SettingRow } from './SettingRow';

export function AboutSystemSettings({
  settings,
  edit,
  auxiliary: aux,
  busy,
  invoke,
}: {
  settings: Settings;
  edit(value: Settings): void;
  auxiliary: SettingsPageAuxiliary;
  busy: boolean;
  invoke(name: string, args?: unknown[]): Promise<unknown>;
}) {
  const { t, language } = useHostTranslation();
  const category = 'about';
  const launch = aux.launch!;
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      /* The page controller publishes operation errors. */
    }
  };
  return (
    <>
      <SettingsSection
        title={t('general.startup.section')}
        data-testid="about-startup-settings"
        description={
          launch.supported
            ? t('general.launch.status', {
                privilege: launch.elevated
                  ? t('general.launch.elevated')
                  : t('general.launch.normal'),
                registration: launch.registered
                  ? launch.taskElevated
                    ? t('general.launch.registeredElevated')
                    : t('general.launch.registeredNormal')
                  : t('general.launch.notRegistered'),
              })
            : t('general.launch.unsupported')
        }
        hint={t('general.startup.hint')}
      >
        <SettingRow pageId={category} itemKey="startAtLogon">
          <Toggle
            label={t('general.startAtLogon.label')}
            checked={settings.host.startAtLogon}
            disabled={!launch.supported}
            onChange={(v) => edit({ ...settings, host: { ...settings.host, startAtLogon: v } })}
          />
        </SettingRow>
        <SettingRow pageId={category} itemKey="runAsAdministrator">
          <Toggle
            label={t('general.runAsAdministrator.label')}
            checked={settings.host.runAsAdministrator}
            disabled={!launch.supported}
            onChange={(v) =>
              edit({ ...settings, host: { ...settings.host, runAsAdministrator: v } })
            }
          />
        </SettingRow>
        <SettingRow pageId={category} itemKey="hardwareAcceleration">
          <Toggle
            label={hostSettingItem(category, 'hardwareAcceleration', language).title}
            checked={settings.host.hardwareAcceleration}
            onChange={(hardwareAcceleration) =>
              edit({ ...settings, host: { ...settings.host, hardwareAcceleration } })
            }
          />
        </SettingRow>
        <SettingRow pageId={category} itemKey="launch" error={launch.error}>
          <SettingsActions>
            <button
              disabled={!launch.supported || busy}
              onClick={() => void run(() => invoke('refreshLaunchState'))}
            >
              {t('general.launch.refresh')}
            </button>
            <button
              disabled={!launch.supported || launch.elevated || busy}
              onClick={() => void run(() => invoke('restartAsAdministrator'))}
            >
              {t('general.launch.restartElevated')}
            </button>
          </SettingsActions>
        </SettingRow>
      </SettingsSection>
      <SettingsSection
        title={t('general.files.title')}
        {...settingAnchor(category, 'settingsFile')}
        hint={t('general.files.hint')}
        error={[...new Set(aux.settingsHealth?.errors)].join('\n')}
        description={[
          !aux.settingsHealth?.errors.length && !aux.settingsHealth?.restartRequired
            ? t('general.files.healthy')
            : '',
          aux.settingsHealth?.recovered ? t('general.files.recovered') : '',
          ...(aux.settingsHealth?.reasons ?? []),
          aux.settingsHealth?.errors.length ? t('general.files.restartAdvice') : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {aux.settingsFiles?.map((file) => (
          <SettingsField
            key={file.scope}
            title={
              file.scope === 'local'
                ? t('settings.storage.local')
                : file.scope === 'device'
                  ? t('general.files.device')
                  : t('general.files.shared')
            }
            description={
              <>
                <code>{file.path}</code> —{' '}
                {file.recovered ? t('general.files.continuing') : t('general.files.normal')}
              </>
            }
          >
            {file.canRestore && (
              <button
                disabled={busy || aux.settingsHealth?.busy}
                onClick={() => void run(() => invoke('restoreScopedSettings', [file.scope]))}
              >
                {t('general.files.restoreOne')}
              </button>
            )}
          </SettingsField>
        ))}
        <SettingsActions>
          <button
            disabled={busy || aux.settingsHealth?.busy}
            onClick={() => void run(() => invoke('restart'))}
          >
            {t('general.files.restart')}
          </button>
          <button
            disabled={busy || aux.settingsHealth?.busy || !aux.settingsHealth?.canRestore}
            onClick={() => void run(() => invoke('restoreSettingsBackup'))}
          >
            {t('general.files.restore')}
          </button>
          <button onClick={() => void run(() => invoke('openSettingsDirectory'))}>
            {t('general.files.open')}
          </button>
          {aux.settingsHealth?.launchRecovery && (
            <button disabled={busy} onClick={() => void run(() => invoke('recoverLaunchSettings'))}>
              {t('general.files.recoverLaunch')}
            </button>
          )}
        </SettingsActions>
      </SettingsSection>
    </>
  );
}

export function AboutAdvancedSettings({
  settings,
  edit,
  busy,
}: {
  settings: Settings;
  edit(value: Settings): void;
  busy: boolean;
}) {
  const { t } = useHostTranslation();
  const category = 'about';
  return (
    <SettingsSection title={t('about.advanced.section')} data-testid="file-watch-settings">
      <SettingRow pageId={category} itemKey="fileWatchAssistanceEnabled">
        <Toggle
          label={t('general.fileWatch.enabled')}
          checked={settings.host.fileWatchAssistanceEnabled}
          onChange={(checked) =>
            edit({
              ...settings,
              host: { ...settings.host, fileWatchAssistanceEnabled: checked },
            })
          }
        />
      </SettingRow>
      <SettingRow pageId={category} itemKey="fileWatchAssistanceIntervalSeconds">
        <SettingsInput
          aria-label={t('general.fileWatch.interval')}
          type="number"
          min={2}
          step="any"
          disabled={busy || !settings.host.fileWatchAssistanceEnabled}
          value={settings.host.fileWatchAssistanceIntervalSeconds}
          onChange={(event) =>
            edit({
              ...settings,
              host: {
                ...settings.host,
                fileWatchAssistanceIntervalSeconds: numberInput(event.target.value),
              },
            })
          }
        />
      </SettingRow>
    </SettingsSection>
  );
}

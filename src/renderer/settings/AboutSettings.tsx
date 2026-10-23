import { useHostTranslation } from '../HostTranslation';
import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import { VersionCheck, VersionDisplay, useUpdateState } from '../settings-ui/VersionCheck';
import { UpdateActions, UpdateSettings, AppletUpdateSource } from './UpdateSettings';

export function AboutSettings({
  settings,
  edit,
  extensions,
  runtime,
  version,
  busy,
  openApplets,
}: {
  settings: Settings;
  edit(value: Settings): void;
  extensions: ExtensionSnapshot[];
  runtime: NonNullable<SettingsPageAuxiliary['runtime']>;
  version: string;
  busy: boolean;
  openApplets(): void;
}) {
  const { t: translate } = useHostTranslation();
  const updates = useUpdateState();
  const applets = extensions.filter((extension) => !extension.collection);
  return (
    <section
      className="settings-sections about-page"
      aria-label={translate('settings.aboutSettings.title')}
    >
      <UpdateActions appletCount={applets.length} />
      <SettingsSection
        title="AppDock.at365"
        description={translate('settings.aboutSettings.hostHint')}
        {...settingAnchor('about', 'versions')}
      >
        <SettingsField title={translate('settings.aboutSettings.currentVersion')}>
          <VersionDisplay
            version={version}
            result={updates.results.find((result) => result.id === 'host')}
          />
        </SettingsField>
        <VersionCheck details disabled={busy} />
      </SettingsSection>
      <button className="text-button" onClick={openApplets}>
        {translate('settings.aboutSettings.applets')}
      </button>
      <UpdateSettings settings={settings} edit={edit} />
      <SettingsSection
        title={translate('settings.aboutSettings.environment')}
        hint={translate('settings.aboutSettings.environmentHint')}
        collapsible
        {...settingAnchor('about', 'runtime')}
      >
        <>
          {Object.entries({
            Electron: runtime.electron,
            Chromium: runtime.chrome,
            'Node.js': runtime.node,
            OS: `${runtime.platform} / ${runtime.arch}`,
          }).map(([name, value]) => (
            <SettingsField key={name} title={name} description={value} />
          ))}
        </>
      </SettingsSection>
    </section>
  );
}

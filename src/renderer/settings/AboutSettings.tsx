import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsSection } from '../settings-ui/SettingsSections';
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
  const updates = useUpdateState();
  const applets = extensions.filter((extension) => !extension.collection);
  return (
    <section className="settings-sections about-page" aria-label="バージョン情報・更新">
      <UpdateActions appletCount={applets.length} />
      <SettingsSection
        title="AppDock.at365"
        description="このPCで使用している本体です。"
        {...settingAnchor('about', 'versions')}
      >
        <div className="about-installed-version">
          <span>現在のバージョン</span>
          <VersionDisplay
            version={version}
            result={updates.results.find((result) => result.id === 'host')}
          />
        </div>
        <VersionCheck details disabled={busy} />
      </SettingsSection>
      <button className="text-button" onClick={openApplets}>
        Appletの管理と更新
      </button>
      <UpdateSettings settings={settings} edit={edit} />
      <SettingsSection
        title="実行環境の詳細"
        hint="動作環境の確認や、不具合の調査に使う情報です。"
        collapsible
        {...settingAnchor('about', 'runtime')}
      >
        <dl className="settings-status-grid">
          {Object.entries({
            Electron: runtime.electron,
            Chromium: runtime.chrome,
            'Node.js': runtime.node,
            OS: `${runtime.platform} / ${runtime.arch}`,
          }).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </section>
  );
}

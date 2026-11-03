import { createRoot } from 'react-dom/client';
import { AppletManagementSettings } from '../../../src/renderer/settings/AppletManagementSettings';
import { SettingsControlsProvider } from '../../../src/renderer/settings-ui/api';
import { SettingsHintsContext } from '../../../src/renderer/settings-ui/SettingsHints';
import '../../../src/renderer/settings-ui/controls.css';
import '../../../src/renderer/settings/settings.css';

const fixture = window as any;
fixture.installCalls = [];
fixture.installFailure = '配布元のURLまたはフォルダーを入力してください。';
fixture.installDelay = false;
fixture.applyFailure = '';
let catalogReads = 0;
const invoke = async (name: string, args: unknown[] = []) => {
  fixture.installCalls.push({ name, args });
  if (name === 'readAppletCatalog')
    return {
      entries: [
        {
          repository: 'owner/Fixture',
          development: 'error',
          release: {
            id: 'fixture.install',
            displayName: 'Fixture',
            version: '0.9.0',
            date: '2025-01-01T00:00:00Z',
            source: 'https://github.com/owner/Fixture/releases/tag/v0.9.0',
          },
        },
      ],
      needsRefresh: true,
    };
  if (name === 'listAppletCatalog') {
    if (!catalogReads)
      await new Promise<void>((resolve) => {
        fixture.finishCatalogRefresh = resolve;
      });
    const release = {
      id: 'fixture.install',
      displayName: 'Fixture',
      version: '1.0.0',
      date: '2026-05-01T00:00:00Z',
      source: 'https://github.com/owner/Fixture/releases/tag/v1.0.0',
      description: '公開版の概要',
    };
    return [
      ...(++catalogReads === 1
        ? [{ repository: 'owner/UnresolvedFixture', release: 'error', development: 'error' }]
        : []),
      {
        repository: 'owner/Fixture',
        release,
        development: { ...release, version: '2.0.0', date: '2026-06-02T00:00:00Z' },
      },
      {
        repository: 'owner/Unpublished',
        release: 'unpublished',
        development: { ...release, id: 'fixture.unpublished', displayName: 'Unpublished' },
      },
    ];
  }
  if (name === 'prepareAppletInstall') {
    if (fixture.installDelay)
      await new Promise<void>((resolve) => {
        fixture.releaseInstall = resolve;
      });
    if (fixture.installFailure) return { error: fixture.installFailure };
    return {
      planId: 'fixture-plan',
      id: 'fixture.install',
      name: 'Fixture',
      version: fixture.previewVersion ?? '1.0.0',
      operation: 'install',
    };
  }
  if (name === 'applyAppletPackage')
    return fixture.applyFailure ? { error: fixture.applyFailure } : {};
  if (name === 'appletPackageStatus') return { status: 'failed' };
  if (name === 'chooseAppletInstallDirectory') return { path: 'C:\\Applet 配布\\Sample' };
};
const controls = { setShortcutRecording: async () => {} } as any;
createRoot(document.getElementById('root')!).render(
  <SettingsControlsProvider api={controls}>
    <SettingsHintsContext.Provider value={false}>
      <AppletManagementSettings
        applets={[]}
        management={{ packagesAvailable: true } as any}
        invoke={invoke}
      />
    </SettingsHintsContext.Provider>
  </SettingsControlsProvider>,
);

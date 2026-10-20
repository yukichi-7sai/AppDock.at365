import { createRoot } from 'react-dom/client';
import { AppletManagementSettings } from '../../../src/renderer/settings/AppletManagementSettings';
import { SettingsControlsProvider } from '../../../src/renderer/settings-ui/api';
import '../../../src/renderer/settings-ui/controls.css';
import '../../../src/renderer/settings/settings.css';

const fixture = window as any;
fixture.installCalls = [];
fixture.installFailure = '配布元のURLまたはフォルダーを入力してください。';
fixture.installDelay = false;
fixture.applyFailure = '';
const invoke = async (name: string, args: unknown[] = []) => {
  fixture.installCalls.push({ name, args });
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
      version: '1.0.0',
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
    <AppletManagementSettings
      applets={[]}
      management={{ packagesAvailable: true } as any}
      invoke={invoke}
    />
  </SettingsControlsProvider>,
);

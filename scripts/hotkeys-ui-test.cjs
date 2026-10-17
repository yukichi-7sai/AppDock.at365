const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `hotkeys-${Date.now()}`);
const clockFolder = path.join(profile, 'extensions', 'Applet.Watch.at365');
fs.mkdirSync(clockFolder, { recursive: true });
for (const name of ['extension.json', 'Applet.Watch.at365.exe'])
  fs.copyFileSync(
    path.join(root, '../../40.ARTIFACT/Applet.Watch.at365/Applet.Watch.at365', name),
    path.join(clockFolder, name),
  );
const isolatedKeys = process.env.APPDOCK_HOTKEY_TEST_ISOLATED === '1';
const initialKey = isolatedKeys ? 'F16' : 'Pause';
const remapKey = isolatedKeys ? 'F20' : 'F24';
const backgroundKey = isolatedKeys ? 'Ctrl+Alt+F9' : 'F23';
const manifestPath = path.join(clockFolder, 'extension.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const toggleCommand = manifest.defaultKeybindings[0].command;
manifest.defaultKeybindings[0].key = initialKey;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
// Initialize a new installation before adding its enabled state to settings.
const settings = require('../out/main/shared/keybindings.js').initializeExtensionDefaults(
  require('../out/main/shared/settings-schema.js').createDefaultSettings(),
  [manifest],
);
settings.extensions['at365.watch'] = { enabled: true, settings: { visible: true } };
settings.host.notifications = false;
require('../tests/fixtures/install.cjs')(profile, settings);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const { WindowsHotKeyBackend } = require('../out/main/main/core/global-hotkeys.js');
const checks = [];
let application;
let contender;
async function send(key) {
  const parts = key.split('+');
  const base = parts.at(-1);
  const virtualKey = base === 'Pause' ? 0x13 : 0x6f + Number(base.slice(1));
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'scripts/send-test-hotkey.ps1'),
      '-VirtualKey',
      String(virtualKey),
      ...(parts.includes('Ctrl') ? ['-Control'] : []),
      ...(parts.includes('Alt') ? ['-Alt'] : []),
      ...(isolatedKeys ? ['-ScanCode'] : []),
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(output || `SendInput helper exit ${code}`)),
    );
  });
}
async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}
(async () => {
  try {
    const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
    application = await electron.launch({
      executablePath,
      args: process.argv[2] ? [`--test-profile=${profile}`] : [root, `--test-profile=${profile}`],
      timeout: 30000,
    });
    const page = require('./settings-aware-page.cjs').settingsAwarePage(
      await application.firstWindow(),
    );
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    await until(async () => (await snapshot()).startupReady, 'Host startup did not finish.');
    const registered = async (key) =>
      (await snapshot()).globalHotKeys.some(
        (status) => status.shortcut === key && status.registered,
      );
    await until(
      () => registered(initialKey),
      `Registration failed for ${initialKey}; check whether another app owns the test key.`,
    );
    const visible = async () =>
      (await snapshot()).settings.value.extensions['at365.watch'].settings.visible;
    checks.push('global Pause registered by default');
    contender = new WindowsHotKeyBackend(
      path.join(root, '.artifacts/dotnet-host/AppDock.ExtensionHost.exe'),
      assert.fail,
      () => {},
    );
    assert.equal((await contender.sync([initialKey]))[0].registered, false);
    checks.push('second Windows host cannot register an occupied Pause');

    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
      false,
    );
    await send(initialKey);
    await until(
      async () => (await visible()) === false,
      'Hidden AppDock did not toggle Watch off.',
    );
    await send(initialKey);
    await until(async () => (await visible()) === true, 'Hidden AppDock did not toggle Watch on.');
    checks.push('Windows Pause toggles Watch both ways while AppDock is hidden');
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.show();
      window.focus();
    });
    await page.keyboard.press('Control+,');
    const settingsPage = await require('./settings-host-helper.cjs').settingsPage(page);
    await settingsPage.getByRole('button', { name: 'ショートカット', exact: true }).click();
    await settingsPage.getByLabel('ショートカットのコマンドを検索').fill(toggleCommand);
    const row = settingsPage.locator(`[data-shortcut-command="${toggleCommand}"]`);
    await row.locator('.applet-shortcut-edit').click();
    const shortcutDialog = settingsPage.locator('.applet-shortcut-dialog');
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    const input = shortcutDialog.getByRole('button', {
      name: 'ショートカットキーを入力',
      exact: true,
    });
    assert.equal(await input.innerText(), initialKey);
    assert.equal(
      (await shortcutDialog.getByRole('switch').getAttribute('aria-checked')) === 'true',
      true,
    );
    await settingsPage.bringToFront();
    await input.focus();
    await settingsPage.waitForFunction(
      () => document.hasFocus() && document.activeElement?.classList.contains('shortcut-capture'),
    );
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await until(async () => !(await registered(initialKey)), 'Recorder did not release Pause.');
    await send(initialKey);
    assert.equal(await visible(), true);
    await send(remapKey);
    await until(
      async () => (await input.innerText()) === remapKey,
      'Recorder did not capture single F24.',
    );
    await shortcutDialog.getByRole('button', { name: '適用', exact: true }).click();
    await settleSettings(settingsPage);
    await until(() => registered(remapKey), 'F24 remapping did not register.');
    assert.equal((await contender.sync([initialKey]))[0].registered, true);
    checks.push('recording suspends Pause; single F24 remapping releases Pause');

    await row.locator('.applet-shortcut-edit').click();
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await shortcutDialog.getByRole('button', { name: '特殊キーから選ぶ' }).click();
    await shortcutDialog.getByRole('button', { name: initialKey, exact: true }).click();
    await shortcutDialog.getByRole('button', { name: '適用', exact: true }).click();
    await settleSettings(settingsPage);
    await until(
      async () =>
        (await snapshot()).globalHotKeys.some(
          (status) => status.shortcut === initialKey && !!status.error,
        ),
      'Conflict status not displayed.',
    );
    await row.getByRole('alert').waitFor();
    await settingsPage.screenshot({ path: path.join(profile, 'conflict.png') });
    await contender.sync([]);
    await row.getByRole('button', { name: '登録を再試行', exact: true }).click();
    await until(() => registered(initialKey), 'Pause retry after conflict failed.');
    checks.push('conflict appears in settings; retry button registers after release');
    await send(initialKey);
    await until(async () => (await visible()) === false, 'Focused AppDock did not toggle Watch.');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await visible(), false);
    checks.push('focused AppDock executes global key once');

    await row.locator('.applet-shortcut-edit').click();
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await shortcutDialog.getByLabel('割り当てのいつ・どこで').selectOption('app');
    await shortcutDialog.getByRole('button', { name: '適用', exact: true }).click();
    await settleSettings(settingsPage);
    await until(
      async () => !(await registered(initialKey)),
      'Global opt-out did not release Pause.',
    );
    assert.equal((await contender.sync([initialKey]))[0].registered, true);
    await contender.sync([]);
    await row.locator('.applet-shortcut-edit').click();
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await shortcutDialog.getByLabel('割り当てのいつ・どこで').selectOption('global');
    await shortcutDialog.getByRole('button', { name: '適用', exact: true }).click();
    await settleSettings(settingsPage);
    await until(() => registered(initialKey), 'Global scope did not restore Pause.');
    await settingsPage.screenshot({ path: path.join(profile, 'registered.png') });
    await page.evaluate(() => window.dock.toggleExtension('at365.watch', false));
    await until(async () => !(await registered(initialKey)), 'Applet stop did not release Pause.');
    assert.equal((await contender.sync([initialKey]))[0].registered, true);
    await contender.sync([]);
    await page.evaluate(() => window.dock.toggleExtension('at365.watch', true));
    await until(() => registered(initialKey), 'Applet reactivation did not register Pause.');
    checks.push('global opt-out/scope restore and Applet stop/restart update registration');
    await page.evaluate(
      async ([remapKey, backgroundKey]) => {
        const snapshot = await window.dock.snapshot();
        const value = snapshot.settings.value;
        value.keybindings = value.keybindings.filter(
          (row) =>
            !['appdock.commands.search', 'appdock.welcome.verify-storage'].includes(row.command),
        );
        value.keybindings.push(
          ...[
            ['appdock.commands.search', remapKey],
            ['appdock.welcome.verify-storage', backgroundKey],
          ].map(([command, key]) => ({
            id: crypto.randomUUID(),
            command,
            key,
            enabled: true,
            when: { scope: 'global', appletIds: [] },
          })),
        );
        await window.dock.saveSettings(value, snapshot.settings.revision);
      },
      [remapKey, backgroundKey],
    );
    await until(() => registered(remapKey), 'Host command did not register globally.');
    await until(() => registered(backgroundKey), 'TypeScript command did not register globally.');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await send(backgroundKey);
    await until(
      async () =>
        (await snapshot()).logs.some((entry) => entry.message.includes('Storage / Secrets API')),
      'Background TypeScript command did not execute.',
    );
    await send(remapKey);
    await require('./shell-overlay-helper.cjs').overlayPage(page);
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
      true,
    );
    checks.push('background TypeScript command and global host palette command execute');
    await application.close();
    application = undefined;
    await until(
      async () => (await contender.sync([initialKey]))[0].registered,
      'Shutdown did not release Pause.',
    );
    checks.push('AppDock shutdown releases Windows registration');
    const result = {
      ok: true,
      profile,
      initialKey,
      remapKey,
      backgroundKey,
      checks: checks.map((check) =>
        check.replaceAll('Pause', initialKey).replaceAll('F24', remapKey),
      ),
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await application?.close();
    await contender?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

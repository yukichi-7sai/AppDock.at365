const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `preferences-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const { createDefaultSettings } = require('../out/main/shared/settings-schema.js');
const legacy = createDefaultSettings();
delete legacy.shortcuts;
delete legacy.profile;
delete legacy.pinnedCommands;
legacy.host.notifications = false;
require('./profile-settings-fixture.cjs').installProfileSettings(profile, legacy);
require('../tests/fixtures/install.cjs')(profile, legacy);
fs.writeFileSync(
  require('./test-settings.cjs').file(profile, 'settings.json'),
  JSON.stringify(legacy, null, 2),
);
let application;
async function launch() {
  application = await electron.launch({
    executablePath: process.argv[2]
      ? require('./copy-host.cjs').prepareTestHost(path.resolve(process.argv[2]), profile)
      : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    timeout: 30000,
  });
  const page = require('./settings-aware-page.cjs').settingsAwarePage(
    await application.firstWindow(),
  );
  await require('./shell-overlay-helper.cjs').startupPage(page);
  await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    w.show();
    w.focus();
  });
  await page.waitForTimeout(200);
  return page;
}
async function waitPins(page, pins) {
  page = await require('./shell-overlay-helper.cjs').overlayPage(page);
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll('.palette-command.pinned'))
        .map((e) => e.dataset.commandId)
        .join('|') === expected.join('|'),
    pins,
  );
}
(async () => {
  try {
    let page = await launch();
    let palette;
    const settingsPage = () => require('./settings-host-helper.cjs').settingsPage(page);
    await page.keyboard.press('Control+p');
    palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await (
      await require('./shell-overlay-helper.cjs').overlayPage(page)
    )
      .getByRole('button', { name: '保存APIを確認をピン留め', exact: true })
      .click();
    await waitPins(page, ['appdock.welcome.verify-storage']);
    await (
      await require('./shell-overlay-helper.cjs').overlayPage(page)
    )
      .getByRole('button', { name: 'ウェルカムを更新をピン留め', exact: true })
      .click();
    await waitPins(page, ['appdock.welcome.verify-storage', 'appdock.welcome.refresh']);
    await (
      await require('./shell-overlay-helper.cjs').overlayPage(page)
    )
      .getByRole('button', { name: 'ウェルカムを更新を上に移動', exact: true })
      .click();
    await waitPins(page, ['appdock.welcome.refresh', 'appdock.welcome.verify-storage']);
    await page.screenshot({ path: path.join(profile, 'pins.png') });
    await palette.getByPlaceholder('コマンドを入力…').fill('ウェルカムを更新');
    await waitPins(page, ['appdock.welcome.refresh']);
    assert.deepEqual(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.pinnedCommands,
      ['appdock.welcome.refresh', 'appdock.welcome.verify-storage'],
    );
    await require('./shell-overlay-helper.cjs').closingAction(
      (await require('./shell-overlay-helper.cjs').overlayPage(page)).keyboard.press('Escape'),
    );
    await page.waitForFunction(async () => !(await window.dock.snapshot()).overlay.active);
    await page.keyboard.press('Control+,');
    const setShortcut = async (commandId, key) => {
      const bindings = require('../out/main/shared/keybindings').getKeybindings(
        (await page.evaluate(() => window.dock.snapshot())).settings.value,
      );
      await page.evaluate(
        async ({ commandId, bindings }) => {
          const state = await window.dock.snapshot();
          state.settings.value.keybindings = bindings.filter((row) => row.command !== commandId);
          await window.dock.saveSettings(state.settings.value, state.settings.revision);
          await window.dock.executeCommand('appdock.settings.command-triggers.open');
        },
        { commandId, bindings },
      );
      const ui = await settingsPage();
      const row = ui.locator('[data-shortcut-command="' + commandId + '"]');
      await row.locator('.command-title').hover();
      await ui.getByTestId('binding-add:' + commandId + ':shortcuts').click();
      const dialog = ui.getByTestId('settings-dialog');
      await dialog.getByRole('button', { name: 'キージェスチャーを入力', exact: true }).press(key);
      await dialog.getByRole('button', { name: '追加', exact: true }).click();
      await settleSettings(ui);
      await page.evaluate(async (commandId) => {
        const state = await window.dock.snapshot();
        for (const row of state.settings.value.keybindings)
          if (row.command === commandId) row.when = { scope: 'app', appletIds: [] };
        await window.dock.saveSettings(state.settings.value, state.settings.revision);
      }, commandId);
    };
    await setShortcut('appdock.commands.search', 'Control+Alt+p');
    await setShortcut('appdock.welcome.verify-storage', 'Control+Alt+p');
    await settleSettings(await settingsPage());
    await settleSettings(await settingsPage());
    assert(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.keybindings.some(
        (row) => row.command === 'appdock.commands.search' && row.key === 'Ctrl+Alt+P',
      ),
    );
    await setShortcut('appdock.welcome.verify-storage', 'Control+Alt+r');
    await settleSettings(await settingsPage());
    await settleSettings(await settingsPage());
    await page.screenshot({ path: path.join(profile, 'shortcuts.png') });
    await (
      await require('./shell-overlay-helper.cjs').ribbonPage(page)
    )
      .getByRole('button', { name: '画像ライブラリー', exact: true })
      .first()
      .click();
    await page.locator('.library-page').waitFor();
    await page.keyboard.press('Control+p');
    assert.equal((await page.evaluate(() => window.dock.snapshot())).overlay.active, false);
    await page.keyboard.press('Control+Alt+p');
    palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await require('./shell-overlay-helper.cjs').closingAction(
      (await require('./shell-overlay-helper.cjs').overlayPage(page)).keyboard.press('Escape'),
    );
    await page.waitForFunction(async () => !(await window.dock.snapshot()).overlay.active);
    await page.keyboard.press('Control+Alt+r');
    await page.waitForFunction(() =>
      window.dock
        .snapshot()
        .then((s) =>
          s.logs.some((entry) =>
            entry.message.includes('Storage / Secrets API の往復を確認しました。'),
          ),
        ),
    );
    // Assign and execute a real .NET command through the current trigger editor.
    await page.evaluate(() => window.dock.toggleExtension('appdock.dotnet-demo', true));
    await require('./settings-host-helper.cjs').waitForHost(
      page,
      async () =>
        (await window.dock.snapshot()).extensions.find((e) => e.id === 'appdock.dotnet-demo')
          ?.state === 'running',
    );
    await setShortcut('appdock.dotnet-demo.refresh', 'Control+Alt+d');
    await settleSettings(await settingsPage());
    const before = (await page.evaluate(() => window.dock.snapshot())).logs
      .filter((e) => e.source === 'appdock.dotnet-demo' && e.message.startsWith('fixture-refresh:'))
      .at(-1)
      .message.slice(16);
    await (
      await require('./shell-overlay-helper.cjs').ribbonPage(page)
    )
      .getByRole('button', { name: '画像ライブラリー', exact: true })
      .first()
      .click();
    await page.locator('.library-page').waitFor();
    await page.keyboard.press('Control+Alt+d');
    await page.waitForFunction(
      (previous) =>
        window.dock.snapshot().then(
          (s) =>
            Number(
              s.logs
                .filter(
                  (e) =>
                    e.source === 'appdock.dotnet-demo' && e.message.startsWith('fixture-refresh:'),
                )
                .at(-1)
                .message.slice(16),
            ) > Number(previous),
        ),
      before,
    );
    const shell = await require('./shell-overlay-helper.cjs').ribbonPage(page);
    await shell.locator('[data-ribbon-id="applet:fixture.profile:main"]').click();
    const name = (await settingsPage()).getByLabel('ユーザー名', { exact: true });
    await name.fill('検証ユーザー');
    await name.press('Enter');
    await settleSettings(await settingsPage());
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.profile'
      ].settings.name,
      '検証ユーザー',
    );
    await application.close();
    application = undefined;
    page = await launch();
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.extensions[
        'fixture.profile'
      ].settings.name,
      '検証ユーザー',
    );
    await page.keyboard.press('Control+Alt+p');
    await waitPins(page, ['appdock.welcome.refresh', 'appdock.welcome.verify-storage']);
    await (
      await require('./shell-overlay-helper.cjs').overlayPage(page)
    )
      .getByRole('button', { name: '保存APIを確認をピン留め解除', exact: true })
      .click();
    await waitPins(page, ['appdock.welcome.refresh']);
    await require('./shell-overlay-helper.cjs').closingAction(
      (await require('./shell-overlay-helper.cjs').overlayPage(page)).keyboard.press('Escape'),
    );
    await page.waitForFunction(async () => !(await window.dock.snapshot()).overlay.active);
    console.log(
      JSON.stringify(
        {
          ok: true,
          profile,
          checks: [
            'legacy settings / Ctrl+P default',
            'pin / order / filter / unpin',
            'current trigger key recording / shared bindings / remapping',
            'TypeScript and .NET keyboard commands',
            'declarative Profile Applet settings and restart persistence',
            'restart persistence',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await application?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

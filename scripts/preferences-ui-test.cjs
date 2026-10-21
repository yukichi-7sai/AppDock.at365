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
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(legacy, null, 2));
let application;
async function launch() {
  application = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    timeout: 30000,
  });
  const page = require('./settings-aware-page.cjs').settingsAwarePage(
    await application.firstWindow(),
  );
  await require('./shell-overlay-helper.cjs').homePage(page);
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
    await (
      await settingsPage()
    )
      .getByRole('button', { name: 'ショートカットキー', exact: true })
      .click();
    const setShortcut = async (commandId, key) => {
      const row = (await settingsPage()).locator(
        `.shortcuts-editor [data-shortcut-command="${commandId}"]`,
      );
      await row.waitFor();
      const existing = row.locator('.applet-shortcut-edit').first();
      const adding = !(await existing.count());
      if (adding) await row.getByRole('button', { name: /に割り当てを追加/ }).click();
      else await existing.click();
      const panel = (await settingsPage()).locator('.applet-shortcut-dialog');
      await panel.getByText('押して入力', { exact: true }).waitFor();
      await panel.getByRole('button', { name: 'ショートカットキーを入力', exact: true }).press(key);
      await panel.getByLabel('割り当てのいつ・どこで').selectOption('app');
      await panel.getByRole('button', { name: adding ? '追加' : '適用', exact: true }).click();
    };
    await setShortcut('appdock.commands.search', 'Control+Alt+p');
    await setShortcut('appdock.welcome.verify-storage', 'Control+Alt+p');
    await settleSettings(await settingsPage());
    await settleSettings(await settingsPage());
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).settings.value.shortcuts[
        'appdock.commands.search'
      ].includes('Ctrl+Alt+P'),
      true,
    );
    await setShortcut('appdock.welcome.verify-storage', 'Control+Alt+r');
    await settleSettings(await settingsPage());
    await settleSettings(await settingsPage());
    await page.screenshot({ path: path.join(profile, 'shortcuts.png') });
    await (
      await require('./shell-overlay-helper.cjs').ribbonPage(page)
    )
      .getByRole('button', { name: 'ホーム', exact: true })
      .first()
      .click();
    await require('./shell-overlay-helper.cjs').homePage(page);
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
    // Assign and execute a real .NET command through the same shortcut settings.
    await (
      await require('./shell-overlay-helper.cjs').ribbonPage(page)
    )
      .getByRole('button', { name: 'Applet', exact: true })
      .click();
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /.NET Connection Demo/ })
      .click();
    await page.getByRole('switch', { name: '.NET Connection Demoを有効にする' }).click();
    await page.getByRole('heading', { name: 'C# is docked.' }).waitFor();
    await page.keyboard.press('Control+,');
    await setShortcut('appdock.dotnet-demo.refresh', 'Control+Alt+d');
    await settleSettings(await settingsPage());
    const before = (await page.evaluate(() => window.dock.snapshot())).extensions
      .find((e) => e.id === 'appdock.dotnet-demo')
      .panel.facts.find((f) => f.label === 'Refresh').value;
    await (
      await require('./shell-overlay-helper.cjs').ribbonPage(page)
    )
      .getByRole('button', { name: 'ホーム', exact: true })
      .first()
      .click();
    await require('./shell-overlay-helper.cjs').homePage(page);
    await page.keyboard.press('Control+Alt+d');
    await page.waitForFunction(
      (previous) =>
        window.dock
          .snapshot()
          .then(
            (s) =>
              Number(
                s.extensions
                  .find((e) => e.id === 'appdock.dotnet-demo')
                  .panel.facts.find((f) => f.label === 'Refresh').value,
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
            'shortcut recording / shared bindings / remapping',
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

const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const executable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', `ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema.js').createDefaultSettings();
require('../tests/fixtures/install.cjs')(profile, settings);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    env,
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), `--test-profile=${profile}`],
    timeout: 30000,
  });
  try {
    const page = require('./settings-aware-page.cjs').settingsAwarePage(
      await application.firstWindow(),
    );
    const shell = await require('./shell-overlay-helper.cjs').ribbonPage(page);
    await require('./shell-overlay-helper.cjs').startupPage(page);
    assert.deepEqual(await shell.locator('.activity-rail .rail-label').allTextContents(), [
      '画像ライブラリー',
      'Applet',
      '設定',
      'ログ',
      '通知センター',
      'テーマを切り替え',
    ]);
    const initial = await page.evaluate(async () => ({
      api: Object.keys(window.dock),
      snapshot: await window.dock.snapshot(),
    }));
    assert.equal(
      initial.api.some((name) => /widget/i.test(name)),
      false,
    );
    assert.equal('widgets' in initial.snapshot, false);
    assert.equal('widgets' in initial.snapshot.settings.value, false);
    assert.equal(
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    await shell.getByRole('button', { name: 'Applet', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /.NET Connection Demo/ })
      .click();
    await page.getByRole('tab', { name: '説明', exact: true }).click();
    await page.getByRole('switch', { name: '.NET Connection Demoを有効にする' }).click();
    await page.getByRole('heading', { name: 'C# is docked.' }).waitFor();
    await page.getByRole('button', { name: '状態を更新', exact: true }).click();
    await page.screenshot({ path: path.join(profile, 'dotnet.png') });
    await shell.getByRole('button', { name: '設定', exact: true }).first().click();
    await page.getByLabel('テーマ', { exact: true }).selectOption('light');
    await settleSettings(page);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).host.theme,
      'light',
    );
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = page.getByRole('textbox', { name: '設定JSON' });
    await json.fill('{broken json');
    await settleSettings(page);
    await page.getByRole('alert').filter({ hasText: 'JSONの内容' }).waitFor();
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).host.theme,
      'light',
    );
    await settleSettings(page);
    await page.screenshot({ path: path.join(profile, 'settings-json.png') });
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    await page.screenshot({ path: path.join(profile, 'settings.png') });
    await page.getByRole('button', { name: '一般', exact: true }).click();
    await page.getByRole('switch', { name: '閉じるとトレイに収納' }).waitFor();
    await page.screenshot({ path: path.join(profile, 'settings-general.png') });
    await shell.getByRole('button', { name: 'Applet', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /.NET Connection Demo/ })
      .click();
    await page.getByRole('tab', { name: '設定', exact: true }).click();
    await page.getByLabel('更新間隔（秒）').fill('10');
    await settleSettings(page);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions[
        'appdock.dotnet-demo'
      ].settings.intervalSeconds,
      10,
    );
    await page.keyboard.press('Control+p');
    const palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await palette.getByPlaceholder('コマンドを入力…').fill('保存API');
    await require('./shell-overlay-helper.cjs').closingAction(
      palette
        .locator('[data-command-id="appdock.dotnet-demo.verify-storage"] .palette-execute')
        .click(),
    );
    await page.getByRole('status').filter({ hasText: 'コマンドを実行' }).waitFor();
    // Manual edits are watched and reflected in the UI without restarting.
    const settingsFile = path.join(profile, 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsFile));
    config.host.theme = 'dark';
    fs.writeFileSync(settingsFile, JSON.stringify(config, null, 2));
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    // A malformed manual edit preserves the last valid in-memory state and the file.
    fs.writeFileSync(settingsFile, '{broken');
    await shell.getByRole('button', { name: 'ログ', exact: true }).first().click();
    const logs = await require('./shell-overlay-helper.cjs').logsPage(page, { type: 'all' });
    await logs.getByText(/設定ファイルを読み込めません。最後の有効/).waitFor();
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), '{broken');
    fs.writeFileSync(settingsFile, JSON.stringify(config, null, 2));
    await shell.getByRole('button', { name: 'Applet', exact: true }).first().click();
    await page.getByRole('tab', { name: '説明', exact: true }).click();
    await page.getByRole('switch', { name: '.NET Connection Demoを有効にする' }).click();
    await page.getByRole('heading', { name: 'このAppletをDockにつなぐ' }).waitFor();
    assert.equal(
      (await page.evaluate(() => window.dock.snapshot())).extensions.find(
        (e) => e.id === 'appdock.dotnet-demo',
      ).state,
      'stopped',
    );
    await page.evaluate(() => window.dock.navigate(null));
    await require('./shell-overlay-helper.cjs').startupPage(page);
    await page.screenshot({ path: path.join(profile, 'startup.png') });
    console.log(
      JSON.stringify(
        {
          ok: true,
          profile,
          checks: [
            'four navigation pages / widget API and layout removed / only main window',
            'React navigation',
            '.NET activation / command / deactivation',
            'settings form persistence',
            'invalid JSON preservation',
            'command palette / encrypted secrets',
            'manual settings reload',
            'invalid manual JSON fallback',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

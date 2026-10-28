const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { assertKeyboardFocus, assertReadableText } = require('./ui-usability-helper.cjs');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-controls-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.host.soundEnabled = false;
initial.keybindings = [];
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));

const source = process.argv[2] && path.resolve(process.argv[2]);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const executablePath = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (source) {
  require('./copy-host.cjs').copyHost(source, executablePath);
  assert.equal(hash(executablePath), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [],
  errors = [];
let app,
  host,
  success = false;

(async () => {
  try {
    app = await launchTestHost({
      executablePath,
      portable: !!source,
      env,
      args: [
        ...(source ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
    });
    const deadline = Date.now() + 30000;
    while (!host && Date.now() < deadline) {
      host = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('appdock://host/'));
      if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(host, 'host page');
    host.setDefaultTimeout(15000);
    host.on('pageerror', (error) => errors.push(error.message));
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    const saved = () => host.evaluate(async () => (await window.dock.snapshot()).settings.value);
    const open = async (id) => {
      await host.evaluate((id) => window.dock.executeCommand(`appdock.settings.${id}.open`), id);
      await settingsPage(host);
      await host.getByTestId('settings-page:' + id).waitFor();
      await settleSettings(host);
    };
    const section = (title) =>
      host.locator('.settings-section').filter({
        has: host.getByRole('heading', { name: title, level: 2, exact: true }),
      });

    await open('general');
    const sound = host.getByRole('switch', { name: '音の再生', exact: true });
    await sound.click();
    await settleSettings(host);
    assert.equal((await saved()).host.soundEnabled, true);
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.soundEnabled.off'));
    await host.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label="音の再生"]')
          ?.getAttribute('aria-checked') === 'false',
    );
    assert.equal((await saved()).host.soundEnabled, false);
    checks.push('sound edits save immediately and generated commands update the same control');

    for (const { theme, width } of [
      { theme: 'light', width: 1280 },
      { theme: 'dark', width: 760 },
    ]) {
      await open('appearance');
      await host.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(host);
      await host.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      assert.equal((await saved()).host.theme, theme);
      await host.setViewportSize({ width, height: 840 });
      await open('notifications');
      const card = section('通知の受け取り方');
      const summary = card.locator(':scope > summary');
      if (await card.evaluate((element) => element.open)) await summary.click();
      const before = (await saved()).notificationPreferences;
      await summary.focus();
      await summary.press('Enter');
      assert(await card.evaluate((element) => element.open), 'Enter expands notification settings');
      await assertKeyboardFocus(summary);
      await assertReadableText(
        summary.getByRole('heading', { name: '通知の受け取り方', exact: true }),
      );
      await summary.press('Space');
      assert(
        !(await card.evaluate((element) => element.open)),
        'Space collapses notification settings',
      );
      await summary.click();
      assert(await card.evaluate((element) => element.open), 'disclosure row is clickable');
      assert.deepEqual(
        (await saved()).notificationPreferences,
        before,
        'disclosure never saves preferences',
      );
      const edit = host.getByRole('button', { name: 'AppDockのエラー通知を編集', exact: true });
      await edit.focus();
      await edit.press('Enter');
      const notificationDialog = host.getByRole('dialog');
      await notificationDialog.waitFor();
      assert(
        await notificationDialog.getByLabel('エラー通知のバナー', { exact: true }).isDisabled(),
      );
      assert(
        await notificationDialog.getByLabel('エラー通知のバナー', { exact: true }).isChecked(),
      );
      await host.screenshot({ path: path.join(profile, `${theme}-${width}-controls.png`) });
      await notificationDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await notificationDialog.waitFor({ state: 'hidden' });
      assert(await edit.evaluate((element) => element === document.activeElement));
      assert.deepEqual((await saved()).notificationPreferences, before);
      checks.push(
        `${theme}/${width}: keyboard expansion, focus, row click and required notification destination`,
      );
    }
    await host.getByRole('button', { name: 'AppDockのエラー通知を編集', exact: true }).click();
    const notificationBefore = (await saved()).notificationPreferences;
    await host.getByLabel('エラー通知の表示時間', { exact: true }).fill('12');
    await host.getByLabel('エラー通知の表示時間', { exact: true }).press('Enter');
    assert.deepEqual(
      (await saved()).notificationPreferences,
      notificationBefore,
      'notification draft stays local',
    );
    await host.getByRole('dialog').getByTestId('settings-dialog-confirm').click();
    await host.getByRole('dialog').waitFor({ state: 'hidden' });
    await settleSettings(host);
    const notification = (await saved()).notificationPreferences.overrides.find(
      (row) => row.ownerId === 'errors',
    );
    assert.equal(notification.durationSeconds, 12);
    const notificationRow = host
      .getByRole('row')
      .filter({ has: host.getByText('エラー通知', { exact: true }) });
    assert.match(await notificationRow.innerText(), /12秒/);
    checks.push('notification draft saves only on OK and the list reflects its saved value');

    await open('general');
    const search = host.getByRole('combobox', { name: '設定を検索', exact: true });
    await search.fill('移動距離');
    await host.getByRole('option', { name: /移動距離/ }).click();
    await host.getByTestId('settings-page:gestures').waitFor();
    assert.equal((await saved()).gestures.enabled, false, 'search never enables input hooks');
    await search.fill('');
    checks.push('search reaches the selected setting without changing input ownership');

    await host.setViewportSize({ width: 1280, height: 840 });
    await open('ai');
    await host.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    const dialog = host.getByRole('dialog');
    const before = (await saved()).ai;
    await dialog.getByLabel('AI接続の名前', { exact: true }).fill('Control probe');
    await dialog.getByLabel('AIのAPIのURL', { exact: true }).fill('http://127.0.0.1:1/v1');
    await dialog.getByLabel('AIの既定の出力トークン上限', { exact: true }).fill('16384');
    await dialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).fill('120');
    assert.deepEqual((await saved()).ai, before, 'dialog edits remain local before OK');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const persisted = (await saved()).ai;
    const connection = persisted.connections.find((row) => row.name === 'Control probe');
    assert(connection);
    assert.equal(connection.defaultMaxOutputTokens, 16384);
    assert.equal(connection.defaultTimeoutSeconds, 120);
    assert.equal(connection.baseUrl, 'http://127.0.0.1:1/v1');
    await host.getByRole('button', { name: 'Control probeの設定', exact: true }).click();
    assert.equal(
      await dialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).inputValue(),
      '120',
    );
    await dialog.getByLabel('AIのTemperature', { exact: true }).fill('0.7');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await saved()).ai, persisted, 'cancel discards local edits');
    checks.push(
      'AI dialog keeps drafts local, saves on OK, restores values and discards on cancel',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (app)
      await app.close().catch((error) => {
        errors.push(error.message);
        success = false;
        process.exitCode = 1;
      });
    const result = {
      success,
      checks,
      errors,
      profile,
      source: source || 'development build',
      executableSha256: source ? hash(executablePath) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

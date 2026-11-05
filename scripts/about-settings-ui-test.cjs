const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { launch, until, hash } = require('./page-test-host.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/about-settings-ui-'));
const portable = process.argv[2] && path.resolve(process.argv[2]);
const sharedFile = require('./test-settings.cjs').file(profile);
const deviceFile = require('./test-settings.cjs').file(profile, `settings-${os.hostname()}.json`);
const initial = createDefaultSettings();
initial.keybindings = [];
initial.gestures.enabled = false;
initial.host.soundEnabled = false;
fs.writeFileSync(sharedFile, JSON.stringify(initial));
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const checks = [];
let host, page;
const model = () =>
  page.evaluate(() =>
    window.dock.settingsPage.get(
      document.querySelector('.settings-surface').dataset.settingsConnection,
    ),
  );
async function select(id) {
  await page.getByTestId(`settings-nav:${id}`).click();
  await page.getByTestId(`settings-page:${id}`).waitFor();
}
async function start() {
  host = await launch(profile, portable);
  page = host.main;
  await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await settingsPage(page);
  await select('about');
}
async function reset() {
  await page.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '既定値に戻す', exact: true }).click();
  await settleSettings(page);
}
async function main() {
  await start();
  assert.equal(await page.getByTestId('settings-storage-local').count(), 0);
  assert.equal(await page.getByTestId('settings-storage-device-only').innerText(), 'このPC専用');
  assert.deepEqual(
    (await model()).content.auxiliary.storage.files.map((file) => file.scope),
    ['device'],
  );
  assert.equal((await model()).content.auxiliary.storage.canSwitch, false);
  const headings = await page
    .locator(
      '.about-page > .settings-section > header h2, .about-page > .settings-section > summary h2',
    )
    .allTextContents();
  assert.deepEqual(headings, [
    'AppDockの起動',
    '設定ファイル',
    '更新の設定',
    '高度な設定',
    '開発用の設定',
    '起動時間の計測',
  ]);
  const startup = page.getByTestId('about-startup-settings');
  if ((await model()).content.auxiliary.launch.supported) {
    assert.match(
      await startup.locator(':scope > header > p').innerText(),
      /権限で動作中.*自動起動/,
    );
    await startup.getByRole('button', { name: '状態を確認', exact: true }).click();
  }
  assert.equal(await page.getByTestId('update-settings').evaluate((el) => el.tagName), 'SECTION');
  assert.equal(await page.getByTestId('update-settings').locator('summary').count(), 0);
  const developer = page.getByTestId('developer-settings');
  const source = developer.getByRole('textbox', { name: 'AppDockの更新元', exact: true });
  const sameVersion = developer.getByRole('switch', {
    name: '同じバージョンの再適用を許可（開発用）',
    exact: true,
  });
  assert.equal(await developer.evaluate((el) => el.open), false);
  assert.equal(await source.isVisible(), false);
  const sharedBefore = fs.readFileSync(sharedFile, 'utf8');
  await developer.locator(':scope > summary').click();
  const sourceReset = developer.getByRole('button', {
    name: 'AppDockの更新元を既定に戻す',
    exact: true,
  });
  assert(await sourceReset.isDisabled());
  const customSource = path.join(profile, 'development-feed');
  await source.fill(customSource);
  await source.press('Enter');
  await sameVersion.click();
  await settleSettings(page);
  assert.equal(disk(deviceFile).hostPages.about.configuration.updates.hostSource, customSource);
  assert.equal(disk(deviceFile).hostPages.about.configuration.updates.allowSameVersion, true);
  await developer.locator(':scope > summary').click();
  assert.equal(await developer.evaluate((el) => el.open), false);
  const search = page.getByRole('combobox', { name: '設定を検索' });
  await search.fill('AppDockの更新元');
  await page.getByRole('option', { name: /AppDockの更新元/ }).click();
  await until(() => source.isVisible(), 'search opens developer settings');
  assert.equal(await source.inputValue(), customSource);
  await sourceReset.click();
  await settleSettings(page);
  assert.equal((await model()).content.values.updates.hostSource, initial.updates.hostSource);
  assert(await sourceReset.isDisabled());
  await source.fill(customSource);
  await source.press('Enter');
  await settleSettings(page);
  await search.fill('');
  checks.push(
    'developer settings start collapsed; source/reset and same-version save locally; search opens the hidden field',
  );
  checks.push(
    'fixed device toolbar/file target; section order; live launch description and refresh; always-open update settings',
  );
  const delay = page.getByTestId('update-setting-startupDelaySeconds').locator('input');
  await delay.fill('37');
  await delay.press('Enter');
  await settleSettings(page);
  await until(
    () => disk(deviceFile).hostPages.about.configuration.updates.startupDelaySeconds === 37,
    'device update delay',
  );
  await page.getByRole('switch', { name: 'ファイル監視の補助確認', exact: true }).click();
  const interval = page.getByLabel('補助確認の待機時間（秒）', { exact: true });
  await interval.fill('61.5');
  await interval.press('Enter');
  await settleSettings(page);
  assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedBefore);
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = page.getByRole('textbox', { name: '設定JSON', exact: true });
  const partial = JSON.parse(await json.inputValue());
  assert.equal(partial.updates.startupDelaySeconds, 37);
  assert.equal(partial.host.fileWatchAssistanceIntervalSeconds, 61.5);
  assert.equal(Object.hasOwn(partial.host, 'soundEnabled'), false);
  partial.updates.startupDelaySeconds = 43;
  await json.fill(JSON.stringify(partial, null, 2));
  await json.press('Enter');
  await settleSettings(page);
  assert.equal(disk(deviceFile).hostPages.about.configuration.updates.startupDelaySeconds, 43);
  await page.getByRole('button', { name: 'フォーム', exact: true }).click();
  await select('general');
  assert.deepEqual(
    (await model()).content.page.items.map((item) => item.key),
    ['startPage', 'closeToTray', 'startMinimized', 'soundEnabled'],
  );
  assert.equal(await page.getByRole('heading', { name: '基本動作', exact: true }).count(), 1);
  await reset();
  assert.equal(disk(deviceFile).hostPages.about.configuration.updates.startupDelaySeconds, 43);
  checks.push('form/JSON edits only save About to device; General reset preserves About');
  await host.close();
  host = undefined;
  await start();
  assert.equal(await page.getByTestId('developer-settings').evaluate((el) => el.open), false);
  assert.equal((await model()).content.values.updates.hostSource, customSource);
  assert.equal((await model()).content.values.updates.allowSameVersion, true);
  assert.equal((await model()).content.values.updates.startupDelaySeconds, 43);
  // Use the current page after restarting the real process.
  const currentInterval = page.getByLabel('補助確認の待機時間（秒）', { exact: true });
  assert.equal(await currentInterval.inputValue(), '61.5');
  for (const [theme, width, height] of [
    ['light', 1720, 1000],
    ['dark', 900, 620],
  ]) {
    await host.save({ host: { theme } });
    await host.resize(width, height);
    await page.getByTestId('about-startup-settings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, `${theme}-startup.png`) });
    await page.getByTestId('update-settings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, `${theme}-updates.png`) });
    assert(await page.getByTestId('update-setting-startupDelaySeconds').isVisible());
    const currentDeveloper = page.getByTestId('developer-settings');
    await currentDeveloper.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, `${theme}-developer-collapsed.png`) });
    await currentDeveloper.locator(':scope > summary').click();
    await page.getByTestId('update-setting-hostSource').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(profile, `${theme}-developer-open.png`) });
    assert(await page.getByTestId('update-setting-hostSource').isVisible());
    await currentDeveloper.locator(':scope > summary').click();
  }
  const sharedAfter = fs.readFileSync(sharedFile, 'utf8');
  await reset();
  assert.equal(fs.readFileSync(sharedFile, 'utf8'), sharedAfter);
  assert.equal(
    (await model()).content.values.updates.startupDelaySeconds,
    initial.updates.startupDelaySeconds,
  );
  assert.equal((await model()).content.values.host.fileWatchAssistanceEnabled, false);
  assert.equal((await model()).content.values.updates.hostSource, initial.updates.hostSource);
  assert.equal((await model()).content.values.updates.allowSameVersion, false);
  assert.equal(disk(deviceFile).hostPages.about.useLocalSettings, true);
  checks.push(
    'real process restart retains About values; light/wide and dark/minimum layouts; About reset remains device-only',
  );
  const result = {
    ok: true,
    profile,
    executableSha256: portable ? hash(portable) : undefined,
    checks,
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main()
  .catch(async (error) => {
    if (page && !page.isClosed())
      await page.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (host) await host.close();
  });

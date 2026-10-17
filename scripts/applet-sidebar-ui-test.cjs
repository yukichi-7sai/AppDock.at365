const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function clickRibbon(page, name) {
  const rail = await require('./shell-overlay-helper.cjs').ribbonPage(page);
  await rail.getByRole('button', { name, exact: true }).click();
  if (name === 'ホーム') await require('./shell-overlay-helper.cjs').homePage(page);
  else if (name === '設定') await require('./settings-host-helper.cjs').settingsPage(page);
  else if (name === 'ログ') await require('./shell-overlay-helper.cjs').logsPage(page);
  else await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
}
const profile = path.join(root, '.artifacts', `applet-sidebar-${Date.now()}`);
const settings = require('../out/main/shared/settings-schema.js').createDefaultSettings();
settings.host.notifications = false;
settings.globalShortcutCommands = [];
for (const [index, name] of [
  'Applet.Watch',
  'Applet.WindowsMover',
  'Applet.WindowsTools',
].entries()) {
  const folder = path.join(profile, 'extensions', `test.sidebar-${index}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: `test.sidebar-${index}`,
      name,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      capabilities: [],
    }),
  );
  fs.writeFileSync(path.join(folder, 'index.js'), 'exports.activate = async () => {};');
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  const app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  const page = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
  page.setDefaultTimeout(12000);
  await require('./shell-overlay-helper.cjs').homePage(page);
  await clickRibbon(page, 'Applet');
  await page.locator('.sidebar-extensions button').first().waitFor();
  return { app, page };
}
(async () => {
  let { app, page } = await launch();
  const body = require('./settings-host-helper.cjs').deferred(() =>
    require('./settings-host-helper.cjs').settingsPage(page),
  );
  const width = async () =>
    ((await page.evaluate(() => window.dock.snapshot())).navigation.route === 'settings'
      ? body
      : page
    )
      .locator('.sidebar')
      .evaluate((el) => el.getBoundingClientRect().width);
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    assert.equal(await width(), 280);
    assert.equal(await page.locator('.sidebar-extensions i').count(), 0);
    assert.deepEqual(await page.locator('.sidebar-extensions button > span').allTextContents(), [
      'WebApplet',
      'Watch',
      'WindowsMover',
      'WindowsTools',
    ]);
    const starts = await page.locator('.sidebar-extensions button > span').evaluateAll((items) =>
      items.map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return { x: range.getBoundingClientRect().x, align: getComputedStyle(el).textAlign };
      }),
    );
    assert.equal(starts.length, 4);
    assert(starts.every((item) => item.x === starts[0].x && item.align === 'left'));
    const separator = page.getByRole('separator', { name: 'Applet一覧の幅を変更' });
    const bounds = await separator.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 60);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + 60, { steps: 8 });
    await page.mouse.up();
    assert.equal(await width(), 340);
    await separator.focus();
    await separator.press('ArrowRight');
    assert.equal(await width(), 350);
    await separator.press('Home');
    assert.equal(await width(), 220);
    await separator.press('End');
    const viewport = await page.evaluate(() => innerWidth);
    assert(Math.abs((await width()) - Math.min(480, viewport * 0.4)) < 1);
    await separator.press('Home');
    for (let i = 0; i < 13; i++) await separator.press('ArrowRight');
    assert.equal(await width(), 350);
    for (const size of [
      { width: 1280, height: 840 },
      { width: 900, height: 620 },
    ]) {
      await page.setViewportSize(size);
      assert.equal(await width(), 350);
      assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: path.join(profile, `sidebar-${size.width}.png`) });
    }
    await page.setViewportSize({ width: 700, height: 620 });
    assert.equal(await separator.isVisible(), false);
    assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
    await page.setViewportSize({ width: 1280, height: 840 });
    assert.equal(await width(), 350);
    const appletStyle = await page.locator('.sidebar-extensions button.selected').evaluate((el) => {
      const style = getComputedStyle(el);
      const side = getComputedStyle(el.closest('.sidebar'));
      return [
        style.padding,
        style.fontSize,
        style.borderRadius,
        style.backgroundColor,
        style.color,
        side.padding,
        side.backgroundColor,
        side.borderRight,
      ];
    });
    await clickRibbon(page, '設定');
    assert.equal(await width(), 350, 'settings uses the Applet width');
    const settingsStyle = await body
      .locator('.settings-categories button.selected')
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const side = getComputedStyle(el.closest('.sidebar'));
        return [
          style.padding,
          style.fontSize,
          style.borderRadius,
          style.backgroundColor,
          style.color,
          side.padding,
          side.backgroundColor,
          side.borderRight,
        ];
      });
    assert.deepEqual(settingsStyle, appletStyle, 'both selectors share their appearance');
    const settingsSeparator = body.getByRole('separator', { name: '設定一覧の幅を変更' });
    const settingsBounds = await settingsSeparator.boundingBox();
    await (
      await require('./settings-host-helper.cjs').settingsPage(page)
    ).mouse.move(settingsBounds.x + settingsBounds.width / 2, settingsBounds.y + 60);
    await (await require('./settings-host-helper.cjs').settingsPage(page)).mouse.down();
    await (
      await require('./settings-host-helper.cjs').settingsPage(page)
    ).mouse.move(settingsBounds.x + settingsBounds.width / 2 - 40, settingsBounds.y + 60, {
      steps: 8,
    });
    await (await require('./settings-host-helper.cjs').settingsPage(page)).mouse.up();
    assert.equal(await width(), 310, 'settings can resize the shared sidebar');
    await settingsSeparator.focus();
    await settingsSeparator.press('ArrowRight');
    assert.equal(await width(), 320);
    await body.getByRole('button', { name: '一般', exact: true }).click();
    await body.getByRole('switch', { name: '閉じるとトレイに収納', exact: true }).click();
    await settleSettings(page);
    assert.equal(await body.getByText('未保存の変更があります', { exact: true }).count(), 0);
    assert.equal(await body.locator('.settings-categories .unsaved-mark').count(), 0);
    for (const size of [
      { width: 1280, height: 840 },
      { width: 900, height: 620 },
      { width: 700, height: 620 },
    ]) {
      await page.setViewportSize(size);
      assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
      assert.equal(await settingsSeparator.isVisible(), size.width > 760);
      await page.screenshot({ path: path.join(profile, `settings-sidebar-${size.width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 840 });
    await clickRibbon(page, 'Applet');
    assert.equal(await width(), 320, 'settings resize is reflected in Applet');
    assert.equal(await page.locator('.page-heading p').count(), 0);
    await clickRibbon(page, '設定');
    assert.equal(
      await body
        .getByRole('switch', { name: '閉じるとトレイに収納', exact: true })
        .getAttribute('aria-checked'),
      'false',
      'saved value survives page switches',
    );
    await clickRibbon(page, 'ログ');
    assert.equal(await page.locator('.page-heading p').count(), 0);
    await clickRibbon(page, 'ホーム');
    assert.equal(await page.locator('.page-heading p').count(), 0);
    assert.deepEqual(errors, []);
    await app.close();
    ({ app, page } = await launch());
    assert.equal(await width(), 320, 'shared width survives an Electron restart');
    await clickRibbon(page, '設定');
    assert.equal(await width(), 320, 'settings restores the shared width after restart');
    await page.evaluate(() => localStorage.setItem('appdock.applet-sidebar-width', 'broken'));
    await page.reload();
    await clickRibbon(page, 'Applet');
    assert.equal(await width(), 280, 'invalid saved width falls back to default');
    console.log(
      JSON.stringify(
        {
          ok: true,
          profile,
          checks: [
            'left alignment / no dots',
            'drag / keyboard / bounds',
            '900px / 1280px / narrow layout',
            'restart persistence / invalid storage',
            'settings appearance / shared drag and keyboard width / immediate persistence',
            'home / Applet / logs subtitles removed',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

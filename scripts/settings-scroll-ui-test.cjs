const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-scroll-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const { createDefaultSettings } = require('../out/main/shared/settings-schema.js');
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(createDefaultSettings()));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application;
(async () => {
  try {
    application = await electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`],
      env,
    });
    const page = await application.firstWindow();
    await require('./shell-overlay-helper.cjs').startupPage(page);
    await page.keyboard.press('Control+,');
    const settingsPage = await require('./settings-host-helper.cjs').settingsPage(page);
    for (const width of [1280, 900, 760]) {
      await application.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 600),
        width,
      );
      await settingsPage.getByRole('button', { name: '一般', exact: true }).click();
      await settingsPage.getByLabel('スタートアップに登録', { exact: true }).waitFor();
      const heading = await settingsPage
        .locator('.settings-surface .settings-page-heading')
        .boundingBox();
      const toolbar = await settingsPage
        .locator('.settings-surface .settings-page-toolbar')
        .boundingBox();
      const form = await settingsPage.locator('.settings-form').boundingBox();
      const scrollTop = await settingsPage
        .locator('.settings-surface .settings-body')
        .evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          return element.scrollTop;
        });
      assert.ok(scrollTop > 0, `long category scrolls at ${width}`);
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-heading').boundingBox(),
        heading,
      );
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-toolbar').boundingBox(),
        toolbar,
      );
      await settingsPage.getByRole('button', { name: '表示', exact: true }).click();
      await settingsPage.getByLabel('テーマ', { exact: true }).waitFor();
      assert.equal(
        await settingsPage
          .locator('.settings-surface .settings-body')
          .evaluate((element) => element.scrollTop),
        0,
      );
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-heading').boundingBox(),
        heading,
      );
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-toolbar').boundingBox(),
        toolbar,
      );
      const shortForm = await settingsPage.locator('.settings-form').boundingBox();
      assert.equal(shortForm.x, form.x);
      assert.equal(shortForm.width, form.width);
      assert.equal(await settingsPage.locator('main').evaluate((element) => element.scrollTop), 0);
      await settingsPage.getByRole('button', { name: 'JSON', exact: true }).click();
      await settingsPage.locator('.settings-surface .settings-body').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-heading').boundingBox(),
        heading,
      );
      assert.deepEqual(
        await settingsPage.locator('.settings-surface .settings-page-toolbar').boundingBox(),
        toolbar,
      );
      await settingsPage.getByRole('button', { name: 'フォーム', exact: true }).click();
      await page.screenshot({ path: path.join(profile, `settings-${width}.png`) });
    }
    console.log(
      'PASS: fixed heading/toolbar, long-to-short category width, JSON mode at 1280/900/760px',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (application) {
      await application.evaluate(({ app }) => app.quit()).catch(() => {});
      await application.close();
    }
  }
})();

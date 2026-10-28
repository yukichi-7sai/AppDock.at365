const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-transition-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
require('./profile-settings-fixture.cjs').installProfileSettings(profile, settings);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let executablePath;
  if (process.argv[2]) {
    executablePath = path.join(profile, 'AppDock.at365.exe');
    require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executablePath);
    assert.equal(hash(executablePath), hash(path.resolve(process.argv[2])));
  }
  const app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ['.']), `--test-profile=${profile}`],
    cwd: root,
    env,
  });
  const checks = [];
  try {
    const host = await app.firstWindow();
    host.on('pageerror', (error) => console.error('HOST-ERROR', error.message));
    await host.waitForFunction(async () => (await window.dock.snapshot()).startupReady);
    await host.locator('[data-settings-connection]').waitFor();
    await host.evaluate(() => window.dock.navigate('notifications'));
    await host.getByTestId('settings-index').waitFor({ state: 'hidden' });
    const beforeIndex = await host.evaluate(() => window.dock.settingsPage.index());
    assert.ok(beforeIndex.navigation.some((page) => page.id === 'general'));
    assert.equal('values' in beforeIndex, false);
    await host.clock.install();
    await app.evaluate(({ app }) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const prototype = require('./out/main/main/core/settings-page-host.js').SettingsPageHost
        .prototype;
      const original = prototype.open;
      globalThis.settingsTransitionFixture = { prototype, original, releases: [] };
      prototype.open = async function (request) {
        const failure = await new Promise((resolve) =>
          globalThis.settingsTransitionFixture.releases.push(resolve),
        );
        if (failure) throw Error('Fixture settings load failed');
        return original.call(this, request);
      };
    });
    const release = (failure = false) =>
      app.evaluate((_electron, failure) => {
        globalThis.settingsTransitionFixture.releases.shift()(failure);
      }, failure);
    const open = async () => {
      await host.evaluate(() => window.dock.navigate('settings'));
      await host.locator('.settings-page-loading').waitFor();
      await host.getByTestId('settings-nav:general').waitFor();
      const deadline = Date.now() + 10000;
      while (!(await app.evaluate(() => globalThis.settingsTransitionFixture.releases.length))) {
        if (Date.now() > deadline) throw Error('Settings open did not reach the fixture');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    const leave = async () => {
      await host.evaluate(() => window.dock.navigate('notifications'));
      await host.getByTestId('settings-index').waitFor({ state: 'hidden' });
    };

    await open();
    await host.evaluate(() => {
      globalThis.transitionIndex = document.querySelector('[data-testid="settings-index"]');
    });
    const bounds = await host.getByTestId('settings-index').boundingBox();
    await host.clock.fastForward(900);
    assert.equal(await host.getByText('設定を読み込んでいます…', { exact: true }).count(), 0);
    await host.clock.fastForward(150);
    const message = host.getByText('設定を読み込んでいます…', { exact: true });
    await message.waitFor();
    const messageBox = await message.boundingBox();
    const main = await host.locator('main').boundingBox();
    assert.ok(
      messageBox.x >= bounds.x + bounds.width &&
        messageBox.x + messageBox.width <= main.x + main.width,
    );
    assert.ok(messageBox.y >= main.y && messageBox.y + messageBox.height <= main.y + main.height);
    await host.screenshot({ path: path.join(profile, 'loading.png') });
    await host.getByTestId('settings-nav:general').click();
    await release();
    await host.locator('[data-settings-connection]').waitFor();
    await host.waitForFunction(async () => {
      const id = document.querySelector('[data-settings-connection]').dataset.settingsConnection;
      return (await window.dock.settingsPage.get(id)).content.page.id === 'general';
    });
    assert.equal(
      await host.evaluate(
        () =>
          globalThis.transitionIndex === document.querySelector('[data-testid="settings-index"]'),
      ),
      true,
    );
    const loadedBounds = await host.getByTestId('settings-index').boundingBox();
    assert.ok(
      Math.abs(loadedBounds.x - bounds.x) < 1 && Math.abs(loadedBounds.width - bounds.width) < 1,
    );
    checks.push(
      'index appears before the body; delayed message stays within the body; early navigation is applied without replacing the index',
    );

    await leave();
    await open();
    await host.evaluate(() => {
      globalThis.loadingMessageSeen = false;
      globalThis.loadingObserver = new MutationObserver(() => {
        if (document.body.textContent.includes('設定を読み込んでいます…'))
          globalThis.loadingMessageSeen = true;
      });
      globalThis.loadingObserver.observe(document.body, { childList: true, subtree: true });
    });
    await host.clock.fastForward(900);
    await release();
    await host.locator('[data-settings-connection]').waitFor();
    await host.clock.fastForward(500);
    assert.equal(await host.evaluate(() => globalThis.loadingMessageSeen), false);
    await host.evaluate(() => globalThis.loadingObserver.disconnect());
    checks.push('fast loads do not show the loading message and leave no pending timer');

    await leave();
    await open();
    await release(true);
    await host.getByText('設定を読み込めませんでした。', { exact: true }).waitFor();
    assert.equal(await host.getByText('設定を読み込んでいます…', { exact: true }).count(), 0);
    await host.getByRole('button', { name: 'エラーの詳細', exact: true }).waitFor();
    checks.push('load errors and details appear immediately before the loading delay');

    await leave();
    await open();
    await leave();
    await release();
    await open();
    await release();
    await host.locator('[data-settings-connection]').waitFor();
    assert.equal(await host.getByText('設定を読み込めませんでした。', { exact: true }).count(), 0);
    checks.push('leaving during loading and returning does not accept the old connection');
    await leave();
    await app.evaluate(({ BrowserWindow, nativeTheme }) => {
      nativeTheme.themeSource = 'dark';
      BrowserWindow.getAllWindows()[0].setSize(720, 620);
    });
    await open();
    await host.clock.fastForward(1100);
    await message.waitFor();
    const narrowMessage = await message.boundingBox();
    const narrowIndex = await host.getByTestId('settings-index').boundingBox();
    const narrowMain = await host.locator('main').boundingBox();
    assert.ok(narrowMessage.x >= narrowIndex.x + narrowIndex.width);
    assert.ok(narrowMessage.x + narrowMessage.width <= narrowMain.x + narrowMain.width);
    await host.screenshot({ path: path.join(profile, 'loading-narrow-dark.png') });
    await release();
    await host.locator('[data-settings-connection]').waitFor();
    checks.push('the loading message remains inside the body at narrow width in dark theme');
    await host.clock.resume();
    await host.screenshot({ path: path.join(profile, 'loaded.png') });
    const result = {
      success: true,
      checks,
      profile,
      mode: executablePath ? 'portable' : 'source',
      sha256: executablePath ? hash(executablePath) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await app
      .evaluate(() => {
        const fixture = globalThis.settingsTransitionFixture;
        if (fixture) {
          fixture.prototype.open = fixture.original;
          fixture.releases.forEach((release) => release());
        }
      })
      .catch(() => {});
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

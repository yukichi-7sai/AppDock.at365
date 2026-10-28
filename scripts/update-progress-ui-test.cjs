const { getPublishDirectory } = require('./publish-paths.cjs');
const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `update-progress-${Date.now()}`);
const source = path.join(profile, 'source');
const installed = path.join(profile, 'extensions/fixture');
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(installed, { recursive: true });
for (const [dir, version] of [
  [source, '2.0.0'],
  [installed, '1.0.0'],
]) {
  fs.writeFileSync(
    path.join(dir, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture',
      name: '更新進捗テスト',
      version,
      runtime: 'node',
      entry: 'index.js',
    }),
  );
  fs.writeFileSync(path.join(dir, 'index.js'), 'exports.activate = async () => {};');
}
fs.writeFileSync(path.join(source, 'asset.bin'), randomBytes(3 * 1024 * 1024));
const feedDir = path.join(profile, 'feed');
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
assert.equal(
  spawnSync(helper, ['--pack', 'applet', source, 'unused', feedDir], { windowsHide: true }).status,
  0,
);
const zip = fs.readFileSync(path.join(feedDir, 'update.zip'));
const feed = fs.readFileSync(path.join(feedDir, 'update.json'));
let slow = true,
  disconnected = 0,
  payloadRequests = 0;
const server = http.createServer((request, response) => {
  if (request.url === '/update.json') {
    response.end(feed);
    return;
  }
  payloadRequests++;
  response.setHeader('Content-Length', zip.length);
  if (!slow) {
    response.end(zip);
    return;
  }
  let offset = 0;
  const timer = setInterval(() => {
    if (offset >= zip.length) {
      clearInterval(timer);
      response.end();
      return;
    }
    response.write(zip.subarray(offset, offset + 32768));
    offset += 32768;
  }, 60);
  response.on('close', () => {
    disconnected++;
    clearInterval(timer);
  });
});
let app, browser, child, host, mainPort, executableSha256;
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label);
};
const main = (fn) =>
  app ? app.evaluate(fn) : inspect(mainPort, `(${fn.toString()})(${electronExpression})`);
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
  settings.host.hardwareAcceleration = false;
  settings.host.notifications = false;
  settings.globalShortcutCommands = [];
  const hostFeed = path.join(profile, 'host-update.json');
  const hostVersion = require('../package.json').version;
  const writeHostFeed = (version) =>
    fs.writeFileSync(
      hostFeed,
      JSON.stringify({
        schemaVersion: 1,
        kind: 'host',
        id: 'host',
        version,
        payload: { file: 'unused.exe', size: 2, sha256: '0'.repeat(64), format: 'exe' },
      }),
    );
  writeHostFeed('999.0.0');
  settings.updates.hostSource = hostFeed;
  settings.updates.checkHostOnStartup = false;
  settings.updates.checkHostOnAboutOpen = false;
  settings.updates.checkAppletsOnStartup = false;
  settings.extensions.fixture = {
    enabled: false,
    settings: {},
    updateSource: `http://127.0.0.1:${server.address().port}/update.json`,
  };
  const barFolder = path.join(profile, 'extensions/fixture.progress-bar');
  fs.cpSync(path.join(root, 'out/shells/default'), barFolder, { recursive: true });
  const barManifest = JSON.parse(fs.readFileSync(path.join(barFolder, 'extension.json')));
  Object.assign(barManifest, {
    id: 'fixture.progress-bar',
    name: 'Progress Shell',
    minimumHostVersion: '0.64.0',
    shell: { apiVersion: 1, views: { titlebar: 'bars.html' } },
  });
  fs.writeFileSync(path.join(barFolder, 'extension.json'), JSON.stringify(barManifest));
  settings.extensions[barManifest.id] = { enabled: true, settings: {} };
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    if (process.argv[2]) {
      const executable = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
      const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      executableSha256 = hash(executable);
      assert.equal(executableSha256, hash(path.resolve(process.argv[2])));
      const port = await freePort();
      mainPort = await freePort();
      child = spawn(
        executable,
        [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, `--inspect=${mainPort}`],
        { cwd: profile, env, windowsHide: false, stdio: 'ignore' },
      );
      browser = await until(
        () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
        'portable CDP',
      );
      host = await until(
        () =>
          browser
            .contexts()[0]
            .pages()
            .find((p) => p.url().startsWith('appdock://host/')),
        'host',
      );
    } else {
      app = await electron.launch({
        executablePath: path.join(getPublishDirectory(root), 'win-unpacked/AppDock.at365.exe'),
        args: [`--test-profile=${profile}`],
        env,
      });
      host = await app.firstWindow();
    }
    const page = require('./settings-aware-page.cjs').settingsAwarePage(host);
    let titlebar = await require('./shell-bars-helper.cjs').barPage(page, 'titlebar');
    const statusbar = await require('./shell-bars-helper.cjs').barPage(page, 'statusbar');
    page.setDefaultTimeout(15000);
    await require('./shell-overlay-helper.cjs').startupPage(page);
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page
      .locator('.settings-categories')
      .getByRole('button', { name: 'AppDockについて', exact: true })
      .click();
    const settingsPage = await require('./settings-host-helper.cjs').settingsPage(page);
    const hostVersions = settingsPage.getByTestId('about-version');
    assert.equal(await hostVersions.locator('.version-available').count(), 0);
    await page.evaluate(() => window.dock.checkAllUpdates());
    await hostVersions.getByLabel('更新後のバージョン 999.0.0', { exact: true }).waitFor();
    const current = await hostVersions.locator('.version-current').boundingBox();
    const next = await hostVersions.locator('.version-available').boundingBox();
    assert.ok(next.x > current.x + current.width);
    assert.ok(Math.abs(next.y - current.y) < 4);
    const hostColor = await hostVersions
      .locator('.version-current')
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(hostColor, 'rgba(0, 0, 0, 0)');
    assert.equal(await settingsPage.locator('.update-result-details').count(), 0);
    writeHostFeed(hostVersion);
    await page.evaluate(() => window.dock.checkUpdates());
    await hostVersions.locator('.version-available').waitFor({ state: 'detached' });
    assert.equal(await settingsPage.getByText('最新版です。', { exact: true }).count(), 0);
    fs.writeFileSync(hostFeed, 'invalid feed');
    await page.evaluate(() => window.dock.checkUpdates());
    assert.equal(await hostVersions.locator('.version-available').count(), 0);
    writeHostFeed('999.0.0');
    await page.evaluate(() => window.dock.checkUpdates());
    await hostVersions.getByLabel('更新後のバージョン 999.0.0', { exact: true }).waitFor();
    assert.equal(
      await settingsPage.getByRole('button', { name: '更新を確認', exact: true }).count(),
      1,
    );
    assert.equal(
      await settingsPage.getByRole('button', { name: 'すべての更新を確認', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Appletの管理と更新', exact: true }).click();
    const row = page.locator('[data-applet-id="fixture"]');
    const update = row.getByRole('button', { name: '更新', exact: true });
    await row.getByLabel('更新後のバージョン 2.0.0', { exact: true }).waitFor();
    const appletColor = await row
      .locator('.version-current')
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(hostColor, appletColor);
    assert.equal(await update.isEnabled(), true);
    await main(({ dialog }) => {
      globalThis.updateConfirmations = [];
      dialog.showMessageBox = async (...args) => {
        globalThis.updateConfirmations.push(args.at(-1));
        return new Promise((resolve) => {
          globalThis.answerUpdateConfirmation = resolve;
        });
      };
    });
    await update.click();
    await until(
      () => main(() => globalThis.updateConfirmations.length === 1),
      'confirmation before download',
    );
    assert.equal(payloadRequests, 0);
    const confirmation = await main(() => globalThis.updateConfirmations[0]);
    assert.equal(confirmation.title, '更新して再起動');
    assert.match(confirmation.message, /ダウンロード・検証/);
    assert.match(confirmation.detail, /1\.0\.0 → 2\.0\.0/);
    await main(() => globalThis.answerUpdateConfirmation({ response: 1 }));
    await page.waitForFunction(() => window.dock.snapshot().then((s) => !s.updates.busy));
    assert.equal(payloadRequests, 0);
    await main(({ dialog }) => {
      dialog.showMessageBox = async (...args) => {
        globalThis.updateConfirmations.push(args.at(-1));
        return { response: 0 };
      };
    });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, theme);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      const titleBounds = await page
        .locator('.shell-bar-slot[data-region="titlebar"]')
        .boundingBox();
      const bodyBounds = await page.locator('main').boundingBox();
      await update.click();
      await page.waitForFunction(() =>
        window.dock.snapshot().then((s) => s.updates.progress?.receivedBytes > 131072),
      );
      await titlebar.waitForFunction(
        () => document.querySelector('.update-operation progress')?.value > 131072,
        undefined,
        { polling: 100 },
      );
      const progress = await page.getByRole('progressbar').getAttribute('value');
      assert.ok(Number(progress) > 0 && Number(progress) < zip.length);
      await page.evaluate(() => window.dock.focusBar('titlebar', 'first'));
      await titlebar.waitForFunction(
        () => document.activeElement?.textContent.trim() === 'キャンセル',
        undefined,
        { timeout: 3000 },
      );
      assert.equal(
        await titlebar.getByRole('button', { name: '閉じる', exact: true }).isVisible(),
        false,
      );
      assert.equal(await statusbar.getByRole('region', { name: '更新の進捗' }).count(), 0);
      assert.equal(await statusbar.getByText(/実行中.*Applet/).isVisible(), true);
      assert.deepEqual(
        await page.locator('.shell-bar-slot[data-region="titlebar"]').boundingBox(),
        titleBounds,
      );
      assert.deepEqual(await page.locator('main').boundingBox(), bodyBounds);
      assert.equal(
        await titlebar
          .locator('.update-operation')
          .evaluate((e) => getComputedStyle(e).getPropertyValue('-webkit-app-region')),
        'no-drag',
      );
      await page.evaluate(
        async (provider) => {
          const s = await window.dock.snapshot();
          s.settings.value.host.shellProviders.titlebar = provider;
          await window.dock.saveSettings(s.settings.value, s.settings.revision);
        },
        theme === 'dark' ? 'fixture.progress-bar' : 'appdock.default-shell',
      );
      await until(
        () =>
          page.evaluate(
            async (provider) => {
              const s = await window.dock.snapshot();
              const bar = s.shellRegions.regions.find((r) => r.region === 'titlebar');
              return bar.boundProvider === provider && bar.ready;
            },
            theme === 'dark' ? 'fixture.progress-bar' : 'appdock.default-shell',
          ),
        'titlebar changes during download',
      );
      titlebar = await require('./shell-bars-helper.cjs').barPage(page, 'titlebar');
      await titlebar.waitForFunction(
        (value) => document.querySelector('.update-operation progress')?.value >= value,
        Number(progress),
      );
      await titlebar.screenshot({ path: path.join(profile, `titlebar-${theme}.png`) });
      await page.screenshot({ path: path.join(profile, `progress-${theme}.png`) });
      await settingsPage.screenshot({ path: path.join(profile, `settings-${theme}.png`) });
      await titlebar.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await page.waitForFunction(() => window.dock.snapshot().then((s) => !s.updates.busy));
      await until(
        () =>
          page.evaluate(
            async () =>
              (await window.dock.snapshot()).updates.notice?.message ===
              '更新を取り消しました。インストール済みのファイルは変更していません。',
          ),
        'cancellation result with notifications disabled',
      );
      assert.equal(await update.isEnabled(), true);
      await titlebar.getByRole('button', { name: '閉じる', exact: true }).waitFor();
      assert.equal(await titlebar.getByRole('region', { name: '更新の進捗' }).count(), 0);
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(installed, 'extension.json'))).version,
        '1.0.0',
      );
      assert.equal(fs.existsSync(path.join(profile, 'data/update-transaction.json')), false);
    }
    slow = false;
    const requestsBeforeCancel = payloadRequests;
    await main(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await update.click();
    await until(
      () =>
        page.evaluate(
          async () =>
            (await window.dock.snapshot()).updates.notice?.message === '更新を取り消しました。',
        ),
      'confirmation cancellation result',
    );
    assert.equal(await update.isEnabled(), true);
    assert.equal(payloadRequests, requestsBeforeCancel);
    assert.equal(await main(() => globalThis.updateConfirmations.length), 3);
    assert.ok(disconnected >= 2);
    assert.equal(fs.existsSync(path.join(installed, 'asset.bin')), false);
    const result = {
      ok: true,
      profile,
      executableSha256,
      checks: [
        'real IPC and local HTTP streaming progress',
        'dark/light screenshots',
        'cancel aborts transfer without replacing installed Applet',
        'confirmation precedes payload requests; cancellation does not download',
        'approved transfers remain cancellable in both themes',
        'host update controls and separate Applet management',
        'host and Applet current/new versions align inline with matching colored badges',
        'current/error checks remove the new-version badge without a details popup',
        'Applet updates remain operable in the management row',
        'titlebar progress covers window controls, preserves body bounds and restores controls after cancellation',
        'keyboard entry into the titlebar focuses the visible cancel button during download',
        'statusbar retains its normal activity display throughout download',
        'real download progress and cancellation survive titlebar provider replacement in both themes',
      ],
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (child && host && !host.isClosed())
      await host
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'portable exit').catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

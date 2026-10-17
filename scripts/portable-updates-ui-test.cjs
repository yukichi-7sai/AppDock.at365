const { getPublishDirectory } = require('./publish-paths.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const hostVersion = require('../package.json').version;
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `portable-updates-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const executable = path.join(profile, 'AppDock.at365.exe');
fs.copyFileSync(path.join(getPublishDirectory(root), 'AppDock.at365.exe'), executable);
const settings = require('../out/main/shared/settings-schema.js').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.host.startMinimized = true;
settings.globalShortcutCommands = [];
settings.updates = {
  ...settings.updates,
  hostSource: path.join(getPublishDirectory(root)),
  checkHostOnStartup: true,
  checkAppletsOnStartup: true,
  startupDelaySeconds: 0,
  notifyOnStartup: false,
  allowSameVersion: true,
};
const checks = [];
for (const [id, enabled] of [
  ['appdock.dotnet-demo', true],
  ['test.disabled', false],
]) {
  const installed = path.join(profile, 'extensions', id);
  const source = path.join(profile, 'sources', id);
  for (const [folder, version] of [
    [installed, '1.0.0'],
    [source, '2.0.0'],
  ]) {
    fs.mkdirSync(folder, { recursive: true });
    if (enabled) {
      fs.cpSync(path.join(root, '.artifacts/test-extensions/dotnet-demo'), folder, {
        recursive: true,
      });
      const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json')));
      manifest.version = version;
      fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(manifest));
      continue;
    }
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: id,
        version,
        runtime: 'node',
        entry: 'index.js',
        capabilities: ['pages'],
        commands: [{ id: 'test.disabled.open', title: 'Open fixture', activateOnExecute: true }],
        pages: [
          {
            id: 'main',
            title: 'Restart page fixture',
            source: 'local',
            ui: 'index.html',
            openCommand: 'test.disabled.open',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.js'),
      "exports.activate = async c => { c.commands.register('test.disabled.open', 'Open fixture', () => c.pages.open('main')); };",
    );
    fs.writeFileSync(
      path.join(folder, 'index.html'),
      '<!doctype html><html><body>Restart fixture</body></html>',
    );
  }
  fs.writeFileSync(path.join(installed, 'obsolete.dll'), 'old');
  settings.extensions[id] = { enabled, settings: { preserved: 'user-data' }, updateSource: source };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings, null, 2));
fs.mkdirSync(path.join(profile, 'data/web-accounts'), { recursive: true });
fs.writeFileSync(path.join(profile, 'data/web-accounts/preserved.txt'), 'login-fixture');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect(port) {
  let last;
  for (let i = 0; i < 40; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2500 });
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const pages = browser.contexts().flatMap((context) => context.pages());
        const page = pages.find((page) => page.url().startsWith('appdock://host/'));
        if (page) return { browser, page };
        await wait(100);
      }
      const targets = browser
        .contexts()
        .flatMap((c) => c.pages())
        .map((p) => p.url());
      await browser.close();
      throw Error('host renderer not ready: ' + targets.join(', '));
    } catch (error) {
      if (!last || !String(error).includes('ECONNREFUSED'))
        console.error('CONNECT-DIAGNOSTIC', String(error));
      last = error;
      await wait(200);
    }
  }
  throw last;
}
async function waitSnapshot(page, predicate) {
  for (let i = 0; i < 100; i++) {
    const snapshot = await page.evaluate(() => window.dock.snapshot());
    if (predicate(snapshot)) return snapshot;
    await wait(100);
  }
  throw Error('snapshot predicate timed out');
}
async function about(page) {
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('navigation').count();
  await page
    .locator('.settings-categories')
    .getByRole('button', { name: 'バージョン情報・更新', exact: true })
    .click();
}
const electronExpression =
  "process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron')";
async function inspect(inspectPort, expression, awaitPromise = true) {
  const contexts = await (
    await fetch(`http://127.0.0.1:${inspectPort}/json/list`, {
      signal: AbortSignal.timeout(4000),
      headers: { Connection: 'close' },
    })
  ).json();
  const ws = new WebSocket(contexts[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const response = new Promise((resolve, reject) => {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 1)
        data.result?.exceptionDetails
          ? reject(Error(JSON.stringify(data)))
          : resolve(data.result.result.value);
    };
  });
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise,
        returnByValue: true,
      },
    }),
  );
  try {
    return await Promise.race([
      response,
      wait(5000).then(() => {
        throw Error('inspector request timed out');
      }),
    ]);
  } finally {
    ws.close();
  }
}
const approve = (inspectPort) =>
  inspect(
    inspectPort,
    `${electronExpression}.dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })`,
    false,
  );
const renderer = (inspectPort, expression) =>
  inspect(
    inspectPort,
    `${electronExpression}.webContents.getAllWebContents().find(w => w.getURL().startsWith('appdock://host/')).executeJavaScript(${JSON.stringify(expression)})`,
  );
async function surfaceRenderer(inspectPort, file, expression, selector) {
  const target = `${electronExpression}.webContents.getAllWebContents().find(w => w.getURL().endsWith('/shells/default/' + ${JSON.stringify(file)}))`;
  for (let i = 0; i < 150; i++) {
    const ready = await inspect(
      inspectPort,
      `${target}?.executeJavaScript(${JSON.stringify('!!document.querySelector(' + JSON.stringify(selector) + ')')}) ?? false`,
    );
    if (ready)
      return inspect(inspectPort, `${target}.executeJavaScript(${JSON.stringify(expression)})`);
    await wait(100);
  }
  throw Error('Shell surface not ready: ' + file + ' / ' + selector);
}
const settingsRenderer = (port, expression, selector = '.settings-categories') =>
  renderer(port, expression);
const ribbonRenderer = (port, expression) =>
  surfaceRenderer(port, 'index.html', expression, '.activity-rail');
async function restarted(inspectPort, predicate, previousPid) {
  const deadline = Date.now() + 60000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const snapshot = await renderer(inspectPort, 'window.dock.snapshot()');
      if (
        snapshot.startupReady &&
        predicate(snapshot) &&
        (previousPid === undefined || (await inspect(inspectPort, 'process.pid')) !== previousPid)
      )
        return snapshot;
    } catch (error) {
      lastError = String(error);
    }
    await wait(300);
  }
  throw Error('restarted host snapshot timed out: ' + (lastError || 'predicate was false'));
}
(async () => {
  async function freePort() {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
  }
  const port = await freePort();
  let inspectPort = await freePort();
  while (inspectPort === port) inspectPort = await freePort();
  fs.writeFileSync(path.join(profile, 'ports.json'), JSON.stringify({ port, inspectPort }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      `--test-profile=${profile}`,
      `--remote-debugging-port=${port}`,
      `--inspect=${inspectPort}`,
      '--enable-logging=file',
      `--log-file=${path.join(profile, 'electron.log')}`,
    ],
    { env, cwd: profile, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (data) =>
    fs.appendFileSync(path.join(profile, 'startup.stdout.log'), data),
  );
  child.stderr.on('data', (data) =>
    fs.appendFileSync(path.join(profile, 'startup.stderr.log'), data),
  );
  let connected;
  const keepAlive = setInterval(() => {}, 1000);
  try {
    connected = await connect(port);
    let { page } = connected;
    page = require('./settings-aware-page.cjs').settingsAwarePage(page);
    page.setDefaultTimeout(10000);
    const initial = await waitSnapshot(
      page,
      (snapshot) => !snapshot.updates.busy && snapshot.updates.results.length === 3,
    );
    assert.equal(initial.version, hostVersion);
    await waitSnapshot(
      page,
      (snapshot) =>
        snapshot.extensions.find((e) => e.id === 'appdock.dotnet-demo')?.state === 'running',
    );
    assert.equal(initial.extensions.find((e) => e.id === 'appdock.dotnet-demo').version, '1.0.0');
    assert.equal(initial.updates.results.filter((r) => r.status === 'available').length, 2);
    assert.equal(fs.existsSync(path.join(profile, 'data/update-result.json')), false);
    checks.push('startup checks metadata only, includes disabled Applet, and never installs');
    assert.equal(
      await inspect(
        inspectPort,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].isVisible()`,
      ),
      false,
    );
    await inspect(
      inspectPort,
      `${electronExpression}.BrowserWindow.getAllWindows()[0].show()`,
      false,
    );
    await about(page);
    assert.equal(await page.getByLabel('AppDockの更新元', { exact: true }).isVisible(), false);
    assert.equal(await page.locator('.about-page > .settings-section').count(), 5);
    assert.equal(await page.getByRole('button', { name: '更新を確認', exact: true }).count(), 0);
    assert.equal(
      await page.getByRole('button', { name: 'すべての更新を確認', exact: true }).count(),
      0,
    );
    assert.equal(await page.locator('.about-applets .applet-update-source').count(), 2);
    assert.equal(await page.locator('.about-applets').isVisible(), false);
    await page.getByText('インストール済みのApplet', { exact: true }).click();
    for (const control of await page.locator('.about-page .update-check-control').all()) {
      const button = await control.getByRole('button').boundingBox();
      const time = await control.locator('time').boundingBox();
      assert.ok(time.x >= button.x + button.width, 'last-check time is beside the update button');
      assert.ok(Math.abs(time.y + time.height / 2 - button.y - button.height / 2) < 2);
    }
    checks.push(
      'shared cards and update-only controls, per-target last-check times beside update buttons',
    );
    await page.screenshot({ path: path.join(profile, 'updates-collapsed-dark.png') });
    // Both source resets save immediately and preserve unrelated settings.
    const appletCard = page.locator('.about-applets article').filter({ hasText: 'test.disabled' });
    await appletCard.locator('.applet-update-source > summary').click();
    await appletCard.getByRole('button', { name: '既定に戻す', exact: true }).click();
    assert.equal(
      await appletCard.getByLabel('test.disabledの更新元', { exact: true }).inputValue(),
      '',
    );
    await settleSettings(page);
    assert.equal(
      await appletCard.getByLabel('test.disabledの更新元', { exact: true }).inputValue(),
      '',
    );
    await appletCard
      .getByLabel('test.disabledの更新元', { exact: true })
      .fill(path.join(profile, 'sources/test.disabled'));
    await settleSettings(page);
    await appletCard.locator('.applet-update-source > summary').click();
    await page.getByText('更新の設定', { exact: true }).click();
    await page.getByRole('button', { name: 'AppDockの更新元を既定に戻す', exact: true }).click();
    assert.equal(
      await page.getByLabel('AppDockの更新元', { exact: true }).inputValue(),
      'github:5ynonym/AppDock.at365',
    );
    checks.push(
      'collapsed settings, prominent actions, per-Applet sources, host/Applet default resets',
    );
    await page.getByLabel('AppDockの更新元', { exact: true }).fill(path.join(getPublishDirectory(root)));
    await page.getByLabel('AppDockの更新元', { exact: true }).press('Enter');
    await page.getByLabel('起動から確認までの秒数', { exact: true }).fill('1');

    await settleSettings(page);
    await waitSnapshot(page, (s) => s.settings.value.updates.startupDelaySeconds === 1);
    await page.screenshot({ path: path.join(profile, 'updates-settings.png') });
    await page.getByText('更新の設定', { exact: true }).click();
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'light';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.screenshot({ path: path.join(profile, 'updates-collapsed-light.png') });
    await inspect(
      inspectPort,
      `${electronExpression}.BrowserWindow.getAllWindows()[0].setSize(900, 720)`,
      false,
    );
    await wait(300);
    assert.equal(
      await page.locator('.settings-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    await page.screenshot({ path: path.join(profile, 'updates-compact.png') });
    await page.evaluate(() => window.dock.checkAllUpdates());
    await waitSnapshot(page, (s) => !s.updates.busy && s.updates.results.length === 3);
    checks.push(
      'settings save, shared check results, and immediate settings do not block update controls',
    );
    // Electron dialogs are native. Stub only the final approval UI; the real updater, shutdown, swap and restart all run.
    await approve(inspectPort);
    const combinedPid = await inspect(inspectPort, 'process.pid');
    await page.getByRole('button', { name: '本体と全Appletを更新', exact: true }).click();
    await wait(1500);
    const updated = await restarted(
      inspectPort,
      (snapshot) =>
        ['appdock.dotnet-demo', 'test.disabled'].every(
          (id) => snapshot.extensions.find((e) => e.id === id)?.version === '2.0.0',
        ),
      combinedPid,
    );
    assert.equal(updated.extensions.find((e) => e.id === 'appdock.dotnet-demo').enabled, true);
    await restarted(
      inspectPort,
      (snapshot) =>
        snapshot.extensions.find((e) => e.id === 'appdock.dotnet-demo')?.state === 'running',
    );
    assert.equal(updated.extensions.find((e) => e.id === 'test.disabled').enabled, false);
    assert.equal(
      updated.extensions.find((e) => e.id === 'appdock.default-shell').version,
      hostVersion,
    );
    const combined = JSON.parse(fs.readFileSync(path.join(profile, 'data/update-result.json')));
    assert.equal(combined.ok, true);
    assert.deepEqual(combined.updated.map((item) => item.id).sort(), [
      'appdock.dotnet-demo',
      'host',
      'test.disabled',
    ]);
    assert.notEqual(await inspect(inspectPort, 'process.pid'), combinedPid);
    assert.deepEqual(
      fs.readFileSync(executable),
      fs.readFileSync(path.join(getPublishDirectory(root), 'AppDock.at365.exe')),
    );
    assert.equal(
      fs.existsSync(path.join(profile, 'extensions/appdock.dotnet-demo/obsolete.dll')),
      false,
    );
    assert.equal(
      fs.readFileSync(path.join(profile, 'data/web-accounts/preserved.txt'), 'utf8'),
      'login-fixture',
    );
    assert.equal(
      updated.settings.value.extensions['appdock.dotnet-demo'].settings.preserved,
      'user-data',
    );
    assert.equal(
      await inspect(
        inspectPort,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].isVisible()`,
      ),
      true,
    );
    assert.equal(
      await settingsRenderer(inspectPort, "!!document.querySelector('.about-page')", '.about-page'),
      true,
    );
    checks.push('update restart overrides startMinimized and restores settings/about');
    checks.push(
      'combined button applies host and all Applets in one job/restart and preserves settings/login/enabled states',
    );
    await approve(inspectPort);
    const batchPid = await inspect(inspectPort, 'process.pid');
    await renderer(inspectPort, "void window.dock.installUpdates('applets')");
    await wait(1500);
    await restarted(inspectPort, (s) => !s.updates.busy, batchPid);
    const batch = JSON.parse(fs.readFileSync(path.join(profile, 'data/update-result.json')));
    assert.equal(batch.ok, true);
    assert.deepEqual(batch.updated.map((item) => item.id).sort(), [
      'appdock.dotnet-demo',
      'test.disabled',
    ]);
    checks.push('Applet-only batch keeps host out of the update job');
    await approve(inspectPort);
    const hostPid = await inspect(inspectPort, 'process.pid');
    await renderer(inspectPort, "void window.dock.installUpdates('host')");
    await wait(1500);
    await restarted(inspectPort, (s) => s.version === hostVersion && !s.updates.busy, hostPid);
    const result = JSON.parse(fs.readFileSync(path.join(profile, 'data/update-result.json')));
    assert.equal(result.ok, true);
    assert.equal(result.updated[0].id, 'host');
    assert.equal(
      fs.readFileSync(path.join(profile, 'data/web-accounts/preserved.txt'), 'utf8'),
      'login-fixture',
    );
    checks.push('real single-EXE host replacement and restart through the same helper');
    await ribbonRenderer(
      inspectPort,
      "[...document.querySelectorAll('.activity-rail button')].find(b => b.textContent.trim() === '設定').click()",
    );
    await wait(300);
    await settingsRenderer(
      inspectPort,
      "[...document.querySelectorAll('.settings-categories button')].find(b => b.textContent.trim() === 'バージョン情報・更新').click()",
    );
    await wait(300);
    await approve(inspectPort);
    const individualPid = await inspect(inspectPort, 'process.pid');
    await settingsRenderer(
      inspectPort,
      "(()=>{const button=[...document.querySelectorAll('.about-applets button')].find(b => b.textContent.trim() === 'このAppletを更新');button.closest('details.settings-section').querySelector('summary').click();button.click();})()",
    );
    await wait(1500);
    await restarted(inspectPort, (s) => !s.updates.busy, individualPid);
    const individual = JSON.parse(fs.readFileSync(path.join(profile, 'data/update-result.json')));
    assert.equal(individual.ok, true);
    assert.equal(individual.updated.length, 1);
    assert(['appdock.dotnet-demo', 'test.disabled'].includes(individual.updated[0].id));
    checks.push('individual Applet button with same-version reapply');
    // Ordinary restart restores another category and still shows the window.
    await settingsRenderer(
      inspectPort,
      "[...document.querySelectorAll('.settings-categories button')].find(b => b.textContent.trim() === '一般').click()",
    );
    await wait(200);
    const oldPid = await inspect(inspectPort, 'process.pid');
    await renderer(
      inspectPort,
      "setTimeout(() => void window.dock.executeCommand('appdock.restart'), 100); void 0",
    );
    await wait(2000);
    await restarted(inspectPort, (s) => s.version === hostVersion && s.startupReady, oldPid);
    assert.notEqual(await inspect(inspectPort, 'process.pid'), oldPid);
    assert.equal(
      await inspect(
        inspectPort,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].isVisible()`,
      ),
      true,
    );
    assert.equal(
      await settingsRenderer(
        inspectPort,
        "document.querySelector('.settings-categories button.selected')?.textContent.trim()",
      ),
      '一般',
    );
    checks.push(
      'ordinary restart restores selected category and shows window with tray-start enabled',
    );
    await renderer(inspectPort, "window.dock.toggleExtension('test.disabled', true)");
    await restarted(inspectPort, (s) =>
      s.extensions.some((e) => e.id === 'test.disabled' && e.state === 'running'),
    );
    const appletPid = await inspect(inspectPort, 'process.pid');
    await renderer(inspectPort, "window.dock.openAppletPage('test.disabled', 'main')");
    await wait(300);
    assert.equal(
      await ribbonRenderer(
        inspectPort,
        "document.querySelector('.activity-rail button.active')?.dataset.ribbonId",
      ),
      'page:test.disabled:main',
    );
    await renderer(
      inspectPort,
      "setTimeout(() => void window.dock.executeCommand('appdock.restart'), 100); void 0",
    );
    await wait(2000);
    await restarted(inspectPort, (s) => s.startupReady, appletPid);
    assert.notEqual(await inspect(inspectPort, 'process.pid'), appletPid);
    await wait(500);
    assert.equal(
      await ribbonRenderer(
        inspectPort,
        "document.querySelector('.activity-rail button.active')?.dataset.ribbonId",
      ),
      'page:test.disabled:main',
    );
    assert.equal(
      await renderer(inspectPort, "document.querySelector('.error-banner')?.textContent ?? ''"),
      '',
    );
    assert.equal(
      await inspect(
        inspectPort,
        `${electronExpression}.webContents.getAllWebContents().some(w => w.getURL().includes('/test.disabled/index.html'))`,
      ),
      true,
    );
    checks.push('ordinary restart restores the Applet page after activation');

    await inspect(inspectPort, `${electronExpression}.app.quit()`, false).catch(() => {});
    const resultFile = path.join(profile, 'result.json');
    fs.writeFileSync(resultFile, JSON.stringify({ ok: true, profile, checks }, null, 2));
    console.log(fs.readFileSync(resultFile, 'utf8'));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, profile, checks, error: String(error) }, null, 2),
    );
    throw error;
  } finally {
    clearInterval(keepAlive);
    try {
      await inspect(inspectPort, `${electronExpression}.app.quit()`, false);
    } catch {}
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

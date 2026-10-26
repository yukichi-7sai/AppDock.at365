const { getPublishDirectory } = require('./publish-paths.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { chromium } = require('playwright'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'update-result-banner-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const executable = path.join(profile, 'AppDock.at365.exe');
require('./copy-host.cjs').copyHost(path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe'), executable);
const initialHash = createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.gestures.enabled = false;
settings.updates.hostSource = path.join(getPublishDirectory(root));
settings.updates.allowSameVersion = true;
settings.notificationPreferences = {
  overrides: [{ ownerKind: 'host', ownerId: 'updates', typeId: 'applied', durationSeconds: null }],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect(port) {
  let last;
  for (let i = 0; i < 40; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2500 });
      let page;
      for (let attempt = 0; attempt < 100 && !page; attempt++) {
        page = browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url().startsWith('appdock://host/'));
        if (!page) await wait(200);
      }
      if (!page) {
        const urls = browser
          .contexts()
          .flatMap((context) => context.pages())
          .map((p) => p.url());
        await browser.close();
        throw Error('host renderer not ready: ' + JSON.stringify(urls));
      }
      await require('./shell-overlay-helper.cjs').startupPage(page);
      return { browser, page };
    } catch (error) {
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
    `${electronExpression}.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(expression)})`,
  );
async function restarted(inspectPort, predicate) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const snapshot = await renderer(inspectPort, 'window.dock.snapshot()');
      if (predicate(snapshot)) return snapshot;
    } catch {}
    await wait(300);
  }
  throw Error('restarted host snapshot timed out');
}
(async () => {
  const freePort = async () => {
    const s = net.createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const p = s.address().port;
    await new Promise((r) => s.close(r));
    return p;
  };
  const port = await freePort(),
    inspectPort = await freePort(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let child = spawn(
    executable,
    ['--test-profile=' + profile, '--remote-debugging-port=' + port, '--inspect=' + inspectPort],
    { env, cwd: profile, windowsHide: true, stdio: 'ignore' },
  );
  let browser;
  const checks = [];
  let success = false;
  const keepAlive = setInterval(() => {}, 1000);
  try {
    let connected = await connect(port);
    browser = connected.browser;
    const host = connected.page;
    await waitSnapshot(host, (s) => s.startupReady);
    await approve(inspectPort);
    await host.evaluate(() => {
      void window.dock.installUpdates('host');
    });

    await wait(1500);
    await restarted(inspectPort, (s) => s.startupReady && !s.updates.busy);
    const resultFile = path.join(profile, 'data', 'update-result.json');
    const until = async (fn, label) => {
      for (let n = 0; n < 100; n++) {
        try {
          const v = await fn();
          if (v) return v;
        } catch {}
        await wait(100);
      }
      throw Error(label);
    };
    await until(
      () => fs.existsSync(resultFile) && JSON.parse(fs.readFileSync(resultFile)).ok === true,
      'real helper result',
    );
    const result = JSON.parse(fs.readFileSync(resultFile));
    assert.equal(result.updated[0].id, 'host');
    assert.equal(
      createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
      initialHash,
    );
    checks.push(
      'real helper applies a same-version single EXE update and restarts the isolated copy',
    );
    // Chromium's CDP switch is not retained across normal Electron relaunch.
    // The explicit test main-inspector switch is retained; inspect the actual Shell WebContents.
    const state = await renderer(inspectPort, 'window.dock.snapshot()');
    assert.equal(state.updates.completion, undefined);
    const shellExpression = (suffix, expression) =>
      electronExpression +
      '.webContents.getAllWebContents().find(w=>w.getURL().endsWith(' +
      JSON.stringify(suffix) +
      ')).executeJavaScript(' +
      JSON.stringify(expression) +
      ')';
    const item = await until(
      () =>
        inspect(
          inspectPort,
          shellExpression(
            '/notifications.html',
            "window.appdockNotifications.connect().then(c=>c.snapshot.items.find(i=>i.ownerId==='updates'))",
          ),
        ),
      'real restarted banner',
    );
    assert.equal(item.typeId, 'applied');
    assert.equal(item.status, 'active');
    assert.equal(item.level, 'info');
    assert.equal(
      await inspect(
        inspectPort,
        shellExpression(
          '/notifications.html',
          "document.querySelector('[data-notification-id]').textContent.includes('更新を適用しました')",
        ),
      ),
      true,
    );
    assert.equal(
      await renderer(
        inspectPort,
        'document.querySelectorAll(\'[aria-label=\\"更新のお知らせ\\"]\').length',
      ),
      0,
    );
    assert.ok(fs.existsSync(path.join(profile, 'data', 'notifications', 'update-receipt.json')));
    checks.push(
      'actual post-update success is a typed info banner with its PC-local receipt, without statusbar duplication',
    );
    await inspect(
      inspectPort,
      shellExpression(
        '/notifications.html',
        "[...document.querySelectorAll('button')].find(b=>b.textContent==='更新画面を開く').click()",
      ),
    );
    await until(
      () =>
        inspect(
          inspectPort,
          `${electronExpression}.webContents.getAllWebContents().find(w => w.getURL().startsWith('appdock://host/')).executeJavaScript("!!document.querySelector('.settings-surface .about-page')")`,
        ),
      'normal update settings page',
    );
    checks.push('the real update banner action opens the normal updates page');
    await until(() => !fs.existsSync(result.temporaryDirectory), 'owned update temp cleanup');
    success = true;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    clearInterval(keepAlive);
    try {
      await inspect(inspectPort, electronExpression + '.app.quit()', false);
    } catch {}
    if (browser) await browser.close().catch(() => {});
    await wait(300);
    if (child.exitCode === null) child.kill();
    const result = {
      success,
      profile,
      checks,
      sha256: initialHash,
      version: require('../package.json').version,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

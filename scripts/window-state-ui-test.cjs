const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `window-state-${Date.now()}`);
const file = require('./test-settings.cjs').file(
  profile,
  `settings-${require('node:os').hostname()}.json`,
);
const application = require('./data-settings-host.cjs').isolatedHost(profile, process.argv[2]);
async function launch(show = true) {
  await application.start();
  const page = await application.firstWindow();
  await page.waitForFunction(async () => (await window.dock.snapshot()).startupReady);
  assert.equal(
    await page.evaluate(async () => (await window.dock.snapshot()).version),
    require('../package.json').version,
  );
  if (show) await page.evaluate(() => window.dock.executeCommand('appdock.open'));
  if (
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .isVisible(),
    )
  )
    await require('./shell-overlay-helper.cjs').startupPage(page);
}
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Window state did not settle');
}
const current = () =>
  application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    return {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      visible: window.isVisible(),
    };
  });
const saved = () =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).uiState?.windows?.host : null;
(async () => {
  try {
    await launch();
    await waitFor(async () => (await current()).visible);
    let expected = await application.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      const bounds = { x: area.x + 40, y: area.y + 40, width: 1000, height: 680 };
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .setBounds(bounds);
      return BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .getNormalBounds();
    });
    await waitFor(() => JSON.stringify(saved()?.bounds) === JSON.stringify(expected));
    await application.evaluate(() => {
      const modules = process
        .getBuiltinModule('module')
        .createRequire(process.resourcesPath + '/app.asar/package.json').cache;
      const { WindowStateStore } = Object.values(modules).find(
        (module) => module.exports?.WindowStateStore,
      ).exports;
      const flush = WindowStateStore.prototype.flush;
      globalThis.windowStateFlushCount = 0;
      WindowStateStore.prototype.flush = function () {
        try {
          return flush.call(this);
        } finally {
          globalThis.windowStateFlushCount++;
        }
      };
    });
    const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
    const externalPosition = { ...expected, x: expected.x + 20 };
    incoming.uiState.windows.host.bounds = externalPosition;
    const otherWindow = { bounds: expected, maximized: true };
    incoming.uiState.windows['test:other'] = otherWindow;
    incoming.hostPages.appearance.configuration.host ??= {};
    incoming.hostPages.appearance.configuration.host.theme = 'dark';
    fs.writeFileSync(file, JSON.stringify(incoming));
    await application.evaluate(
      ({ BrowserWindow }, bounds) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
          .setPosition(bounds.x, bounds.y);
      },
      { ...expected, x: expected.x + 40 },
    );
    await waitFor(() => application.evaluate(() => globalThis.windowStateFlushCount > 0));
    assert.deepEqual(saved().bounds, externalPosition, 'the conflicting capture is discarded');
    expected = await application.evaluate(({ BrowserWindow }, bounds) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      window.setPosition(bounds.x, bounds.y);
      return window.getNormalBounds();
    }, expected);
    await waitFor(() => JSON.stringify(saved()?.bounds) === JSON.stringify(expected));
    const recovered = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(recovered.uiState.windows['test:other'], otherWindow);
    assert.equal(recovered.hostPages.appearance.configuration.host.theme, 'dark');
    await application.close();
    await launch();
    await waitFor(async () => (await current()).visible);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .maximize(),
    );
    await waitFor(() => saved()?.maximized === true);
    await application.close();
    await launch();
    await waitFor(async () => (await current()).maximized);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .unmaximize(),
    );
    await waitFor(() => saved()?.maximized === false);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .minimize(),
    );
    await application.close();
    assert.deepEqual(saved(), { bounds: expected, maximized: false });
    await launch();
    await waitFor(async () => (await current()).visible);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
        .close(),
    );
    await waitFor(async () => !(await current()).visible);
    assert.deepEqual(saved(), { bounds: expected, maximized: false });
    await application.close();
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    (settings.hostPages.general.configuration.host ??= {}).startMinimized = true;
    settings.uiState.windows.host = { bounds: expected, maximized: true };
    fs.writeFileSync(file, JSON.stringify(settings));
    await launch(false);
    assert.equal((await current()).visible, false);
    await application.close();
    assert.deepEqual(saved(), { bounds: expected, maximized: true });
    const log = path.join(profile, 'data/logs', require('node:os').hostname(), 'host.log');
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /ウィンドウ状態の読み込み・保存に失敗/);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          mode: process.argv[2] ? 'fixed' : 'source',
          executableHash: application.executableHash,
          checks: [
            'restart bounds',
            'maximize/unmaximize',
            'minimize',
            'tray close',
            'hidden startup',
            'incoming position conflict recovery preserves settings and other windows',
          ],
          file,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: restart bounds, maximize/unmaximize, minimize, tray close, hidden startup, incoming position conflict recovery',
    );
  } finally {
    await application?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

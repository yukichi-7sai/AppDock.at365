const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `window-state-${Date.now()}`);
const file = require('./test-settings.cjs').file(
  profile,
  `settings-${require('node:os').hostname()}.json`,
);
const initialSettings = require('../out/main/shared/settings-schema.js').createDefaultSettings();
initialSettings.host.checkUpdatesOnStartup = false;
initialSettings.host.soundEnabled = false;
initialSettings.updates.checkHostOnAboutOpen = false;
initialSettings.keybindingOptions.enabled = false;
initialSettings.gestures.enabled = false;
initialSettings.touchpadGestures.enabled = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(initialSettings));
const application = require('./data-settings-host.cjs').isolatedHost(profile, process.argv[2]);
async function launch(show = true) {
  await application.start();
  const page = await application.firstWindow();
  await require('./settings-host-helper.cjs').waitForHost(
    page,
    async () => (await window.dock.snapshot()).startupReady,
  );
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
    const initial = await application.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const minimum = window.getMinimumSize();
      const initialBounds = window.getNormalBounds();
      window.setSize(600, 400);
      return { area, minimum, initialBounds, bounds: window.getNormalBounds() };
    });
    assert.deepEqual(initial.minimum, [900, 620]);
    assert(initial.bounds.width >= initial.minimum[0]);
    assert(initial.bounds.height >= initial.minimum[1]);
    const page = await application.firstWindow();
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await require('./settings-host-helper.cjs').settingsPage(page);
    await page.getByTestId('settings-nav:tray').click();
    await page.getByTestId('settings-page:tray').waitFor();
    await page.getByRole('button', { name: 'トレイクリックのコマンドを選択', exact: true }).click();
    const dialog = require('./command-selection-helper.cjs').selectionDialog(page);
    await dialog.waitFor();
    await dialog.getByRole('combobox', { name: 'コマンドを検索' }).fill('appdock.noop');
    await dialog.getByRole('listbox').getByRole('option').click();
    const checkDialog = async (name) => {
      const confirm = dialog.getByTestId('command-selection-confirm');
      assert(await confirm.isEnabled());
      const bounds = await confirm.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert(bounds.x >= 0 && bounds.y >= 0);
      assert(bounds.x + bounds.width <= viewport.width + 1);
      assert(bounds.y + bounds.height <= viewport.height + 1);
      assert(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      await dialog.screenshot({ path: path.join(profile, name + '.png') });
    };
    await checkDialog('minimum-dialog');
    const reference = await application.evaluate(({ BrowserWindow, app }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      const requireMain = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      requireMain('./out/main/main/core/window-state.js').restoreWindowBounds(window, {
        ...window.getNormalBounds(),
        width: 1720,
        height: 1000,
      });
      return { bounds: window.getNormalBounds(), pageZoom: window.webContents.getZoomFactor() };
    });
    assert.equal(reference.bounds.width, 1720);
    assert.equal(reference.bounds.height, 1000);
    await checkDialog('reference-dialog');
    const small = await application.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      const display = screen.getDisplayMatching(window.getBounds());
      globalThis.windowTestDisplayMatching = screen.getDisplayMatching;
      const before = window.getNormalBounds();
      const workArea = { ...display.workArea, width: 800, height: 500 };
      screen.getDisplayMatching = () => ({ ...display, workArea });
      screen.emit('display-metrics-changed', {}, { ...display, workArea }, ['workArea']);
      window.setPosition(workArea.x + 20, workArea.y + 20);
      return {
        before,
        minimum: window.getMinimumSize(),
        bounds: window.getNormalBounds(),
        workArea,
        scaleFactor: display.scaleFactor,
      };
    });
    assert.deepEqual(small.minimum, [900, 620]);
    // Moving a native window can round its DIP size by one at fractional scaling.
    assert(Math.abs(small.bounds.width - small.before.width) <= 1);
    assert(Math.abs(small.bounds.height - small.before.height) <= 1);
    const restoredMinimum = await application.evaluate(({ BrowserWindow, screen }) => {
      screen.getDisplayMatching = globalThis.windowTestDisplayMatching;
      delete globalThis.windowTestDisplayMatching;
      screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), ['workArea']);
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      return window.getMinimumSize();
    });
    assert.deepEqual(restoredMinimum, initial.minimum);
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    let expected = await application.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      const bounds = { x: area.x + 40, y: area.y + 40, width: 1240, height: 680 };
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
    incoming.hostPages.appearance = {
      useLocalSettings: true,
      configuration: { host: { theme: 'dark' } },
    };
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
    settings.hostPages.general = {
      useLocalSettings: true,
      configuration: { host: { startMinimized: true } },
    };
    settings.uiState.windows.host = { bounds: expected, maximized: true };
    fs.writeFileSync(file, JSON.stringify(settings));
    await launch(false);
    assert.equal((await current()).visible, false);
    await application.close();
    assert.deepEqual(saved(), { bounds: expected, maximized: true });
    const offscreenSettings = JSON.parse(fs.readFileSync(file, 'utf8'));
    offscreenSettings.hostPages.general.configuration.host.startMinimized = false;
    offscreenSettings.uiState.windows.host = {
      bounds: { ...expected, x: 99999, y: 99999 },
      maximized: false,
    };
    fs.writeFileSync(file, JSON.stringify(offscreenSettings));
    await launch();
    await waitFor(async () => (await current()).visible);
    const positionRecovered = await current();
    // Position recovery at a display edge may round by one DIP, but repeated
    // startup must preserve the resulting size rather than keep growing it.
    assert(Math.abs(positionRecovered.bounds.width - expected.width) <= 1);
    assert(Math.abs(positionRecovered.bounds.height - expected.height) <= 1);
    assert(
      positionRecovered.bounds.x >= initial.area.x &&
        positionRecovered.bounds.x < initial.area.x + initial.area.width,
    );
    assert(
      positionRecovered.bounds.y >= initial.area.y &&
        positionRecovered.bounds.y < initial.area.y + initial.area.height,
    );
    await application.close();
    await launch();
    const recoveryRestart = await current();
    assert.equal(recoveryRestart.bounds.width, positionRecovered.bounds.width);
    assert.equal(recoveryRestart.bounds.height, positionRecovered.bounds.height);
    await application.close();
    const log = path.join(profile, 'data/logs', require('node:os').hostname(), 'host.log');
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /ウィンドウ状態の読み込み・保存に失敗/);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          mode: process.argv[2] ? 'fixed' : 'source',
          executableHash: application.executableHash,
          initial,
          reference,
          small,
          savedBounds: expected,
          positionRecovered,
          recoveryRestart,
          checks: [
            'initial bounds and native minimum size',
            'command selection remains operable at 900x620 and reference 1720x1000',
            'work area changes and window movement preserve size and fixed minimum',
            'restart bounds',
            'maximize/unmaximize',
            'minimize',
            'tray close',
            'hidden startup',
            'incoming position conflict recovery preserves settings and other windows',
            'offscreen saved position recovers without resizing',
          ],
          file,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: fixed minimum, no auto resize, minimum/reference dialog, restart bounds, maximize/unmaximize, minimize, tray close, hidden startup, incoming position conflict recovery, offscreen position recovery',
    );
  } finally {
    await application?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
    const expected = await application.evaluate(({ BrowserWindow, screen }) => {
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
          ],
          file,
        },
        null,
        2,
      ),
    );
    console.log('PASS: restart bounds, maximize/unmaximize, minimize, tray close, hidden startup');
  } finally {
    await application?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

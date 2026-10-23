const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `window-state-${Date.now()}`);
const file = path.join(profile, 'data', 'window-state.json');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application;
async function launch() {
  application = await electron.launch({
    executablePath: require('electron'),
    args: [root, `--test-profile=${profile}`],
    env,
    timeout: 30000,
  });
  const page = await application.firstWindow();
  await page.waitForFunction(async () => (await window.dock.snapshot()).startupReady);
  if (
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
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
    const window = BrowserWindow.getAllWindows()[0];
    return {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      visible: window.isVisible(),
    };
  });
const saved = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
(async () => {
  try {
    await launch();
    await waitFor(async () => (await current()).visible);
    const expected = await application.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      const bounds = { x: area.x + 40, y: area.y + 40, width: 1000, height: 680 };
      BrowserWindow.getAllWindows()[0].setBounds(bounds);
      return BrowserWindow.getAllWindows()[0].getNormalBounds();
    });
    await waitFor(() => JSON.stringify(saved()?.bounds) === JSON.stringify(expected));
    await application.close();
    await launch();
    await waitFor(async () => (await current()).visible);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await waitFor(() => saved()?.maximized === true);
    await application.close();
    await launch();
    await waitFor(async () => (await current()).maximized);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].unmaximize(),
    );
    await waitFor(() => saved()?.maximized === false);
    assert.deepEqual((await current()).bounds, expected);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await application.close();
    assert.deepEqual(saved(), { bounds: expected, maximized: false });
    await launch();
    await waitFor(async () => (await current()).visible);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await waitFor(async () => !(await current()).visible);
    assert.deepEqual(saved(), { bounds: expected, maximized: false });
    await application.close();
    const settingsFile = path.join(profile, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    settings.host.startMinimized = true;
    fs.writeFileSync(settingsFile, JSON.stringify(settings));
    fs.writeFileSync(file, JSON.stringify({ bounds: expected, maximized: true }));
    await launch();
    assert.equal((await current()).visible, false);
    await application.close();
    assert.deepEqual(saved(), { bounds: expected, maximized: true });
    console.log('PASS: restart bounds, maximize/unmaximize, minimize, tray close, hidden startup');
  } finally {
    await application?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

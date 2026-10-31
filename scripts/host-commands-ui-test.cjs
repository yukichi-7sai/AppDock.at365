const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `host-commands-${Date.now()}`);
const fixtureId = 'test.host-lifecycle';
const fixture = path.join(profile, 'extensions', fixtureId);
const eventsFile = path.join(profile, 'lifecycle-events.json');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: fixtureId,
    name: 'Lifecycle fixture',
    version: '0.1.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: [],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `
const fs = require('node:fs');
const file = ${JSON.stringify(eventsFile)};
function record(event) {
  const events = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  fs.writeFileSync(file, JSON.stringify([...events, { event, host: process.ppid, worker: process.pid }]));
}
exports.activate = async () => { record('start'); };
exports.deactivate = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  record('stop');
};
`,
);
const { createDefaultSettings } = require('../out/main/shared/settings-schema.js');
const settings = createDefaultSettings();
settings.extensions[fixtureId] = { enabled: true, settings: {} };
settings.shortcuts['appdock.quit'] = ['Ctrl+Alt+Q'];
settings.trayCommands = ['appdock.restart', 'appdock.quit'];
settings.host.trayDoubleClickCommand = 'appdock.restart';
const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const portable = !!process.argv[2];
const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const events = () => (fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile)) : []);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until(callback, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for host lifecycle');
}
let browser;
let child;
let output = '';
(async () => {
  try {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    child = spawn(
      executable,
      [
        ...(portable ? [] : [root]),
        `--test-profile=${profile}`,
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${port}`,
      ],
      { cwd: root, env, stdio: 'pipe', windowsHide: true },
    );
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (error) => console.error(error));
    async function connect(starts) {
      await until(() => events().filter((e) => e.event === 'start').length === starts);
      await until(async () => {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
          return true;
        } catch {
          return false;
        }
      });
      let page;
      await until(
        () =>
          (page = browser
            .contexts()[0]
            .pages()
            .find(
              (p) =>
                p.url().startsWith('appdock://host/index.html') &&
                !p.url().endsWith('/notifications.html'),
            )),
      );
      await page.waitForFunction(
        (id) =>
          window.dock
            .snapshot()
            .then((s) => s.extensions.some((e) => e.id === id && e.state === 'running')),
        fixtureId,
      );
      // Exercise the public show command before waiting for a visible native page surface.
      await page.evaluate(() => window.dock.executeCommand('appdock.open'));
      await require('./shell-overlay-helper.cjs').startupPage(page);
      assert.equal(
        await page.evaluate(() => window.dock.snapshot().then((s) => s.dataDirectory)),
        path.join(profile, 'data'),
      );
      return page;
    }
    let page = await connect(1);
    // Startup may migrate older settings; subsequent restarts must preserve that result.
    const migratedSettings = fs.readFileSync(settingsFile, 'utf8');
    const originalHost = events()[0].host;
    const originalWorker = events()[0].worker;
    await page.keyboard.press('Control+p');
    let palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    const search = palette.getByRole('combobox', { name: 'コマンドを検索' });
    await search.fill('appdock.restart');
    await palette.getByRole('option').filter({ hasText: '再起動' }).waitFor();
    await palette.screenshot({ path: path.join(profile, 'restart-command.png') });
    await require('./shell-overlay-helper.cjs').closingAction(search.press('Enter'));
    await until(() => !browser.isConnected());
    page = await connect(2);
    await until(() => !alive(originalHost) && !alive(originalWorker));
    assert.deepEqual(
      events().map((e) => e.event),
      ['start', 'stop', 'start'],
    );
    assert.notEqual(events()[2].host, originalHost);
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), migratedSettings);
    // Concurrent requests must schedule only one relaunch. Saved settings apply on startup.
    await page.evaluate(async () => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.host.startMinimized = true;
      snapshot.settings.value.host.hardwareAcceleration = false;
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    });
    const saved = fs.readFileSync(settingsFile, 'utf8');
    const secondHost = events()[2].host;
    await page.evaluate(() => {
      setTimeout(() => {
        void window.dock.executeCommand('appdock.restart');
        void window.dock.executeCommand('appdock.restart');
      }, 50);
    });
    await until(() => !browser.isConnected());
    page = await connect(3);
    await until(() => !alive(secondHost));
    assert.deepEqual(
      events().map((e) => e.event),
      ['start', 'stop', 'start', 'stop', 'start'],
    );
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), saved);
    await page.keyboard.press('Control+p');
    palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await palette.getByRole('combobox', { name: 'コマンドを検索' }).fill('appdock.quit');
    await palette.getByRole('option').filter({ hasText: '終了' }).waitFor();
    await require('./shell-overlay-helper.cjs').closingAction(palette.keyboard.press('Escape'));
    await until(async () => !(await page.evaluate(() => window.dock.snapshot())).overlay.active);
    await page.keyboard.press('Control+Alt+q');
    await until(() => !browser.isConnected());
    await until(
      () => events().length === 6 && events().every((e) => !alive(e.host) && !alive(e.worker)),
    );
    assert.deepEqual(
      events().map((e) => e.event),
      ['start', 'stop', 'start', 'stop', 'start', 'stop'],
    );
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), saved);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, portable, events: events() }, null, 2),
    );
    console.log(
      JSON.stringify({
        ok: true,
        portable,
        profile,
        checks:
          'palette restart, new host PID, repeated restart guard, saved settings, shortcut quit, awaited Applet deactivate, no surviving host or worker',
      }),
    );
  } catch (error) {
    console.error(error);
    if (output) console.error(output);
    process.exitCode = 1;
  } finally {
    if (browser?.isConnected()) {
      const page = browser
        .contexts()[0]
        .pages()
        .find(
          (p) =>
            p.url().startsWith('appdock://host/index.html') &&
            !p.url().endsWith('/notifications.html'),
        );
      await page
        ?.evaluate(() => {
          void window.dock.windowAction('quit');
        })
        .catch(() => {});
      await browser.close().catch(() => {});
    }
    // Cleanup is restricted to process IDs observed in this isolated fixture.
    for (const pid of new Set(
      events()
        .flatMap((e) => [e.host, e.worker])
        .concat(child?.pid || []),
    )) {
      if (alive(pid)) {
        try {
          execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } catch {}
      }
    }
  }
})();

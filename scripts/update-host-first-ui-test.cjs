const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { launch, until } = require('./page-test-host.cjs');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const settingsFiles = require('./test-settings.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `update-host-first-${Date.now()}`);
const installed = path.join(profile, 'extensions', 'fixture');
fs.mkdirSync(installed, { recursive: true });
fs.writeFileSync(
  path.join(installed, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture',
    name: 'Host-first fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
  }),
);
fs.writeFileSync(path.join(installed, 'index.js'), 'exports.activate = async () => {};');
const feeds = {
  '/host.json': {
    schemaVersion: 1,
    kind: 'host',
    id: 'host',
    version: '999.0.0',
    payload: { file: 'host.exe', format: 'exe', sha256: 'a'.repeat(64), size: 3 },
  },
  '/applet.json': {
    schemaVersion: 1,
    kind: 'applet',
    id: 'fixture',
    version: '2.0.0',
    minimumHostVersion: '999.0.0',
    payload: { file: 'applet.zip', format: 'zip', sha256: 'b'.repeat(64), size: 1 },
  },
};
const requests = [];
const server = http.createServer((request, response) => {
  requests.push(request.url);
  if (feeds[request.url]) return response.end(JSON.stringify(feeds[request.url]));
  // Deliberately invalid host bytes exercise the real download/hash path without applying
  // to the shared fixed runtime. Successful handoff and restoration use updater unit fixtures.
  if (request.url === '/host.exe') return response.end('bad');
  response.writeHead(404);
  response.end();
});
const payloadRequests = () => requests.filter((url) => !url.endsWith('.json'));
let session;
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.host.hardwareAcceleration = false;
    settings.host.soundEnabled = false;
    settings.host.notifications = false;
    settings.host.startMinimized = false;
    settings.gestures.activateOnStart = false;
    settings.globalShortcutCommands = [];
    settings.updates.hostSource = `http://127.0.0.1:${server.address().port}/host.json`;
    settings.updates.checkHostOnAboutOpen = false;
    settings.updates.checkHostOnStartup = false;
    settings.updates.checkAppletsOnStartup = false;
    settings.extensions.fixture = {
      enabled: false,
      settings: {},
      updateSource: `http://127.0.0.1:${server.address().port}/applet.json`,
    };
    settingsFiles.write(profile, settings);
    const device = JSON.parse(fs.readFileSync(settingsFiles.deviceFile(profile)));
    device.hostPages.about = {
      useLocalSettings: true,
      configuration: { updates: settings.updates },
    };
    fs.writeFileSync(settingsFiles.deviceFile(profile), JSON.stringify(device));
    session = await launch(profile, process.argv[2]);
    const page = settingsAwarePage(session.main);
    await session.main.evaluate(() => window.dock.executeCommand('appdock.settings.applets.open'));
    await session.main.evaluate(() => window.dock.checkAllUpdates());
    const row = page.locator('[data-applet-id="fixture"]');
    await row
      .getByText('必要な本体バージョンが不足しています。先に本体を更新してください。', {
        exact: true,
      })
      .waitFor();
    await session.main.evaluate(() => window.dock.executeCommand('appdock.updates.open'));
    await session.app.evaluate(({ dialog }) => {
      globalThis.hostFirstDialogs = [];
      dialog.showMessageBox = async (...args) => {
        globalThis.hostFirstDialogs.push(args.at(-1));
        return new Promise((resolve) => {
          globalThis.answerHostFirst = resolve;
        });
      };
    });
    const all = page.getByRole('button', { name: 'AppDockとAppletをすべて更新', exact: true });
    await all.click();
    await until(
      () => session.app.evaluate(() => globalThis.hostFirstDialogs.length === 1),
      'host-first confirmation',
    );
    assert.deepEqual(payloadRequests(), []);
    const dialog = await session.app.evaluate(() => globalThis.hostFirstDialogs[0]);
    assert.equal(dialog.title, 'AppDockを先に更新');
    assert.deepEqual(dialog.buttons, ['AppDockだけを更新', 'キャンセル']);
    assert.match(dialog.message, /再起動後.*もう一度「AppDockとAppletをすべて更新」/);
    assert.match(dialog.detail, /AppDock .* → 999\.0\.0/);
    assert(!dialog.detail.includes('Host-first fixture'));
    assert.equal(dialog.cancelId, 1);
    await session.app.evaluate(() => globalThis.answerHostFirst({ response: 1 }));
    await until(
      async () => !(await session.main.evaluate(() => window.dock.snapshot())).updates.busy,
      'cancelled',
    );
    const cancelled = (await session.main.evaluate(() => window.dock.snapshot())).updates;
    assert.equal(cancelled.notice.kind, 'info');
    assert.match(cancelled.notice.message, /再起動後.*もう一度/);
    assert.deepEqual(payloadRequests(), []);
    await all.click();
    await until(
      () => session.app.evaluate(() => globalThis.hostFirstDialogs.length === 2),
      'second host-first confirmation',
    );
    assert.deepEqual(payloadRequests(), []);
    await session.app.evaluate(() => globalThis.answerHostFirst({ response: 0 }));
    await until(
      async () => !(await session.main.evaluate(() => window.dock.snapshot())).updates.busy,
      'host payload checked',
    );
    assert.deepEqual(payloadRequests(), ['/host.exe']);
    assert.equal(
      await session.app.evaluate(() => globalThis.hostFirstDialogs.length),
      2,
      'No second approval for host-only update',
    );
    const rejected = (await session.main.evaluate(() => window.dock.snapshot())).updates;
    assert.match(rejected.notice.message, /ハッシュ/);
    assert.equal(rejected.notice.kind, 'error', 'Actual integrity failures remain errors');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(installed, 'extension.json'))).version,
      '1.0.0',
    );
    feeds['/host.json'].version = require('../package.json').version;
    const requestsBefore = payloadRequests().length;
    await all.click();
    await until(async () => {
      const state = (await session.main.evaluate(() => window.dock.snapshot())).updates;
      return !state.busy && state.notice?.kind === 'info';
    }, 'no suitable host update guidance');
    assert.equal(payloadRequests().length, requestsBefore);
    assert.equal(await session.app.evaluate(() => globalThis.hostFirstDialogs.length), 2);
    const result = {
      ok: true,
      profile,
      executableSha256: session.hash,
      dialog,
      requests,
      checks: [
        'management incompatibility message',
        'all-updates button opens host-only confirmation',
        'cancel without payload or restart',
        'one approval downloads host only',
        'host hash failure stops before applying',
        'Applet unchanged',
        'unavailable host shows guidance',
      ],
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (session) await session.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

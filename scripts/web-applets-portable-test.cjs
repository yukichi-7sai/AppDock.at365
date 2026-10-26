const { getPublishDirectory } = require('./publish-paths.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { freePort } = require('./electron-main-helper.cjs');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'web-portable-' + Date.now());
const development = process.argv.includes('--development');
const source = development
  ? require('electron')
  : path.resolve(process.argv[2] || path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe'));
const executable = development ? source : path.join(profile, 'AppDock.at365.exe');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(profile, { recursive: true });
if (!development) require('./copy-host.cjs').copyHost(source, executable);
const sha256 = hash(source);
assert.equal(hash(executable), sha256);
fs.cpSync(
  path.resolve(
    process.env.APPDOCK_WEB_APPLET_TEST_SOURCE ??
      path.resolve(root, '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet'),
  ),
  path.join(profile, 'extensions/at365.web-applet'),
  { recursive: true },
);
let holdMetadata = false;
const waitingMetadata = [];
function metadata(response) {
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify({
      name: '配布物のWeb',
      start_url: '/start',
      icons: [{ src: '/icon.png' }],
      appdock: { schemaVersion: 1, navigation: 'same-origin' },
    }),
  );
}
const fixture = http.createServer((request, response) => {
  if (request.url === '/.well-known/appdock.json') {
    if (holdMetadata) {
      waitingMetadata.push(response);
      return;
    }
    return metadata(response);
  }
  if (request.url === '/icon.png') {
    response.setHeader('content-type', 'image/png');
    return response.end(fs.readFileSync(path.join(root, 'assets/icon.png')));
  }
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    '<h1>Portable fixture</h1><input aria-label="保持する入力"><a href="/next">次へ</a>',
  );
});
async function until(work, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      const result = await work();
      if (result) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw Error(label);
}
let browser, child, dock, port;
const checks = [];
const pages = () => browser.contexts().flatMap((context) => context.pages());
const snapshot = () => dock.evaluate(() => window.dock.snapshot());
async function start() {
  const debugPort = await freePort(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    executable,
    [
      ...(development ? [root] : []),
      '--test-profile=' + profile,
      '--test-local-state=' + path.join(profile, 'local'),
      '--remote-debugging-port=' + debugPort,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
  browser = await until(
    () => chromium.connectOverCDP('http://127.0.0.1:' + debugPort, { timeout: 1000 }),
    'CDP',
  );
  dock = await until(
    () => pages().find((page) => page.url().startsWith('appdock://host/')),
    'host',
  );
  await until(
    async () =>
      (await snapshot()).startupReady &&
      (await snapshot()).extensions.some(
        (item) => item.id === 'at365.web-applet' && item.state === 'running',
      ),
    'Applet running',
  );
}
async function stop() {
  await dock.evaluate(() => {
    void window.dock.executeCommand('appdock.quit');
  });
  await until(() => child.exitCode !== null, 'shutdown');
  await browser.close().catch(() => {});
  browser = child = null;
}
(async () => {
  try {
    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
    port = fixture.address().port;
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.host.hardwareAcceleration = false;
    settings.host.notifications = false;
    settings.keybindings = [];
    settings.globalShortcutCommands = [];
    settings.gestures.enabled = false;
    const owner = 'at365.web-applet';
    settings.extensions[owner] = { enabled: true, settings: {} };
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    await start();
    assert.equal((await snapshot()).version, require('../package.json').version);
    assert.deepEqual(
      (await snapshot()).extensions.find((item) => item.id === owner).pages ?? [],
      [],
    );
    assert(
      !(await snapshot()).extensions
        .find((item) => item.id === owner)
        .commands.some((command) => command.id === owner + '.manage'),
    );
    await dock.evaluate(() => window.dock.createWebAccount('個人用'));
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    let ui = await settingsPage(dock);
    const field = (key, part, control) =>
      ui.getByTestId(
        'setting:applet%3A' +
          owner +
          '/setting%3A' +
          key +
          (control ? '/' + part : '') +
          ':' +
          (control ?? part),
      );
    const own = async () => (await snapshot()).settings.value.extensions[owner].settings;
    const images = () => dock.evaluate(() => window.dock.imageLibrary.snapshot());
    const imageCount = (await images()).images.length;
    const fetchDone = () =>
      until(
        async () => !(await field('items', 'draft-action').getAttribute('aria-busy')),
        'metadata finished',
      );
    const cancel = () => ui.getByTestId('settings-dialog-cancel').click();
    const base = 'http://127.0.0.1:' + port;
    await ui.getByTestId('settings-nav:applet:' + owner).click();
    await field('items', 'add').click();
    await field('items', 'url', 'input').fill(base + '/');
    await field('items', 'draft-action').click();
    await until(
      async () => (await field('items', 'name', 'input').inputValue()) === '配布物のWeb',
      'metadata in settings dialog',
    );
    await fetchDone();
    assert.equal((await own()).items?.length ?? 0, 0);
    assert.equal((await images()).images.length, imageCount);
    await cancel();
    assert.equal((await own()).items?.length ?? 0, 0);
    assert.equal((await images()).images.length, imageCount);
    checks.push('settings-only management; suggestions and image remain unsaved on cancellation');
    await field('items', 'add').click();
    await field('items', 'url', 'input').fill(base + '/');
    await field('items', 'name', 'input').fill('手動名');
    await field('items', 'draft-action').click();
    await fetchDone();
    assert.equal(await field('items', 'name', 'input').inputValue(), '手動名');
    assert.equal(await field('items', 'url', 'input').inputValue(), base + '/start');
    assert.equal((await images()).images.length, imageCount);
    await ui.getByTestId('settings-dialog-confirm').click();
    await until(async () => (await own()).items?.length === 1, 'suggestions saved on OK');
    assert((await own()).items[0].image?.file);
    assert.equal((await images()).images.length, imageCount + 1);
    checks.push('metadata preserves manual name and imports suggested image only on OK');
    const storedImage = structuredClone((await own()).items[0].image);
    await field('items', 'list:edit:' + (await own()).items[0].id).click();
    await field('items', 'draft-action').click();
    await fetchDone();
    await ui.getByTestId('settings-dialog-confirm').click();
    await until(
      async () => !(await ui.getByTestId('settings-dialog').count()),
      'edited suggestions saved',
    );
    assert.deepEqual((await own()).items[0].image, storedImage);
    assert.equal((await images()).images.length, imageCount + 1);
    checks.push('an already selected library image is retained when fetching suggestions');
    const legacyIcon =
      'data:image/png;base64,' +
      fs.readFileSync(path.join(root, 'assets/icon.png')).toString('base64');
    await dock.evaluate(async (icon) => {
      const state = await window.dock.snapshot();
      const row = state.settings.value.extensions['at365.web-applet'].settings.items[0];
      row.image = null;
      row.icon = icon;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, legacyIcon);
    // The fixture changes host state directly; reopen the form after its projection refreshes.
    await ui.getByTestId('settings-nav:general').click();
    await ui.getByTestId('settings-page:general').waitFor();
    await ui.getByTestId('settings-nav:applet:' + owner).click();
    await ui.getByTestId('settings-page:applet:' + owner).waitFor();
    await field('items', 'list:edit:' + (await own()).items[0].id).click();
    await field('items', 'draft-action').click();
    await fetchDone();
    await ui.getByTestId('settings-dialog-confirm').click();
    await until(
      async () => !(await ui.getByTestId('settings-dialog').count()),
      'legacy image retained',
    );
    assert.equal((await own()).items[0].icon, legacyIcon);
    assert.equal((await own()).items[0].image, null);
    assert.equal((await images()).images.length, imageCount + 1);
    checks.push('legacy icon data is retained without replacing it with a fetched image');
    for (const edit of ['name', 'url']) {
      await field('items', 'add').click();
      await field('items', 'url', 'input').fill(base + '/');
      holdMetadata = true;
      await field('items', 'draft-action').click();
      await until(() => waitingMetadata.length === 1, 'held metadata');
      const next = edit === 'name' ? '取得中の手入力' : base + '/changed';
      await field('items', edit, 'input').fill(next);
      holdMetadata = false;
      metadata(waitingMetadata.shift());
      await fetchDone();
      assert.equal(await field('items', edit, 'input').inputValue(), next);
      await cancel();
      assert.equal((await own()).items.length, 1);
    }
    checks.push('unconfirmed text during fetch is retained; changed URL rejects stale suggestions');
    const item = (await snapshot()).extensions.find((item) => item.displayName === '手動名');
    assert(item.collection);
    await dock.evaluate((id) => window.dock.openAppletPage(id, 'main'), item.id);
    let remote = await until(() => pages().find((page) => page.url().startsWith(base)), 'remote');
    await remote.getByLabel('保持する入力').fill('保持');
    await remote.evaluate(() => {
      document.cookie = 'portable_login=retained; Max-Age=3600';
    });
    assert.deepEqual(
      await remote.evaluate(() => [typeof require, typeof window.appletPage, typeof window.dock]),
      ['undefined', 'undefined', 'undefined'],
    );
    await dock.evaluate(async (id) => {
      const state = await window.dock.snapshot();
      state.settings.value.extensions['at365.web-applet'].settings.items.find(
        (row) => row.id === id,
      ).display = 'window';
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, item.collection.itemId);
    assert.equal(await remote.getByLabel('保持する入力').inputValue(), '保持');
    checks.push('page/window preserves View; remote has no bridge');
    await stop();
    await start();
    await dock.evaluate((id) => window.dock.openAppletPage(id, 'main'), item.id);
    remote = await until(() => pages().find((page) => page.url().startsWith(base)), 'restart page');
    assert((await remote.evaluate(() => document.cookie)).includes('portable_login=retained'));
    checks.push('restart preserves site identity and real Cookie');
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    ui = await settingsPage(dock);
    await ui.getByTestId('settings-nav:applet:' + owner).click();
    await field('items', 'list:edit:' + item.collection.itemId).click();
    assert.equal(await field('items', 'name', 'input').inputValue(), '手動名');
    await cancel();
    await dock.evaluate(() => window.dock.toggleExtension('at365.web-applet', false));
    await until(() => !pages().some((page) => page.url().startsWith(base)), 'stop cleanup');
    checks.push('settings reopen and parent stop cleanup without a manager page');
    await stop();
    assert.equal(hash(executable), sha256);
    assert.equal(hash(source), sha256);
    const result = {
      ok: true,
      profile,
      mode: development ? 'source' : 'fixed',
      sha256,
      checks,
      appletVersion: JSON.parse(
        fs.readFileSync(path.join(profile, 'extensions/at365.web-applet/extension.json')),
      ).version,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    if (dock) {
      const errorUi = await settingsPage(dock).catch(() => null);
      const dialog = await errorUi
        ?.getByTestId('settings-dialog')
        .innerText()
        .catch(() => '');
      fs.writeFileSync(path.join(profile, 'dialog-error.txt'), dialog ?? '');
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, error: String(error), checks }, null, 2),
    );
    if (browser && dock) await stop().catch(() => {});
    process.exitCode = 1;
  } finally {
    for (const response of waitingMetadata) response.destroy();
    await new Promise((resolve) => fixture.close(resolve));
  }
})();

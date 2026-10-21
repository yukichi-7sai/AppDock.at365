const { settleSettings } = require('./settings-immediate-helper.cjs');
// Old settings with a missing/empty roster, using isolated local state and no live accounts.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const output = path.join(root, '.artifacts', `web-account-recovery-${Date.now()}`);
const base = path.join(output, 'placement'),
  localAppData = path.join(output, 'LocalAppData');
const local = portable
  ? path.join(
      localAppData,
      'at365',
      'AppDock',
      'profiles',
      createHash('sha256').update(base.toLowerCase()).digest('hex'),
    )
  : path.join(output, 'local-state');
const settingsFile = path.join(base, 'settings.json');
const rosterFile = path.join(base, 'data/web-applets/accounts.json');
const oldId = `account.${randomUUID()}`,
  itemId = `web.${randomUUID()}`;
const marker = path.join(local, 'web-applets/sessions', oldId, 'retained-login-marker');
const checks = [];
let child, browser, dock;
fs.mkdirSync(base, { recursive: true });
fs.mkdirSync(path.dirname(marker), { recursive: true });
fs.writeFileSync(marker, 'old local login data');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.webApplets.items = [
  {
    id: itemId,
    name: '引き継いだWebApplet',
    url: 'https://account-recovery.invalid/',
    accountId: oldId,
    enabled: false,
    display: 'page',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
  },
];
const originalSettings = JSON.stringify(settings);
fs.writeFileSync(settingsFile, originalSettings);
const executable = portable ? path.join(base, 'AppDock.at365.exe') : require('electron');
if (portable) fs.copyFileSync(portable, executable);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await wait(100);
  }
  throw Error(label);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const snapshot = () => dock.evaluate(() => window.dock.snapshot());
async function start() {
  const port = await freePort(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (portable) env.LOCALAPPDATA = localAppData;
  child = spawn(
    executable,
    [
      ...(portable ? [] : [root]),
      ...(!portable ? [`--test-profile=${base}`, `--test-local-state=${local}`] : []),
      `--remote-debugging-port=${port}`,
    ],
    { cwd: base, env, windowsHide: true, stdio: 'ignore' },
  );
  child.on('error', (error) => {
    console.error(error);
  });
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }, 'CDP connection');
  dock = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host page',
  );
  dock.setDefaultTimeout(15000);
  await until(async () => (await snapshot()).startupReady, 'startup ready');
  await dock.evaluate(() => window.dock.executeCommand('appdock.open'));
  await until(async () => (await snapshot()).windowVisible, 'window shown');
}
async function stop() {
  if (!browser) return;
  await dock.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => child.exitCode !== null, 'normal shutdown');
  assert.equal(child.exitCode, 0);
  await browser.close().catch(() => {});
  browser = undefined;
}
async function addAndReassign() {
  await (
    await require('./shell-overlay-helper.cjs').ribbonPage(dock)
  )
    .locator('[data-ribbon-id="settings"]')
    .click();
  await dock
    .locator('.settings-categories')
    .getByRole('button', { name: 'Webアカウント', exact: true })
    .click();
  await dock.getByRole('button', { name: 'アカウント枠を追加', exact: true }).click();
  const state = await until(async () => {
    const s = await snapshot();
    return s.webAccounts.length === 1 ? s : null;
  }, 'first account added');
  const id = state.webAccounts[0].id;
  await (
    await require('./shell-overlay-helper.cjs').ribbonPage(dock)
  )
    .locator('[data-ribbon-id="extensions"]')
    .click();
  await dock
    .locator('.applet-select')
    .filter({ has: dock.locator('span[title="WebApplet"]') })
    .click();
  await dock.getByRole('tab', { name: '設定', exact: true }).click();
  await dock.getByLabel('WebAppletのアカウント', { exact: true }).selectOption(id);
  await settleSettings(dock);
  await until(
    async () => (await snapshot()).settings.value.webApplets.items[0].accountId === id,
    'WebApplet reassigned',
  );
  assert.equal(
    (await snapshot()).settings.value.webApplets.items[0].name,
    settings.webApplets.items[0].name,
  );
  assert.equal(fs.readFileSync(marker, 'utf8'), 'old local login data');
  return id;
}
(async () => {
  await start();
  assert.equal((await snapshot()).webAccounts.length, 0);
  assert.equal((await snapshot()).settings.value.webApplets.items.length, 1);
  assert.equal(fs.existsSync(rosterFile), false);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(settingsFile)).webApplets.items,
    settings.webApplets.items,
  );
  checks.push('old WebApplet settings survive startup without creating an empty roster');
  const first = await addAndReassign();
  assert.equal(JSON.parse(fs.readFileSync(rosterFile)).accounts[0].id, first);
  checks.push('UI adds the first missing-roster account and reassigns the existing WebApplet');
  const errors = await dock.evaluate(async (id) => {
    const results = [];
    for (const work of [
      () => window.dock.renameWebAccount(id, 'unlogged argument'),
      () => window.dock.deleteWebAccount(id),
    ]) {
      try {
        await work();
        results.push('unexpected success');
      } catch (e) {
        results.push(e.message);
      }
    }
    return results;
  }, oldId);
  assert(errors.every((e) => /Webアカウント枠がありません/.test(e)));
  const logs = (await snapshot()).logs.filter((l) => l.level === 'error');
  for (const channel of ['dock:renameWebAccount', 'dock:deleteWebAccount'])
    assert.equal(logs.filter((l) => l.message.includes(channel)).length, 1);
  assert(!logs.some((l) => l.message.includes('unlogged argument')));
  await (
    await require('./shell-overlay-helper.cjs').ribbonPage(dock)
  )
    .locator('[data-ribbon-id="logs"]')
    .click();
  const logPage = await require('./shell-overlay-helper.cjs').logsPage(dock, { type: 'all' });
  for (const channel of ['dock:renameWebAccount', 'dock:deleteWebAccount'])
    await logPage.locator('.log-row').filter({ hasText: channel }).waitFor();
  const disk = fs.readFileSync(path.join(local, 'logs/host.log'), 'utf8');
  assert(disk.includes('dock:renameWebAccount') && disk.includes('dock:deleteWebAccount'));
  await dock.screenshot({ path: path.join(output, 'errors-in-log-page.png') });
  checks.push(
    'synchronous and asynchronous IPC failures reject and appear in the log page and host.log without arguments',
  );
  await stop();
  await start();
  assert.equal((await snapshot()).webAccounts[0].id, first);
  assert.equal((await snapshot()).settings.value.webApplets.items[0].accountId, first);
  checks.push('recovered account and reassignment persist after restart');
  await stop();
  fs.writeFileSync(rosterFile, JSON.stringify({ schemaVersion: 1, accounts: [] }));
  await start();
  assert.equal((await snapshot()).webAccounts.length, 0);
  const second = await addAndReassign();
  assert.notEqual(second, first);
  checks.push(
    'an existing empty roster also permits adding and selecting a replacement without deleting old login data',
  );
  await stop();
  const result = {
    ok: true,
    mode: portable ? 'portable-production-path' : 'source',
    checks,
    version: require('../package.json').version,
    portableHash: portable && hash(portable),
    output,
  };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})()
  .catch(async (error) => {
    if (browser && dock && !dock.isClosed()) {
      fs.writeFileSync(
        path.join(output, 'diagnostic.json'),
        JSON.stringify(
          {
            navigation: (await snapshot()).navigation,
            pages: await Promise.all(
              browser
                .contexts()
                .flatMap((c) => c.pages())
                .map(async (p) => ({
                  url: p.url(),
                  text: await p
                    .locator('body')
                    .innerText()
                    .catch(() => ''),
                  geometry: await p
                    .evaluate(() => ({
                      width: innerWidth,
                      height: innerHeight,
                      hidden: document.hidden,
                      elements: [
                        ...document.querySelectorAll('main,.host-page-slot,.log-toolbar'),
                      ].map((e) => ({
                        tag: e.className,
                        rect: e.getBoundingClientRect().toJSON(),
                        display: getComputedStyle(e).display,
                        visibility: getComputedStyle(e).visibility,
                      })),
                    }))
                    .catch(() => null),
                })),
            ),
          },
          null,
          2,
        ),
      );
    }
    fs.writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify({ ok: false, error: error.stack, checks }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser)
      await stop().catch(() => {
        child.kill();
      });
  });

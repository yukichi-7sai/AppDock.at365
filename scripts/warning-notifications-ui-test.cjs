// Isolated source/portable UI test. Only this run's generated legacy fixtures are removed.
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', `warning-notifications-ui-${Date.now()}`);
const local = path.join(profile, 'local-state'),
  checks = [];
fs.mkdirSync(profile, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const settings = createDefaultSettings();
assert.equal(settings.host.hardwareAcceleration, false);
assert.equal(settings.host.closeToTray, true);
settings.host.checkForUpdatesOnStartup = false;
settings.host.notifications = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.notificationPreferences = {
  overrides: [
    {
      ownerKind: 'host',
      ownerId: 'warnings',
      typeId: 'attention-required',
      targets: ['banner'],
      speak: false,
    },
  ],
};
const settingsFile = path.join(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const targets = ['data/storage', '.appdock/secrets', 'data/chromium'].map((p) =>
  path.join(profile, p),
);
for (const target of targets) fs.mkdirSync(target, { recursive: true });
const protectedFiles = [
  'data/assets/profile/avatar.png',
  'data/web-applets/accounts.json',
  '.appdock/secrets/credential.json',
];
for (const file of protectedFiles) {
  fs.mkdirSync(path.dirname(path.join(profile, file)), { recursive: true });
  fs.writeFileSync(path.join(profile, file), 'PRIVATE-FIXTURE-' + file);
}
const before = protectedFiles.map((f) => hash(path.join(profile, f)));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await pause(80);
  }
  throw Error(label);
}
async function port() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
}
let application, browser, child, host, ui;
async function notificationSurface() {
  for (const p of host
    .context()
    .pages()
    .filter((p) => p.url().endsWith('/notifications.html'))) {
    const model = (await p.evaluate(() => window.appdockNotifications.connect())).snapshot;
    if (model.surface === 'banner') return { page: p, model };
  }
  return { model: { items: [] } };
}
async function warnings() {
  return (await notificationSurface()).model.items.filter((i) => i.ownerId === 'warnings');
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function general() {
  await ui.getByRole('button', { name: '一般', exact: true }).click();
  await ui.getByRole('heading', { name: 'ウィンドウ', exact: true }).waitFor();
}
function removeFixture(target) {
  const absolute = path.resolve(target);
  assert(targets.includes(absolute));
  assert(absolute.startsWith(profile + path.sep));
  assert(!fs.lstatSync(absolute).isSymbolicLink());
  fs.rmSync(absolute, { recursive: true, force: true });
}
async function main() {
  const debug = await port(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    `--test-profile=${profile}`,
    `--test-local-state=${local}`,
    `--remote-debugging-port=${debug}`,
  ];
  if (portable) {
    child = spawn(exe, args, { cwd: profile, env, windowsHide: true, stdio: 'ignore' });
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'CDP',
    );
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
  } else {
    application = await electron.launch({ executablePath: exe, args, env, timeout: 45000 });
    host = await until(
      () => application.windows().find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
  }
  host.setDefaultTimeout(15000);
  await until(async () => (await snapshot()).startupReady, 'ready');
  ui = settingsAwarePage(host);
  await until(
    async () => (await warnings()).length === 1,
    'warning with Applet notifications disabled',
  );
  const first = (await warnings())[0];
  assert.equal(first.level, 'warning');
  assert.equal(first.expiresAt, undefined);
  assert(!first.body.includes(profile));
  assert.equal(await host.locator('.error-banner').filter({ hasText: '旧保存領域' }).count(), 0);
  await (
    await notificationSurface()
  ).page
    .getByRole('button', { name: '詳細を見る', exact: true })
    .click();
  await until(async () => (await snapshot()).navigation.route === 'logs', 'warning opens logs');
  const diagnostics = (await snapshot()).logs.filter((l) => l.source === 'storage');
  for (const target of targets)
    assert(diagnostics.some((l) => l.level === 'warning' && l.message.includes(target)));
  assert(!JSON.stringify(diagnostics).includes('PRIVATE-FIXTURE'));
  await host.evaluate(() => window.dock.navigate('settings'));
  await general();
  assert.equal(await ui.getByRole('heading', { name: '旧PC専用データ', exact: true }).count(), 0);
  assert.deepEqual(
    protectedFiles.map((f) => hash(path.join(profile, f))),
    before,
  );
  checks.push(
    'real warning action opens logs; exact paths in log, no legacy settings section, fixture data unchanged',
  );
  await (
    await notificationSurface()
  ).page
    .getByRole('button', { name: '旧保存領域の確認が必要ですを閉じる', exact: true })
    .click();
  await pause(2300);
  await ui.getByRole('button', { name: '通知', exact: true }).click();
  const notificationCards = (await settingsPage(host)).locator('.notification-setting-card');
  assert.deepEqual(
    await Promise.all(
      [0, 1].map((index) =>
        notificationCards.nth(index).locator(':scope > summary h2').innerText(),
      ),
    ),
    ['エラー通知', '警告通知'],
  );
  for (const card of await notificationCards.all()) await card.locator(':scope > summary').click();
  for (const type of ['エラー通知', '警告通知'])
    assert.equal(
      await ui.getByRole('textbox', { name: type + 'の表示時間', exact: true }).inputValue(),
      '',
    );
  await (
    await settingsPage(host)
  ).screenshot({ path: path.join(profile, 'notification-defaults.png') });
  assert.equal(await ui.getByRole('switch', { name: '警告通知を通知', exact: true }).count(), 0);
  assert.equal(
    await ui.getByLabel('警告通知の通知センターのみ', { exact: true }).isDisabled(),
    true,
  );
  await ui.getByRole('textbox', { name: '警告通知の表示時間', exact: true }).fill('12');
  await ui.getByRole('textbox', { name: '警告通知の表示時間', exact: true }).press('Enter');
  await settleSettings(host);
  const preference = JSON.parse(
    fs.readFileSync(settingsFile),
  ).notificationPreferences.overrides.find((o) => o.ownerId === 'warnings');
  assert.equal(preference.durationSeconds, 12);
  assert.equal('enabled' in preference, false);
  await general();
  await pause(2300);
  assert.equal((await warnings()).length, 0);
  assert.equal(
    (await snapshot()).logs.filter((l) => l.source === 'storage').length,
    diagnostics.length,
  );
  checks.push(
    'warning preference saves immediately; dismissal, page navigation and preference edits do not replay or repeat logs',
  );
  // Adding another fixed target while dismissed updates details/logs without replay.
  const extra = path.join(profile, '.appdock/storage');
  targets.push(extra);
  fs.mkdirSync(extra, { recursive: true });
  await pause(2300);
  await until(
    async () =>
      (await snapshot()).logs.some((l) => l.source === 'storage' && l.message.includes(extra)),
    'new target log',
  );
  assert.equal((await warnings()).length, 0);
  assert((await snapshot()).logs.some((l) => l.source === 'storage' && l.message.includes(extra)));
  checks.push('new target stays visible and logged while the original episode remains dismissed');
  for (const target of targets) removeFixture(target);
  await pause(2300);
  await until(async () => !(await snapshot()).legacyLocalData, 'legacy resolved');
  assert.equal((await snapshot()).legacyLocalData, false);
  assert.equal(hash(path.join(profile, protectedFiles[0])), before[0]);
  assert.equal(hash(path.join(profile, protectedFiles[1])), before[1]);
  fs.mkdirSync(targets[0], { recursive: true });
  await until(async () => (await warnings()).length === 1, 'poll detects recurrence');
  assert.notEqual((await warnings())[0].id, first.id);
  removeFixture(targets[0]);
  await until(
    async () => (await warnings()).length === 0 && !(await snapshot()).legacyLocalData,
    'poll resolves warning',
  );
  checks.push(
    'fixture-only cleanup preserves shared assets/roster; polling resolves and detects recurrence',
  );
  const result = {
    ok: true,
    profile,
    mode: portable ? 'portable' : 'source',
    version: (await snapshot()).version,
    exeHash: portable ? hash(exe) : undefined,
    checks,
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (host && !host.isClosed())
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (application) await application.close().catch(() => {});
    if (child)
      await until(() => child.exitCode !== null, 'portable exits').catch(() => {
        child.kill();
        process.exitCode = 1;
      });
  });

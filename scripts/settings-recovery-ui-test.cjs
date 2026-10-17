// Isolated real renderer/notification actions. Native confirmation is answered by a dialog fixture.
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { inspect, electronExpression } = require('./electron-main-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', `settings-recovery-ui-${Date.now()}`),
  local = path.join(profile, 'local-state');
const file = path.join(profile, 'settings.json'),
  checks = [];
fs.mkdirSync(profile, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const settings = createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.checkForUpdatesOnStartup = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.notificationPreferences = {
  overrides: [
    {
      ownerKind: 'host',
      ownerId: 'errors',
      typeId: 'operation-failed',
      targets: ['banner'],
      durationSeconds: null,
    },
  ],
};
fs.writeFileSync(file, JSON.stringify(settings));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await sleep(80);
  }
  throw Error(label);
}
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const n = s.address().port;
  await new Promise((r) => s.close(r));
  return n;
}
let application, browser, host, ui, debug;
async function banner() {
  return until(async () => {
    for (const p of host
      .context()
      .pages()
      .filter((p) => p.url().endsWith('/notifications.html'))) {
      const m = (await p.evaluate(() => window.appdockNotifications.connect())).snapshot;
      if (m.surface === 'banner') return p;
    }
  }, 'banner');
}
async function items() {
  for (const p of host
    .context()
    .pages()
    .filter((p) => p.url().endsWith('/notifications.html'))) {
    const model = (await p.evaluate(() => window.appdockNotifications.connect())).snapshot;
    if (model.surface === 'banner') return model.items;
  }
  return [];
}
async function state() {
  return host.evaluate(() => window.dock.snapshot());
}
async function openGeneral() {
  ui = settingsAwarePage(host);
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await ui.getByRole('button', { name: '一般', exact: true }).click();
  await ui.getByRole('heading', { name: '設定ファイル', exact: true }).first().waitFor();
}
async function dialogs(mode) {
  await application.evaluate(({ dialog }, mode) => {
    dialog.showMessageBox = async (options) => {
      globalThis.__settingsRecoveryDialog = options;
      if (mode === 'pending')
        return new Promise((resolve) => {
          globalThis.__resolveSettingsRecoveryDialog = resolve;
        });
      return { response: mode === 'restore' ? 1 : 0, checkboxChecked: false };
    };
  }, mode);
}
async function start() {
  debug = await port();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    `--test-profile=${profile}`,
    `--test-local-state=${local}`,
    `--remote-debugging-port=${debug}`,
  ];
  if (portable) {
    const inspector = await port();
    const child = spawn(exe, [...args, `--inspect=127.0.0.1:${inspector}`], {
      cwd: profile,
      env,
      windowsHide: true,
      stdio: 'ignore',
    });
    application = {
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      process: () => child,
      windows: () => browser.contexts().flatMap((c) => c.pages()),
      close: () => until(() => child.exitCode !== null, 'portable process exits'),
    };
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1500 }),
      'portable CDP',
    );
  } else application = await electron.launch({ executablePath: exe, args, env, timeout: 45000 });
  host = await until(
    () => application.windows().find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  host.setDefaultTimeout(15000);
  await until(async () => (await state()).startupReady, 'startup');
  await openGeneral();
}
async function main() {
  await start();
  assert.equal(await application.evaluate(({ app }) => app.isHardwareAccelerationEnabled()), false);
  const toggle = ui.getByRole('switch', { name: 'ハードウェアアクセラレーション', exact: true });
  await toggle.click();
  await settleSettings(host);
  await until(
    async () => (await items()).some((i) => i.typeId === 'restart-required'),
    'restart warning',
  );
  await toggle.click();
  await settleSettings(host);
  await until(
    async () => !(await items()).some((i) => i.typeId === 'restart-required'),
    'revert clears warning',
  );
  checks.push('GPU setting creates warning and revert resolves it');
  const valid = fs.readFileSync(file);
  fs.writeFileSync(file, '{transient');
  await sleep(450);
  fs.writeFileSync(file, valid);
  await sleep(2400);
  assert(!(await items()).some((i) => i.ownerId === 'errors'));
  checks.push('transient invalid JSON stays silent');
  fs.writeFileSync(file, '{broken-restore');
  await until(
    async () => (await items()).some((i) => i.ownerId === 'errors'),
    'persistent invalid notification',
  );
  const b = await banner();
  await b.getByRole('button', { name: 'バックアップで復元', exact: true }).waitFor();
  await dialogs('pending');
  await b.getByRole('button', { name: 'バックアップで復元', exact: true }).click();
  await until(
    () => application.evaluate(() => !!globalThis.__resolveSettingsRecoveryDialog),
    'confirmation',
  );
  const options = await application.evaluate(() => globalThis.__settingsRecoveryDialog);
  assert.match(options.detail, /更新日時/);
  assert.match(options.detail, /同期先/);
  await until(
    async () => await b.locator('.notification-actions button.primary').isDisabled(),
    'restart blocked during recovery',
  );
  const remote = JSON.parse(valid);
  remote.profile.name = 'incoming during confirmation';
  fs.writeFileSync(file, JSON.stringify(remote));
  await application.evaluate(() =>
    globalThis.__resolveSettingsRecoveryDialog({ response: 1, checkboxChecked: false }),
  );
  await until(
    async () => (await state()).settings.value.profile.name === remote.profile.name,
    'incoming accepted',
  );
  assert.equal(JSON.parse(fs.readFileSync(file)).profile.name, remote.profile.name);
  checks.push('confirmation guards restart and incoming valid JSON wins');
  fs.writeFileSync(file, '{broken-final');
  await until(async () => (await items()).some((i) => i.ownerId === 'errors'), 'second episode');
  await dialogs('restore');
  await (await banner()).getByRole('button', { name: 'バックアップで復元', exact: true }).click();
  await until(async () => !(await state()).settings.recovered, 'restore completed');
  assert.equal(JSON.parse(fs.readFileSync(file)).profile.name, remote.profile.name);
  const evidence = fs
    .readdirSync(path.join(local, 'settings-backups'))
    .filter((n) => n.startsWith('invalid-'));
  assert(
    evidence.some(
      (n) => fs.readFileSync(path.join(local, 'settings-backups', n), 'utf8') === '{broken-final',
    ),
  );
  checks.push('notification restore preserves corrupt bytes and restores latest good settings');
  const disabled = JSON.parse(fs.readFileSync(file));
  disabled.notificationPreferences.overrides[0].enabled = false;
  fs.writeFileSync(file, JSON.stringify(disabled));
  await until(
    async () =>
      (await state()).settings.value.notificationPreferences.overrides[0].enabled === undefined,
    'retired notification OFF input discarded',
  );
  fs.writeFileSync(file, '{broken-disabled');
  await until(async () => (await state()).settings.recovered, 'disabled recovery state');
  await sleep(2200);
  assert((await items()).some((i) => i.ownerId === 'errors'));
  assert.equal(
    await ui.getByRole('button', { name: 'バックアップで復元', exact: true }).isEnabled(),
    true,
  );
  await ui
    .getByRole('button', { name: 'バックアップで復元', exact: true })
    .scrollIntoViewIfNeeded();
  await (
    await settingsPage(host)
  ).screenshot({ path: path.join(profile, 'settings-recovery.png') });
  await ui.getByRole('button', { name: 'バックアップで復元', exact: true }).click();
  await until(
    async () => !(await state()).settings.recovered,
    'host settings page restores alongside the error notification',
  );
  checks.push('General recovery and error notifications remain available after legacy OFF input');
  await toggle.click();
  await settleSettings(host);
  await until(
    async () => (await items()).some((i) => i.typeId === 'restart-required'),
    'restart button ready',
  );
  const processBefore = application.process();
  await (
    await banner()
  )
    .getByRole('button', { name: '再起動', exact: true })
    .click()
    .catch((e) => {
      if (!/closed/.test(String(e))) throw e;
    });
  await until(() => processBefore.exitCode !== null, 'original process exits');
  browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1500 }),
    'relaunch CDP',
  );
  host = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'relaunch host',
  );
  await until(async () => (await state()).startupReady, 'relaunch ready');
  await until(async () => (await state()).navigation.route === 'settings', 'restore view');
  await settingsPage(host);
  await host.getByRole('switch', { name: 'ハードウェアアクセラレーション', exact: true }).waitFor();
  assert.equal(await host.getByText(/設定を読み込んでいます…Error:/).count(), 0);
  assert.equal((await state()).settings.value.host.hardwareAcceleration, true);
  assert(!(await items()).some((i) => i.typeId === 'restart-required'));
  checks.push(
    'notification restart actually relaunches same profile, restores settings view and clears warning',
  );
  const reenabled = JSON.parse(fs.readFileSync(file));
  reenabled.notificationPreferences.overrides[0].enabled = true;
  fs.writeFileSync(file, JSON.stringify(reenabled));
  await until(
    async () =>
      (await state()).settings.value.notificationPreferences.overrides[0].enabled === undefined,
    'legacy enabled input discarded before fallback startup',
  );
  await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => !browser.isConnected(), 'relaunch shutdown');
  await browser.close();
  browser = undefined;
  fs.writeFileSync(file, '{startup-corrupt');
  await start();
  assert.equal((await state()).settings.recovered, true);
  assert.equal(fs.readFileSync(file, 'utf8'), '{startup-corrupt');
  await until(
    async () => (await items()).some((i) => i.ownerId === 'errors'),
    'fallback startup error',
  );
  checks.push('corrupt startup uses backup without overwriting shared JSON');
  const result = {
    ok: true,
    profile,
    mode: portable ? 'portable' : 'source',
    exeHash: portable ? hash(exe) : undefined,
    checks,
    nativeConfirmation: 'fixture answers; native file picker covered by recovery-loop unit tests',
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (host && !host.isClosed())
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (application) await application.close().catch(() => {});
  });

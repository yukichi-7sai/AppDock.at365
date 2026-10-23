const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', `applet-defaults-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.hardwareAcceleration = false;
settings.globalShortcutCommands = [];
settings.extensions['fixture.off'] = { enabled: false, settings: { retained: 7 } };
const row = {
  id: 'web.11111111-1111-4111-8111-111111111111',
  name: 'Unavailable account fixture',
  enabled: true,
  display: 'page',
  url: 'https://example.test/',
  accountId: 'account.11111111-1111-4111-8111-111111111111',
  navigation: 'same-origin',
  allowedOrigins: [],
  icon: '',
};
settings.extensions['at365.web-applet'] = {
  enabled: true,
  settings: { items: [row], shortcutDefaults: [] },
};
settings.ribbon.order = [`page:${row.id}:main`, 'image-library', 'settings'];
const referenceBefore = JSON.stringify(settings.extensions['at365.web-applet']);
const profileSource = path.resolve(root, '../Applet.Profile.at365');
const profileDirectory = path.join(profile, 'extensions', 'at365.profile');
fs.mkdirSync(profileDirectory, { recursive: true });
for (const file of ['extension.json', 'index.cjs'])
  fs.copyFileSync(path.join(profileSource, file), path.join(profileDirectory, file));
fs.cpSync(
  path.resolve(root, '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet'),
  path.join(profile, 'extensions', 'at365.web-applet'),
  { recursive: true },
);
for (const [id, delay] of [
  ['fixture.off', 0],
  ['fixture.delayed', 1],
]) {
  const directory = path.join(profile, 'extensions', id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      startupDelaySeconds: delay,
    }),
  );
  fs.writeFileSync(
    path.join(directory, 'index.cjs'),
    'exports.activate=async()=>{};exports.deactivate=async()=>{};',
  );
}
const originalAccounts = path.join(profile, 'data/web-applets/accounts.json');
fs.mkdirSync(path.dirname(originalAccounts), { recursive: true });
fs.writeFileSync(
  originalAccounts,
  JSON.stringify({ schemaVersion: 1, accounts: [{ id: row.accountId, name: 'Original fixture' }] }),
);
const originalHash = hash(originalAccounts);
assert.equal(settings.migrations, undefined);
assert.equal(settings.extensions['at365.profile'], undefined);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
let app, host, rail, child, browser;
const until = async (fn, label) => {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: exe,
      args: [root, `--test-profile=${profile}`],
      env,
    });
  else {
    const debug = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'portable CDP',
    );
    const context = browser.contexts()[0];
    app = {
      context: () => context,
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      close: async () => {
        await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
        await until(() => child.exitCode !== null, 'shutdown');
        await browser.close();
      },
    };
  }
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.setDefaultTimeout(15000);
  host.on('pageerror', (e) => errors.push(String(e)));
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    w.setSize(1120, 850);
    w.show();
    w.focus();
  });
  rail = await ribbonPage(host);
  await until(async () => (await snapshot()).startupReady, 'startup');
}
function assertReferences() {
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
  assert.equal(JSON.stringify(saved.extensions['at365.web-applet']), referenceBefore);
  assert.equal(saved.migrations, undefined);
  assert.equal(hash(originalAccounts), originalHash);
}
(async () => {
  try {
    await launch();
    console.log('GUI started: ' + profile);
    await until(async () => {
      const s = await snapshot();
      return ['at365.profile', 'fixture.delayed'].every(
        (id) => s.extensions.find((a) => a.id === id)?.state === 'running',
      );
    }, 'default ON processes');
    const off = (await snapshot()).extensions.find((a) => a.id === 'fixture.off');
    assert.equal(off.enabled, false);
    assert.equal(off.state, 'stopped');
    const button = () => rail.locator('[data-ribbon-id="applet:at365.profile:main"]');
    await button().waitFor();
    assert.equal(await button().getAttribute('aria-label'), 'プロフィール');
    await button().click();
    await settingsPage(host);
    await host.getByLabel('ユーザー名', { exact: true }).fill('Default ON fixture');
    await host.getByLabel('ユーザー名', { exact: true }).press('Enter');
    await until(
      async () =>
        (await snapshot()).settings.value.extensions['at365.profile']?.settings.name ===
        'Default ON fixture',
      'partial Applet settings saved',
    );
    assert.equal((await snapshot()).extensions.find((a) => a.id === 'at365.profile').enabled, true);
    await host.screenshot({ path: path.join(profile, 'default-profile.png') });
    checks.push(
      'fresh Profile and delayed Node Applet activate without saved flags; saved OFF stays stopped and partial settings retain ON',
    );

    await host.evaluate(() => window.dock.executeCommand('appdock.ribbon.settings.open'));
    await settingsPage(host);
    await host
      .getByRole('checkbox', { name: '画像ライブラリーをリボンに表示', exact: true })
      .uncheck();
    await until(
      async () => (await snapshot()).settings.value.ribbon.hidden.includes('image-library'),
      'ribbon form saved',
    );
    await host.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = JSON.parse(await host.getByLabel('設定JSON').inputValue());
    json.ribbon.hidden = [];
    await host.getByLabel('設定JSON').fill(JSON.stringify(json));
    await host.getByLabel('設定JSON').press('Enter');
    await until(
      async () => !(await snapshot()).settings.value.ribbon.hidden.includes('image-library'),
      'ribbon JSON saved',
    );
    assertReferences();
    await host.screenshot({ path: path.join(profile, 'ribbon-with-missing-account.png') });
    checks.push(
      'form and JSON ribbon saves succeed with missing account references; original rows, absent migration marker and old account bytes remain unchanged',
    );

    await host.evaluate(() => window.dock.toggleExtension('at365.profile', false));
    await until(
      async () =>
        (await snapshot()).extensions.find((a) => a.id === 'at365.profile')?.state === 'stopped',
      'Profile disabled',
    );
    await button().waitFor({ state: 'detached' });
    await app.close();
    app = null;
    await launch();
    await until(
      async () =>
        (await snapshot()).extensions.find((a) => a.id === 'fixture.delayed')?.state === 'running',
      'delayed Applet after restart',
    );
    assert.equal(
      (await snapshot()).extensions.find((a) => a.id === 'at365.profile').enabled,
      false,
    );
    assert.equal(await button().count(), 0);
    assert.equal(
      (await snapshot()).settings.value.extensions['at365.profile'].settings.name,
      'Default ON fixture',
    );
    assert.equal((await snapshot()).extensions.find((a) => a.id === 'fixture.off').enabled, false);
    assertReferences();
    await host.evaluate(() => window.dock.toggleExtension('at365.profile', true));
    await button().waitFor();
    await host.screenshot({ path: path.join(profile, 'reenabled-profile.png') });
    checks.push(
      'explicit OFF persists across process restart with settings intact; explicit ON restores the Profile ribbon',
    );
    assert.deepEqual(errors, []);
    const result = {
      passed: true,
      portable: !!portable,
      executable: portable,
      sha256: portable ? hash(portable) : null,
      checks,
      errors,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, profile }));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify({ error: String(error.stack ?? error), checks, errors }, null, 2),
    );
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})();

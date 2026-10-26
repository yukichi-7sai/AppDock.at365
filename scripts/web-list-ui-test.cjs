const chooseOption = (control, value) => control.selectOption(value);
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const net = require('node:net');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'web-list-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const appletSource = path.resolve(
  process.env.APPDOCK_WEB_APPLET_TEST_SOURCE ??
    path.resolve(root, '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet'),
);
fs.cpSync(appletSource, path.join(profile, 'extensions/at365.web-applet'), { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.keybindings = [];
settings.gestures.enabled = false;
const owner = 'at365.web-applet',
  account = 'account.11111111-2222-3333-4444-555555555555';
const site = {
  id: 'site.one',
  name: '登録サイト',
  url: 'https://example.test/',
  enabled: true,
  display: 'page',
  navigation: 'same-origin',
  allowedOrigins: [],
  accountId: account,
  icon: '',
  imported: { name: 'Keep' },
};
settings.extensions[owner] = { enabled: true, settings: { items: [site] } };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
fs.mkdirSync(path.join(profile, 'data/web-profiles', owner), { recursive: true });
fs.writeFileSync(
  path.join(profile, 'data/web-profiles', owner, 'accounts.json'),
  JSON.stringify({ schemaVersion: 1, accounts: [{ id: account, name: '個人用' }] }),
);
let app, host, browser, child, executableSha256;
const pages = () =>
  browser ? browser.contexts().flatMap((c) => c.pages()) : app.context().pages();
const checks = [],
  errors = [];
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error(label);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const own = async () => (await snapshot()).settings.value.extensions[owner].settings;
const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
async function closeDialog(page) {
  await page.getByTestId('settings-dialog-cancel').click();
}
(async () => {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (process.argv[2]) {
      const source = path.resolve(process.argv[2]),
        executable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(source, executable);
      const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      executableSha256 = hash(source);
      assert.equal(hash(executable), executableSha256);
      const probe = net.createServer();
      await new Promise((r) => probe.listen(0, '127.0.0.1', r));
      const debugPort = probe.address().port;
      await new Promise((r) => probe.close(r));
      child = spawn(
        executable,
        [
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
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [
          root,
          '--test-profile=' + profile,
          '--test-local-state=' + path.join(profile, 'local'),
        ],
        env,
        timeout: 30000,
      });
    }
    host = await until(() => pages().find((p) => p.url().startsWith('appdock://host/')), 'host');
    (browser ? browser.contexts()[0] : app.context()).on('page', (p) =>
      p.on('pageerror', (e) => errors.push(e.message)),
    );
    await until(
      async () =>
        (await snapshot()).extensions.some((e) => e.id === owner && e.state === 'running'),
      'running',
    );
    assert.deepEqual(
      (await snapshot()).extensions.find((item) => item.id === owner).pages ?? [],
      [],
    );
    assert(
      !(await snapshot()).extensions
        .find((item) => item.id === owner)
        .commands.some((item) => item.id === owner + '.manage'),
    );
    await command('appdock.settings.open');
    const page = await settingsPage(host);
    await page.getByTestId(`settings-nav:applet:${owner}`).click();
    const field = (key, part, control) =>
      page.getByTestId(
        `setting:applet%3A${owner}/setting%3A${key}${control ? `/${part}` : ''}:${control ?? part}`,
      );
    const dialog = page.getByTestId('settings-dialog');
    const confirm = () => page.getByTestId('settings-dialog-confirm').click();
    await field('items', 'list:row:site.one').waitFor();
    await field('items', 'list:toggle:site.one').click();
    await until(async () => !(await own()).items[0].enabled, 'settings disables site');
    await field('items', 'list:edit:site.one').click();
    await field('items', 'name', 'input').fill('破棄する名前');
    await closeDialog(page);
    assert.equal((await own()).items[0].name, '登録サイト');
    await field('shortcutDefaults', 'add').click();
    assert.equal((await own()).shortcutDefaults?.length ?? 3, 3);
    await field('shortcutDefaults', 'key', 'input').fill('Ctrl+F6');
    await confirm();
    await until(async () => (await own()).shortcutDefaults?.length === 4, 'settings adds shortcut');
    assert.equal((await own()).shortcutDefaults[3].key, 'Ctrl+F6');
    checks.push(
      'settings-only entry; no manager page or command; toggle, cancellation and shortcut addition',
    );
    await field('items', 'list:edit:site.one').click();
    await field('items', 'name', 'input').fill('設定から編集');
    assert.equal((await own()).items[0].name, '登録サイト');
    await confirm();
    await until(async () => (await own()).items[0].name === '設定から編集', 'host edits site');
    assert.deepEqual((await own()).items[0].imported, { name: 'Keep' });
    assert.equal((await own()).items[0].accountId, account);
    await field('items', 'list:toggle:site.one').click();
    await until(async () => (await own()).items[0].enabled, 'host enables site');
    await field('items', 'add').click();
    await field('items', 'name', 'input').fill('追加サイト');
    await field('items', 'url', 'input').fill('file:///private');
    await confirm();
    await dialog.getByRole('alert').waitFor();
    assert.equal((await own()).items.length, 1);
    assert.equal(await field('items', 'name', 'input').inputValue(), '追加サイト');
    await field('items', 'url', 'input').fill('https://second.test/');
    await confirm();
    await until(async () => (await own()).items.length === 2, 'host adds valid site');
    const addedId = (await own()).items.find((entry) => entry.name === '追加サイト').id;
    await field('items', 'list:order').click();
    await page.getByTestId('settings-order-handle:0').press('ArrowDown');
    assert.equal((await own()).items[0].id, 'site.one');
    await dialog.press('Escape');
    assert.equal(
      await field('items', 'list:order').evaluate((el) => el === document.activeElement),
      true,
    );
    await field('items', 'list:order').click();
    await page.getByTestId('settings-order-handle:1').press('ArrowUp');
    await confirm();
    await until(async () => (await own()).items[0].id === addedId, 'host saves order');
    await field('items', `list:delete:${addedId}`).click();
    await closeDialog(page);
    assert.equal((await own()).items.length, 2);
    await field('items', `list:delete:${addedId}`).click();
    await confirm();
    await until(async () => (await own()).items.length === 1, 'host confirms delete');
    await field('shortcutDefaults', 'list:edit:0').click();
    await chooseOption(field('shortcutDefaults', 'scope', 'select'), 'global');
    await confirm();
    await until(
      async () => (await own()).shortcutDefaults[0].when.scope === 'global',
      'host saves nested scope',
    );
    checks.push(
      'host shared controls: grouped edits, validation, private fields, add/delete/order, focus return, nested select',
    );

    await field('items', 'list:edit:site.one').click();
    await field('items', 'name', 'input').fill('上書き禁止');
    await host.evaluate(async (owner) => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions[owner].settings.items[0].name = '外部更新';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, owner);
    await confirm();
    await dialog.getByRole('alert').waitFor();
    assert.equal((await own()).items[0].name, '外部更新');
    assert.equal(await field('items', 'name', 'input').inputValue(), '上書き禁止');
    await closeDialog(page);
    checks.push('conflicting record update rejected; local input and external value retained');

    const shortcutsBeforeConflict = structuredClone((await own()).shortcutDefaults);
    await field('shortcutDefaults', 'list:order').click();
    await page.getByTestId('settings-order-handle:0').press('ArrowDown');
    assert.equal(
      await dialog.locator('.shortcut-order-row').nth(1).getAttribute('data-order-id'),
      '0',
    );
    assert.deepEqual((await own()).shortcutDefaults, shortcutsBeforeConflict);
    await host.evaluate(async (owner) => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions[owner].settings.shortcutDefaults.reverse();
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, owner);
    await confirm();
    await dialog.getByRole('alert').waitFor();
    assert.equal(
      await dialog.locator('.shortcut-order-row').nth(1).getAttribute('data-order-id'),
      '0',
    );
    assert.equal(await page.getByTestId('settings-order-handle:0').isEnabled(), true);
    assert.deepEqual((await own()).shortcutDefaults, [...shortcutsBeforeConflict].reverse());
    await closeDialog(page);
    checks.push('conflicting order update rejected; local order and cancellation remain available');

    await page.getByTestId('settings-nav:general').click();
    await page.getByTestId(`settings-nav:applet:${owner}`).click();
    await field('items', 'list:edit:site.one').click();
    assert.equal(await field('items', 'name', 'input').inputValue(), '外部更新');
    await closeDialog(page);
    await field('items', 'list:delete:site.one').click();
    await confirm();
    await until(async () => (await own()).items.length === 0, 'settings confirms delete');
    checks.push('reopening settings retains external changes; deletion uses the shared dialog');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          checks,
          profile,
          source: process.argv[2] ?? 'development',
          executableSha256,
          appletSource,
          appletVersion: JSON.parse(fs.readFileSync(path.join(appletSource, 'extension.json')))
            .version,
          appletFiles: Object.fromEntries(
            ['extension.json', 'index.cjs', 'metadata.cjs'].map((file) => [
              file,
              createHash('sha256')
                .update(fs.readFileSync(path.join(appletSource, file)))
                .digest('hex'),
            ]),
          ),
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, checks, profile }));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      if (host)
        await host
          .evaluate(() => {
            void window.dock.executeCommand('appdock.quit');
          })
          .catch(() => {});
      if (child) await until(() => child.exitCode !== null, 'shutdown');
      await browser.close();
    }
    if (app) await app.close();
  }
})();

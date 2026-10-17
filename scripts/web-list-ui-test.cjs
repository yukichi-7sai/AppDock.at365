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
  root,
  '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet',
);
fs.cpSync(appletSource, path.join(profile, 'extensions/at365.web-applet'), { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.globalShortcutCommands = [];
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
const pages = () => browser ? browser.contexts().flatMap(c => c.pages()) : app.context().pages();
const checks = [],
  errors = [];
async function until(fn, label) {
  const end = Date.now() + 30000;
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
async function local() {
  return until(
    () =>
      pages()
        .find((p) => p.url().endsWith('/at365.web-applet/web/index.html')),
    'manager',
  );
}
const table = (page, name) => page.getByRole('table', { name, exact: true });
async function closeDialog(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
}
(async () => {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (process.argv[2]) {
      const source = path.resolve(process.argv[2]), executable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(source, executable);
      const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      executableSha256 = hash(source);
      assert.equal(hash(executable), executableSha256);
      const probe = net.createServer();
      await new Promise(r => probe.listen(0, '127.0.0.1', r));
      const debugPort = probe.address().port;
      await new Promise(r => probe.close(r));
      child = spawn(executable, ['--test-profile=' + profile, '--remote-debugging-port=' + debugPort], { cwd: profile, env, windowsHide: true, stdio: 'ignore' });
      browser = await until(() => chromium.connectOverCDP('http://127.0.0.1:' + debugPort, { timeout: 1000 }), 'CDP');
    } else {
      app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-profile=' + profile], env, timeout: 30000 });
    }
    host = await until(
      () =>
        pages()
          .find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    (browser ? browser.contexts()[0] : app.context()).on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    await until(
      async () =>
        (await snapshot()).extensions.some((e) => e.id === owner && e.state === 'running'),
      'running',
    );
    await command(owner + '.manage');
    const ui = await local();
    await table(ui, '登録サイト').waitFor();
    assert.equal(await table(ui, '登録サイト').locator('input,select,textarea').count(), 0);
    const initialMarkup = await table(ui, '登録サイト').locator('thead').innerText();
    await ui.getByRole('switch', { name: '登録サイトを有効にする', exact: true }).click();
    await until(async () => !(await own()).items[0].enabled, 'disabled');
    await ui.getByRole('button', { name: '登録サイトを編集', exact: true }).click();
    await ui.locator('[name=name]').fill('破棄する名前');
    await ui.locator('#cancel').click();
    assert.equal((await own()).items[0].name, '登録サイト');
    await ui.getByRole('button', { name: '割り当てを追加', exact: true }).click();
    assert.equal((await own()).shortcutDefaults?.length ?? 3, 3);
    await ui.locator('#shortcut-form [name=key]').fill('Ctrl+F6');
    await ui.locator('#shortcut-save').click();
    await until(async () => (await own()).shortcutDefaults?.length === 4, 'new shortcut');
    assert.equal(await table(ui, '初期ショートカット').locator('input,select,textarea').count(), 0);
    await until(
      async () => (await table(ui, '初期ショートカット').locator('tbody tr').count()) === 4,
      'shortcut render',
    );
    await ui.evaluate(() => window.scrollTo(0, 0));
    await ui.screenshot({ path: path.join(profile, 'manager-dark.png') });
    checks.push('shared manager table, switches, cancellation, shortcut dialog');
    await command('appdock.settings.open');
    let page = await settingsPage(host);
    await page.getByRole('button', { name: 'WebApplet', exact: true }).click();
    await table(page, '登録サイト').waitFor();
    assert.equal(await table(page, '登録サイト').locator('thead').innerText(), initialMarkup);
    assert.equal(await table(page, '登録サイト').locator('input,select,textarea').count(), 0);
    await page.getByRole('button', { name: '登録サイトを編集', exact: true }).click();
    let d = page.getByRole('dialog');
    await d.getByLabel('名前', { exact: true }).fill('設定から編集');
    assert.equal((await own()).items[0].name, '登録サイト');
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await until(async () => (await own()).items[0].name === '設定から編集', 'host edit');
    assert.deepEqual((await own()).items[0].imported, { name: 'Keep' });
    await page.getByRole('switch', { name: '設定から編集を有効にする', exact: true }).click();
    await until(async () => (await own()).items[0].enabled, 'enabled');
    await page.getByRole('button', { name: 'サイトを追加', exact: true }).click();
    d = page.getByRole('dialog');
    await d.getByLabel('名前', { exact: true }).fill('追加サイト');
    await d.getByLabel('開始URL', { exact: true }).fill('file:///private');
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await d.getByRole('alert').waitFor();
    assert.equal((await own()).items.length, 1);
    assert.equal(await d.getByLabel('名前', { exact: true }).inputValue(), '追加サイト');
    await d.getByLabel('開始URL', { exact: true }).fill('https://second.test/');
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await until(async () => (await own()).items.length === 2, 'host add');
    await page.getByRole('button', { name: '登録サイトを並べ替え', exact: true }).click();
    d = page.getByRole('dialog');
    assert.equal(await d.locator('.shortcut-order-row').count(), 2);
    assert.equal(await d.locator('.shortcut-order-row').first().evaluate(el => getComputedStyle(el).display), 'flex');
    assert.equal(await d.locator('ol').evaluate(el => getComputedStyle(el).listStyleType), 'none');
    await d.getByLabel('設定から編集の順番をドラッグで変更').press('Alt+ArrowDown');
    assert.match(await d.getByRole('status').innerText(), /2番目に移動/);
    assert.equal((await own()).items[0].name, '設定から編集');
    await d.press('Escape');
    assert.equal(await page.getByRole('button', { name: '登録サイトを並べ替え', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: '登録サイトを並べ替え', exact: true }).click();
    d = page.getByRole('dialog');
    await d.screenshot({ path: path.join(profile, 'site-order.png') });
    await d.getByRole('button', { name: '追加サイトを上へ' }).click();
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await until(async () => (await own()).items[0].name === '追加サイト', 'order');
    await page.getByRole('button', { name: '追加サイトを削除', exact: true }).click();
    await closeDialog(page);
    assert.equal((await own()).items.length, 2);
    await page.getByRole('button', { name: '追加サイトを削除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
    await until(async () => (await own()).items.length === 1, 'delete');
    await page.getByRole('button', { name: '再読み込みを編集', exact: true }).click();
    d = page.getByRole('dialog');
    await d.getByLabel('条件', { exact: true }).selectOption('global');
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await until(
      async () => (await own()).shortcutDefaults[0].when.scope === 'global',
      'scope saved',
    );
    checks.push(
      'host auto-generation: add/edit/delete/order, validation, private fields, nested shortcut condition',
    );
    await page.getByRole('button', { name: '設定から編集を編集', exact: true }).click();
    d = page.getByRole('dialog');
    await d.getByLabel('名前', { exact: true }).fill('上書き禁止');
    await host.evaluate(async (owner) => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions[owner].settings.items[0].name = '外部更新';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, owner);
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await d.getByRole('alert').waitFor();
    assert.equal((await own()).items[0].name, '外部更新');
    assert.equal(await d.getByLabel('名前', { exact: true }).inputValue(), '上書き禁止');
    await closeDialog(page);
    checks.push('conflicting external update rejected; input retained');
    const shortcutOrder = (await own()).shortcutDefaults.map(entry => entry.id);
    await page.getByRole('button', { name: '初期ショートカットを並べ替え', exact: true }).click();
    d = page.getByRole('dialog');
    const firstTitle = await d.locator('.shortcut-order-command strong').first().innerText();
    await d.locator('.shortcut-order-handle').first().dragTo(d.locator('.shortcut-order-row').nth(1));
    assert.equal(await d.locator('.shortcut-order-command strong').nth(1).innerText(), firstTitle);
    assert.deepEqual((await own()).shortcutDefaults.map(entry => entry.id), shortcutOrder);
    await closeDialog(page);
    const shortcutsBeforeConflict = structuredClone((await own()).shortcutDefaults);
    await page.getByRole('button', { name: '初期ショートカットを並べ替え', exact: true }).click();
    d = page.getByRole('dialog');
    await d.locator('.shortcut-order-handle').first().press('Alt+ArrowDown');
    const localOrder = await d.locator('[data-order-id]').evaluateAll(rows => rows.map(row => row.dataset.orderId));
    await host.evaluate(async owner => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.extensions[owner].settings.shortcutDefaults.reverse();
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    }, owner);
    await d.getByRole('button', { name: 'OK', exact: true }).click();
    await d.getByRole('alert').waitFor();
    assert.deepEqual(await d.locator('[data-order-id]').evaluateAll(rows => rows.map(row => row.dataset.orderId)), localOrder);
    assert.deepEqual((await own()).shortcutDefaults, [...shortcutsBeforeConflict].reverse());
    await closeDialog(page);
    await host.evaluate(async ({ owner, rows }) => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.extensions[owner].settings.shortcutDefaults = rows;
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    }, { owner, rows: shortcutsBeforeConflict });
    checks.push('order save failure retains local order and external settings; cancellation remains available');
    for (const theme of ['light', 'dark']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, theme);
      await until(
        async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === theme,
        'theme',
      );
      await page.screenshot({ path: path.join(profile, 'settings-' + theme + '.png') });
      await page.getByRole('button', { name: '初期ショートカットを並べ替え', exact: true }).click();
      await page.getByRole('dialog').screenshot({ path: path.join(profile, 'shortcut-order-' + theme + '.png') });
      await closeDialog(page);
    }
    if (browser) {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 760, deviceScaleFactor: 1, mobile: false });
      await page.screenshot({ path: path.join(profile, 'settings-narrow.png') });
      await page.getByRole('button', { name: '初期ショートカットを並べ替え', exact: true }).click();
      d = page.getByRole('dialog');
      await d.screenshot({ path: path.join(profile, 'shortcut-order-narrow.png') });
      assert(await d.evaluate(el => el.scrollWidth <= el.clientWidth));
      assert(await d.getByRole('button', { name: 'OK', exact: true }).isVisible());
      await closeDialog(page);
      await session.send('Emulation.clearDeviceMetricsOverride');
      await session.detach();
    } else {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/')).setSize(880, 760));
      await page.screenshot({ path: path.join(profile, 'settings-narrow.png') });
    }
    await host.evaluate(() => window.dock.navigate('extensions'));
    await host
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /^WebApplet/ })
      .click();
    await host.getByRole('tab', { name: '設定', exact: true }).click();
    page = await settingsPage(host);
    await table(page, '登録サイト').waitFor();
    assert.equal(await table(page, '登録サイト').locator('thead').innerText(), initialMarkup);
    await page.getByRole('button', { name: '外部更新を編集', exact: true }).click();
    assert.equal(await page.getByRole('dialog').getByLabel('名前', { exact: true }).inputValue(), '外部更新');
    await closeDialog(page);
    checks.push('Applet detail settings shares list and edit dialog');
    await page.getByRole('button', { name: '初期ショートカットを並べ替え', exact: true }).click();
    assert.equal(await page.getByRole('dialog').locator('.shortcut-order-row').count(), 4);
    await closeDialog(page);
    checks.push('shared order dialog: styled rows, handles, keyboard, drag, cancellation, focus return, both themes, narrow layout, detail entry');
    await command(owner + '.manage');
    await until(
      async () => await table(ui, '登録サイト').getByText('外部更新', { exact: true }).count(),
      'manager reflects host changes',
    );
    await ui.getByRole('button', { name: '外部更新を削除', exact: true }).click();
    await ui.locator('#delete-save').click();
    await until(async () => (await own()).items.length === 0, 'local delete');
    checks.push('themes, narrow window, cross-entry synchronization, delete confirmation');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, checks, profile, source: process.argv[2] ?? 'development', executableSha256 },
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
      if (host) await host.evaluate(() => { void window.dock.executeCommand('appdock.quit'); }).catch(() => {});
      if (child) await until(() => child.exitCode !== null, 'shutdown');
      await browser.close();
    }
    if (app) await app.close();
  }
})();

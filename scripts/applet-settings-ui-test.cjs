const { getPublishDirectory } = require('./publish-paths.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'applet-settings-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifests = [];
const inputs = [];
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.host.notifications = false;
initial.keybindings = [];
initial.gestures.enabled = false;
for (const name of ['Gmail', 'Watch', 'WallpaperSlideshow', 'WebBrowserTools', 'WindowsTools']) {
  const repo = path.resolve(root, '../Applet.' + name + '.at365'),
    folder = path.join(profile, 'extensions', name);
  const source = path.join(getPublishDirectory(repo), 'Applet.' + name + '.at365');
  fs.cpSync(source, folder, { recursive: true });
  const mf = path.join(repo, 'extension.json'),
    m = JSON.parse(fs.readFileSync(mf));
  // Before publishing, test current declarations against the existing disabled payloads.
  if (!process.argv[2]) require('./copy-host.cjs').copyHost(mf, path.join(folder, 'extension.json'));
  else assert.equal(hash(mf), hash(path.join(folder, 'extension.json')));
  manifests.push(m);
  inputs.push({ repo, manifest: hash(mf), payload: hash(path.join(source, m.entry)) });
  initial.extensions[m.id] = { enabled: false, settings: {} };
}
initial.extensions['at365.watch'].settings.monitor = 'disconnected-monitor';
const fixture = path.join(profile, 'extensions', 'fixture.sections');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.sections',
    name: 'Section fixture',
    version: '1.0.0',
    minimumHostVersion: '0.36.8',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['settings', 'commands', 'logging'],
    commands: [{ id: 'fixture.sections.run', title: '試験操作' }],
    settings: [
      { key: 'text', title: 'Fixture text', type: 'string', default: '' },
      { key: 'new', title: '追加された項目', type: 'number', default: 2 },
    ],
    settingActions: [
      { command: 'fixture.sections.run', title: '試験操作', successMessage: '試験完了' },
    ],
    settingSections: [
      {
        id: 'advanced',
        title: '追加設定',
        settings: ['text'],
        actions: ['fixture.sections.run'],
        collapsible: true,
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  "exports.activate=async c=>{c.commands.register('fixture.sections.run','試験操作',async()=>{await new Promise(r=>setTimeout(r,500));});};exports.deactivate=async()=>{};",
);
initial.extensions['fixture.sections'] = { enabled: true, settings: { privateValue: 'keep' } };
const webId = 'web.12121212-1212-4212-8212-121212121212';
initial.webApplets = {};
initial.webApplets.items = [
  {
    id: webId,
    name: 'Web settings fixture',
    url: 'https://example.com/',
    accountId: 'account.34343434-3434-4434-8434-343434343434',
    enabled: false,
    display: 'page',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
  },
];
require('../out/main/shared/settings-schema').parseSettings(initial);
initial.webApplets.accounts = [
  { id: initial.webApplets.items[0].accountId, name: 'Fixture account' },
];
require('./settings-web-fixture.cjs').installWebSettings(
  profile,
  initial,
  initial.webApplets.items,
  initial.webApplets.accounts,
);
delete initial.webApplets;
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const checks = [],
  errors = [];
let child,
  browser,
  host,
  page,
  success = false,
  output = '';
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error(label);
}
(async () => {
  try {
    const port = await freePort(),
      mainPort = await freePort(),
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const exe = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (process.argv[2]) {
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), exe);
      assert.equal(hash(exe), hash(path.resolve(process.argv[2])));
    }
    child = spawn(
      exe,
      [
        ...(process.argv[2] ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--remote-debugging-port=' + port,
        '--inspect=' + mainPort,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
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
    const snapshot = () => host.evaluate(() => window.dock.snapshot());
    await until(async () => (await snapshot()).startupReady, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    page.setDefaultTimeout(12000);
    page.on('pageerror', (e) => errors.push(e.message));
    const select = async (name) => {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, level: 1, exact: true }).waitFor();
    };
    const nameOf = (m) => m.displayName ?? m.name.replace(/^Applet\./, '');
    for (const m of manifests) {
      await select(nameOf(m));
      assert.equal(await page.locator('.applet-settings .setting-row').count(), 0);
      assert.equal(
        await page.locator('.applet-settings [data-setting-item]').count(),
        (m.settings?.length ?? 0) + (m.settingActions?.length ?? 0) + (m.pages?.length ?? 0) + 1,
      );
      for (const s of m.settingSections ?? [])
        assert.equal(await page.getByRole('heading', { name: s.title, exact: true }).count(), 1);
      await page.getByLabel('開始までの秒数', { exact: true }).fill('7');
      await settleSettings(page);
      assert.equal((await snapshot()).settings.value.extensions[m.id].startupDelaySeconds, 7);
      assert.notEqual((await snapshot()).extensions.find((a) => a.id === m.id).state, 'running');
    }
    checks.push(
      'all five available real Applet manifests render common sections and every field/action; common startup saves without activating Applets',
    );
    await select('Watch.at365');
    assert.equal(
      await page.getByLabel('表示するモニター', { exact: true }).inputValue(),
      'disconnected-monitor',
    );
    await page.getByRole('switch', { name: '秒を表示', exact: true }).click();
    await settleSettings(page);
    await page.getByLabel('時計の文字サイズ', { exact: true }).fill('480');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['at365.watch'].settings.fontSize,
      480,
    );
    await select('WindowsTools.at365');
    await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    await settleSettings(page);
    await page
      .getByLabel('ショートカットキーの送信 1 名前', { exact: true })
      .fill('Fixture command');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['at365.windows-tools'].settings.shortcuts[0]
        .title,
      'Fixture command',
    );
    await select('WallpaperSlideshow.at365');
    await page.getByRole('button', { name: 'モニターを追加', exact: true }).click();
    await settleSettings(page);
    const monitorDialog = page.getByRole('dialog');
    await monitorDialog.getByLabel('表示モード', { exact: true }).selectOption('Tile');
    await monitorDialog.getByLabel('タイル枚数', { exact: true }).fill('6');
    await monitorDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['at365.wallpaper-slideshow'].settings.monitors[0]
        .TileCount,
      6,
    );
    const search = page.getByRole('combobox', { name: '設定を検索' });
    await search.fill('履歴サムネイルの幅');
    await page.getByRole('option', { name: /履歴サムネイルの幅/ }).click();
    await page
      .getByLabel('履歴サムネイルの幅（px）', { exact: true })
      .waitFor({ state: 'visible' });
    await search.fill('');
    checks.push(
      'boolean/number/select, unavailable dynamic option, key-list and monitor-list save through unchanged settings; search opens folded history',
    );
    await select('Section fixture');
    assert.equal(await page.getByLabel('Fixture text', { exact: true }).isVisible(), false);
    assert(await page.getByLabel('追加された項目', { exact: true }).isVisible());
    await page.getByText('追加設定', { exact: true }).click();
    await page.getByLabel('Fixture text', { exact: true }).fill('saved in index');
    await settleSettings(page);
    await page.getByRole('button', { name: '試験操作', exact: true }).click();
    await page.getByRole('button', { name: '実行中…', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '実行中…', exact: true }).isDisabled());
    await page.getByText('試験完了', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = await page.getByLabel('設定JSON').inputValue();
    assert.equal(JSON.parse(json).extensions['fixture.sections'].settings.text, 'saved in index');
    assert(!json.includes('settingSections'));
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    await host.evaluate(() => window.dock.navigate('extensions'));
    await host
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /^Section fixture/ })
      .click();
    await host.getByRole('tab', { name: '設定', exact: true }).click();
    page = await settingsPage(host);
    await page.getByText('追加設定', { exact: true }).click();
    assert.equal(
      await page.getByLabel('Fixture text', { exact: true }).inputValue(),
      'saved in index',
    );
    await page.getByLabel('Fixture text', { exact: true }).fill('saved in detail');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.sections'].settings.privateValue,
      'keep',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    page = await settingsPage(host);
    checks.push(
      'fallback section for future fields, action busy/result, scoped JSON, index/detail shared editing, private setting preservation',
    );
    await select('Web settings fixture');
    await page.getByLabel('WebAppletの表示方法', { exact: true }).selectOption('window');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.web-settings'].settings.items[0]
        .display,
      'window',
    );
    assert.equal(await page.locator('.settings-body [data-setting-item]').count(), 3);
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        () => page.evaluate((t) => document.documentElement.dataset.theme === t, theme),
        'theme',
      );
      for (const width of [1280, 760]) {
        await inspect(
          mainPort,
          electronExpression +
            `.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/')).setSize(${width},850)`,
        );
        await page.waitForTimeout(150);
        for (const name of [...manifests.map(nameOf), 'Web settings fixture']) {
          await select(name);
          assert.equal(
            await page.locator('.settings-body').evaluate((e) => e.scrollWidth > e.clientWidth + 2),
            false,
            name + ' overflow ' + width,
          );
          await page.screenshot({ path: path.join(profile, `${theme}-${width}-${name}.png`) });
        }
      }
    }
    assert.deepEqual(errors, []);
    checks.push(
      'five available Applets plus a remote collection fixture fit light/dark at wide and narrow sizes; native Applets stay stopped',
    );
    const disk = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    assert.equal(disk.extensions['fixture.sections'].settings.text, 'saved in detail');
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) {
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    if (browser) await browser.close();
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      profile,
      inputs,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs'),
  { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'settings-url-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  requests = [];
let server, child, browser, host, page;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await pause(50);
  }
  throw Error(label);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  let success = false,
    output = '';
  try {
    server = http.createServer((req, res) => {
      requests.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        req.url === '/v1/models' ? JSON.stringify({ data: [{ id: 'fixture-model' }] }) : '{}',
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.updates.checkHostOnAboutOpen = false;
    settings.host.hardwareAcceleration = false;
    settings.host.notifications = false;
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.tts.baseUrl = base + '/v1';
    settings.ai.connections = [
      {
        ...require('../out/main/shared/ai').newAiConnection('fixture'),
        baseUrl: base + '/v1',
        defaultModel: 'fixture-model',
      },
    ];
    settings.ai.defaultConnectionId = 'fixture';
    const fixture = path.join(profile, 'extensions', 'fixture.url');
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(
      path.join(fixture, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: 'fixture.url',
        name: 'URL fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
      }),
    );
    fs.writeFileSync(path.join(fixture, 'index.cjs'), 'module.exports={};');
    require('./settings-web-fixture.cjs').installWebSettings(profile, settings);
    settings.extensions['fixture.url'] = { enabled: false, settings: {} };
    fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
    const port = await freePort(),
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let exe = require('electron');
    if (process.argv[2]) {
      exe = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), exe);
      assert.equal(hash(exe), hash(process.argv[2]));
    }
    child = spawn(
      exe,
      [
        ...(process.argv[2] ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--remote-debugging-port=' + port,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (output += b));
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
    await until(async () => (await snapshot()).startupReady, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    page.setDefaultTimeout(10000);
    const select = async (name) => {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, level: 1, exact: true }).waitFor();
    };
    async function confirmed(label, read, expected, mode = 'Enter') {
      const input = page.getByLabel(label, { exact: true }),
        before = JSON.stringify(read((await snapshot()).settings.value)),
        count = requests.length;
      await input.fill('http://127.0.0.1');
      await input.pressSequentially(':');
      await pause(80);
      assert.equal(await input.inputValue(), 'http://127.0.0.1:');
      await input.pressSequentially(String(server.address().port) + '/');
      await pause(80);
      assert.equal(await input.inputValue(), base + '/');
      assert.equal(
        JSON.stringify(read((await snapshot()).settings.value)),
        before,
        'URL remains uncommitted during typing: ' + label,
      );
      assert.equal(requests.length, count, 'typing does not contact server: ' + label);
      await input.fill(expected.raw);
      if (mode === 'Enter') await input.press('Enter');
      else await input.blur();
      await settleSettings(page);
      await until(
        async () =>
          JSON.stringify(read((await snapshot()).settings.value)) ===
          JSON.stringify(expected.saved),
        'confirmed ' + label,
      );
      assert.equal(
        await input.inputValue(),
        expected.saved,
        'confirmed URL is normalized: ' + label,
      );
      const revision = (await snapshot()).settings.revision;
      await input.blur();
      await settleSettings(page);
      assert.equal(
        (await snapshot()).settings.revision,
        revision,
        'Enter then blur does not write twice: ' + label,
      );
    }
    await select('AI');
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    const ai = page.getByLabel('AIのAPIのURL', { exact: true });
    await ai.fill(base + '/v1///');
    assert.equal(await ai.inputValue(), base + '/v1///');
    const aiRevision = (await snapshot()).settings.revision;
    await ai.press('Enter');
    await until(() => ai.inputValue().then((v) => v === base + '/v1'), 'AI normalized');
    assert.equal((await snapshot()).settings.revision, aiRevision);
    await page
      .getByRole('dialog')
      .getByText(/1件のモデルを取得しました/)
      .waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push(
      'AI dialog URL confirms locally, fetches models on Enter, and cancels without saving',
    );
    await select('TTS');
    await confirmed(
      'APIのURL',
      (s) => s.tts.baseUrl,
      { raw: base + '/speech/', saved: base + '/speech' },
      'blur',
    );
    checks.push('TTS uses identical deferred input and normalizes on blur');
    await select('AppDockについて');
    assert.equal(
      await page
        .locator('details')
        .filter({ has: page.getByRole('heading', { name: '更新の設定', exact: true }) })
        .getAttribute('open'),
      null,
    );
    await page.locator('.about-page > details.settings-section > summary').click();
    assert.equal(
      await page.getByLabel('AppDockの更新元', { exact: true }).inputValue(),
      'github:yukichi-7sai/AppDock.at365',
    );
    await confirmed('AppDockの更新元', (s) => s.updates.hostSource, {
      raw: base + '/update.json',
      saved: base + '/update.json',
    });
    await page.getByRole('button', { name: 'AppDockの更新元を既定に戻す', exact: true }).click();
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.updates.hostSource,
      'github:yukichi-7sai/AppDock.at365',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).updates?.hostSource,
      undefined,
    );
    checks.push('GitHub default reset saves immediately');
    await page.screenshot({ path: path.join(profile, 'github-update-default.png') });
    await page.getByRole('button', { name: 'Appletの管理と更新', exact: true }).click();
    await page
      .locator('[data-applet-id="fixture.url"]')
      .getByRole('button', { name: 'URL fixture', exact: true })
      .click();
    await page.locator('.applet-update-source > summary').click();
    await confirmed(
      'URL fixtureの更新元',
      (s) => s.extensions['fixture.url'].updateSource,
      { raw: base + '/applet.json', saved: base + '/applet.json' },
      'blur',
    );
    checks.push('host and Applet update sources defer both URL and path input until confirmation');
    const account = await host.evaluate(() => window.dock.createWebAccount('URL fixture'));
    await host.evaluate(
      async ({ account, base }) => {
        const s = await window.dock.snapshot();
        s.settings.value.extensions['fixture.web-settings'].settings.items.push({
          id: 'web.12345678-1234-1234-1234-123456789abc',
          name: '新しいWebApplet',
          url: base + '/old',
          accountId: account.id,
          enabled: false,
          display: 'page',
          navigation: 'same-origin',
          allowedOrigins: [],
          icon: '',
        });
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      },
      { account, base },
    );
    await select('新しいWebApplet');
    const web = page.getByLabel('WebAppletのURL', { exact: true });
    const count = requests.length;
    await web.fill(base + '/new/');
    await pause(150);
    assert.equal(requests.length, count);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.web-settings'].settings.items[0].url,
      base + '/old',
    );
    await web.press('Enter');
    await settleSettings(page);
    assert.equal(requests.length, count, 'disabled collection settings do not navigate the site');
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.web-settings'].settings.items[0].url,
      base + '/new/',
    );
    await pause(250);
    const confirmedCount = requests.length;
    await web.blur();
    await pause(250);
    assert.equal(requests.length, confirmedCount, 'blur does not repeat defaults import');
    checks.push('remote collection URL waits for confirmation and disabled pages remain unopened');
    await page.getByLabel('WebAppletの名前', { exact: true }).fill('URL fixture renamed');
    await page.getByLabel('WebAppletの名前', { exact: true }).press('Enter');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.extensions['fixture.web-settings'].settings.items[0].name,
      'URL fixture renamed',
    );
    checks.push('ordinary text fields save on confirmation too');
    await page.screenshot({ path: path.join(profile, 'confirmed.png') });
    success = true;
  } catch (e) {
    fs.writeFileSync(path.join(profile, 'error.txt'), e.stack ?? String(e));
    console.error(e);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(profile, 'process.log'), output);
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
    await browser?.close().catch(() => {});
    if (server)
      await new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      });
    const result = {
      success,
      checks,
      profile,
      requests,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

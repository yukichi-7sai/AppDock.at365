const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto'),
  { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs'),
  { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'settings-usability-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  requests = [],
  failures = [];
let child,
  browser,
  host,
  server,
  page,
  success = false,
  modelStatus = 200,
  modelCatalog = { data: [{ id: 'model-a' }, { id: 'model-b' }] };
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
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
const snapshot = () => host.evaluate(() => window.dock.snapshot());
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      if (req.url === '/v1/models') {
        requests.push('models');
        res.writeHead(modelStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(modelCatalog));
        return;
      }
      if (req.url === '/v1/audio/voices') {
        requests.push('voices');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ voices: [{ id: 'voice-a', name: 'Voice A' }] }));
        return;
      }
      requests.push('speech');
      res.writeHead(500);
      res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.updates.checkHostOnAboutOpen = false;
    initial.updates.checkHostOnStartup = false;
    initial.updates.checkAppletsOnStartup = false;
    initial.host.hardwareAcceleration = false;
    initial.host.soundEnabled = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    initial.tts = {
      connections: [
        {
          ...require('../out/main/shared/tts').newTtsServer('default'),
          name: 'Fixture',
          baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
          model: '',
          defaultVoice: '',
        },
      ],
      defaultConnectionId: 'default',
    };
    require('./test-settings.cjs').write(profile, initial);
    const config = path.join(profile, 'codex', 'config.toml');
    fs.mkdirSync(path.dirname(config));
    fs.writeFileSync(config, '# fixture\n');
    const port = await freePort(),
      mainPort = await freePort(),
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const exe = process.argv[2] ? testHostPath(profile) : require('electron');
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
    let output = '';
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
    await until(async () => (await snapshot()).startupReady, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => failures.push(e.message));
    const select = async (name) => {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, level: 1, exact: true }).waitFor();
    };
    await select('音声生成AI');
    assert.equal(requests.length, 0, 'opening settings does not contact server');
    const editTts = async () => {
      await page.getByRole('button', { name: 'Fixtureの設定', exact: true }).click();
      await page.getByRole('tab', { name: '声・話し方', exact: true }).click();
    };
    const choose = async (label, name) => {
      const toggle = page.getByRole('button', { name: label + 'の候補を表示', exact: true });
      await until(() => toggle.isEnabled(), label + ' candidates loaded');
      await toggle.click();
      await page.getByRole('option', { name, exact: true }).click();
    };
    const saveTts = async () => {
      await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await settleSettings(page);
    };
    await editTts();
    await page.getByRole('button', { name: 'モデル一覧を更新', exact: true }).click();
    await until(
      () => page.getByRole('button', { name: 'モデルの候補を表示', exact: true }).isEnabled(),
      'model candidates ready before editing',
    );
    await page.getByLabel('モデル', { exact: true }).fill('mod');
    await page.getByRole('option', { name: 'model-b', exact: true }).click();
    assert.equal((await snapshot()).settings.value.tts.connections[0].model, '');
    await saveTts();
    await until(
      async () => (await snapshot()).settings.value.tts.connections[0].model === 'model-b',
      'selected model saved',
    );
    await editTts();
    await page.getByRole('combobox', { name: 'モデル', exact: true }).fill('custom-model');
    await page.getByRole('combobox', { name: 'モデル', exact: true }).press('Enter');
    await saveTts();
    assert.equal((await snapshot()).settings.value.tts.connections[0].model, 'custom-model');
    await editTts();
    modelStatus = 404;
    await page.getByRole('button', { name: 'モデル一覧を更新', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: 'モデル一覧に対応していません' })
      .waitFor();
    assert.equal((await snapshot()).settings.value.tts.connections[0].model, 'custom-model');
    checks.push(
      'models can be fetched before configuration, selected, entered manually and retained on unsupported server',
    );
    modelStatus = 200;
    modelCatalog = {
      models: [
        { name: '1.7B-Base', downloaded: true },
        { name: '0.6B-Base', downloaded: false },
      ],
    };
    await page.getByRole('button', { name: 'モデル一覧を更新', exact: true }).click();
    await choose('モデル', '1.7B-Base');
    await page.getByRole('button', { name: 'モデルの候補を表示', exact: true }).click();
    assert.deepEqual(await page.getByRole('listbox').getByRole('option').allTextContents(), [
      '1.7B-Base',
    ]);
    await page.getByRole('combobox', { name: 'モデル', exact: true }).press('Escape');
    assert.equal(
      await page.getByRole('combobox', { name: 'モデル', exact: true }).inputValue(),
      '1.7B-Base',
    );
    await page.getByRole('button', { name: 'ボイス一覧を更新', exact: true }).click();
    await choose('声', 'voice-a Voice A');
    await settleSettings(page);
    await saveTts();
    assert.equal((await snapshot()).settings.value.tts.connections[0].model, '1.7B-Base');
    checks.push('Qwen catalog offers downloaded models and saves their server IDs');
    assert.equal((await snapshot()).settings.value.tts.connections[0].defaultVoice, 'voice-a');
    assert(!requests.includes('speech'), 'editing never speaks');
    checks.push('voice selection saves without automatic speech');
    await select('通知');
    const model = await page.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    const type = model.content.auxiliary.notificationTypes.find((t) => !t.requiredTargets.length);
    assert(type);
    const editNotification = () =>
      page
        .getByRole('button', {
          name: `${type.ownerTitle}の${type.title}を編集`,
          exact: true,
        })
        .click();
    const applyNotification = async () => {
      await page.getByRole('dialog').getByTestId('settings-dialog-confirm').click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await settleSettings(page);
    };
    await editNotification();
    const notificationBefore = (await snapshot()).settings.value.notificationPreferences;
    const speak = page.getByLabel(type.title + 'を読み上げる', { exact: true });
    await speak.check();
    assert.deepEqual((await snapshot()).settings.value.notificationPreferences, notificationBefore);
    await applyNotification();
    const row = () =>
      snapshot().then((s) =>
        s.settings.value.notificationPreferences.overrides.find(
          (r) => r.typeId === type.typeId && r.ownerId === type.ownerId,
        ),
      );
    assert.equal((await row()).speak, true);
    await editNotification();
    assert.equal(
      await page.getByLabel(type.title + 'の通知センターのみ', { exact: true }).isChecked(),
      false,
    );
    await page.getByLabel(type.title + 'の通知センターのみ', { exact: true }).check();
    await applyNotification();
    assert.deepEqual((await row()).targets, []);
    assert.equal((await row()).speak, false);
    checks.push('speech is a destination; center-only clears visual and speech targets atomically');
    await page.getByTestId('notification-delivery').locator(':scope > summary').click();
    await page.getByTestId('notification-speech').locator(':scope > summary').click();
    const notificationConnection = page.getByLabel('使用する音声サーバー', { exact: true });
    const notificationInstructions = page.getByLabel('通知用の話し方', { exact: true });
    await notificationConnection.selectOption('default');
    await notificationInstructions.fill('通知の話し方');
    await notificationInstructions.press('Enter');
    await settleSettings(page);
    assert.deepEqual((await snapshot()).settings.value.notificationPreferences.speech, {
      connectionId: 'default',
      instructions: '通知の話し方',
    });
    await notificationConnection.selectOption('');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.notificationPreferences.speech.connectionId,
      undefined,
    );
    assert.equal(
      (await snapshot()).settings.value.notificationPreferences.speech.instructions,
      '通知の話し方',
    );
    checks.push(
      'notification server inheritance changes independently of notification instructions',
    );
    await notificationInstructions.fill('');
    await notificationInstructions.press('Enter');
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.value.notificationPreferences?.speech?.instructions,
      undefined,
    );
    checks.push('empty notification instructions restore the selected server defaults');
    await page
      .getByTestId('notification-speech')
      .getByRole('button', { name: '設定を開く', exact: true })
      .click();
    await page.getByRole('heading', { name: '音声生成AI', exact: true, level: 1 }).waitFor();
    await select('通知');
    const events = page
      .locator('.settings-section')
      .filter({ has: page.getByRole('heading', { name: '通知の受け取り方', exact: true }) });
    await events.locator(':scope > summary').click();
    await events
      .getByRole('group', { name: 'MCP連携設定', exact: true })
      .getByRole('button', { name: '設定を開く', exact: true })
      .click();
    await page.getByRole('heading', { name: 'MCPサーバー', exact: true, level: 1 }).waitFor();
    assert.equal(
      await page
        .getByRole('region', { name: '接続の状態', exact: true })
        .getByRole('button', { name: '操作の許可を開く', exact: true })
        .count(),
      1,
    );
    checks.push(
      'notification links open TTS/MCP settings and permissions remain in connection status',
    );
    assert.equal(await page.getByLabel('Codexの設定ファイル', { exact: true }).count(), 0);
    await select('Codex連携');
    await page.getByRole('heading', { name: 'Codex連携', exact: true, level: 1 }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: '接続範囲', exact: true }).count(), 0);
    await page.getByLabel('Codexの設定ファイル', { exact: true }).fill(config);
    await page.getByRole('button', { name: '設定先を変更', exact: true }).click();
    const automation = () =>
      host.evaluate(() => window.dock.automation({ kind: 'status' })).then((r) => r.state.codex);
    await until(async () => (await automation()).configFile === config, 'isolated config selected');
    await page.getByRole('switch', { name: 'Codex連携を有効にする' }).click();
    await until(async () => (await automation()).running, 'automation enabled');
    await page.getByRole('button', { name: 'Codexへ登録', exact: true }).click();
    await until(async () => (await automation()).registration === 'registered', 'registration');
    assert(fs.readFileSync(config, 'utf8').startsWith('# fixture\n'));
    await page.getByRole('button', { name: 'このPC内の接続テスト', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).logs.some((entry) =>
          entry.message.includes('AppDock内の疎通に成功しました。'),
        ),
      'connection test',
    );
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: '登録を解除', exact: true }).click();
    await until(async () => (await automation()).registration === 'absent', 'unregister');
    assert.equal(fs.readFileSync(config, 'utf8'), '# fixture\n');
    await page.getByRole('switch', { name: 'Codex連携を有効にする' }).click();
    await until(async () => !(await automation()).enabled, 'automation disabled');
    checks.push('isolated Codex enable/register/test/unregister preserves unrelated TOML');
    assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(profile, 'process.log'), output);
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
    if (server) await new Promise((r) => server.close(r));
    const result = {
      success,
      checks,
      profile,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

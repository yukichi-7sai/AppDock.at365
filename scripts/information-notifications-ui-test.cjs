const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { spawn } = require('node:child_process'),
  net = require('node:net'),
  { createHash } = require('node:crypto');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..'),
  portable =
    process.argv[2] && process.argv[2] !== '--commands-only' && path.resolve(process.argv[2]);
const commandsOnly = process.argv.includes('--commands-only');
const profile = path.join(root, '.artifacts', `information-notifications-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const accountFixture = path.join(profile, 'extensions', 'fixture.accounts');
fs.mkdirSync(accountFixture, { recursive: true });
fs.writeFileSync(
  path.join(accountFixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.accounts',
    name: 'Account fixture',
    version: '1.0.0',
    minimumHostVersion: '0.44.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['web-profiles'],
    commands: [
      { id: 'fixture.accounts.run', title: 'Run fixture' },
      { id: 'fixture.accounts.fail', title: 'Fail fixture' },
    ],
  }),
);
fs.writeFileSync(
  path.join(accountFixture, 'index.js'),
  `exports.activate = async c => {
  c.commands.register('fixture.accounts.run', 'Run fixture', async () => c.log.info('Shortcut fixture completed'));
  c.commands.register('fixture.accounts.fail', 'Fail fixture', async () => { throw Error('Shortcut fixture failed'); });
};`,
);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const settings = createDefaultSettings();
settings.host.checkForUpdatesOnStartup = false;
settings.host.notifications = false;
settings.extensions['fixture.accounts'] = { enabled: true, settings: {} };
settings.keybindings = ['run', 'fail'].map((name, i) => ({
  id: 'fixture.' + name,
  command: 'fixture.accounts.' + name,
  key: i ? 'Ctrl+F11' : 'Ctrl+F12',
  enabled: true,
  when: { scope: 'app', appletIds: [] },
}));
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.tts.baseUrl = 'http://127.0.0.1:1/v1';
settings.updates.hostSource = path.join(profile, 'feed');
settings.notificationPreferences = {
  overrides: [
    { ownerKind: 'host', ownerId: 'warnings', typeId: 'attention-required', targets: [] },
    { ownerKind: 'host', ownerId: 'errors', typeId: 'operation-failed', targets: ['banner'] },
  ],
};
const settingsFile = path.join(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
fs.mkdirSync(settings.updates.hostSource);
const feed = {
  schemaVersion: 1,
  kind: 'host',
  id: 'host',
  version: require('../package.json').version,
  payload: { file: 'AppDock.exe', format: 'exe', size: 2, sha256: 'a'.repeat(64) },
};
const saveFeed = () =>
  fs.writeFileSync(path.join(settings.updates.hostSource, 'update.json'), JSON.stringify(feed));
saveFeed();
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
  const result = server.address().port;
  await new Promise((r) => server.close(r));
  return result;
}
let application, browser, child, host, ui;
const checks = [];
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function banner() {
  for (const page of host
    .context()
    .pages()
    .filter((p) => p.url().endsWith('/notifications.html'))) {
    const model = (await page.evaluate(() => window.appdockNotifications.connect())).snapshot;
    if (model.surface === 'banner') return { page, model };
  }
  return { model: { items: [] } };
}
async function info() {
  return (await banner()).model.items.filter((i) => i.ownerId === 'information');
}
const automation = (action) => host.evaluate((a) => window.dock.automation(a), action);
async function dismissAll() {
  const b = await banner();
  if (!b.page) return;
  await b.page.evaluate(async () => {
    const c = await window.appdockNotifications.connect();
    for (const n of c.snapshot.items)
      await window.appdockNotifications.act({
        notificationId: n.id,
        revision: n.revision,
        requestId: crypto.randomUUID(),
        type: 'dismiss',
      });
  });
}
async function main() {
  const debug = await port(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    `--test-profile=${profile}`,
    `--test-local-state=${path.join(profile, 'local-state')}`,
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
    async () =>
      (await snapshot()).extensions.some(
        (e) => e.id === 'fixture.accounts' && e.state === 'running',
      ),
    'shortcut fixture ready',
  );
  await host.bringToFront();
  const completedCount = async () =>
    (await snapshot()).logs.filter((l) => l.message === 'Shortcut fixture completed').length;
  const before = await completedCount();
  await host.keyboard.press('Control+F12');
  await until(async () => (await completedCount()) === before + 1, 'keyboard command executed');
  assert.deepEqual(await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+F12')), {
    executed: 1,
    failed: 0,
  });
  assert.deepEqual(await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+F11')), {
    executed: 0,
    failed: 1,
  });
  assert.deepEqual(await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+F9')), {
    executed: 0,
    failed: 0,
  });
  assert(
    (await snapshot()).logs.some(
      (l) => l.source === 'shortcuts' && l.message.includes('Shortcut fixture failed'),
    ),
  );
  await host.evaluate(() => window.dock.executeCommand('fixture.accounts.run'));
  assert.equal(await completedCount(), before + 3);
  await host.evaluate(() => {
    window.fixturePaletteResult = undefined;
    window.fixturePaletteEvents = 0;
    window.dock.onPaletteExecuted(() => window.fixturePaletteEvents++);
    void window.dock
      .openCommandPalette({ requestId: 'silent-command', mode: 'execute' })
      .then((result) => {
        window.fixturePaletteResult = result;
      });
  });
  const palette = await require('./shell-overlay-helper.cjs').overlayPage(host);
  await palette.getByRole('combobox').fill('fixture.accounts.run');
  await require('./shell-overlay-helper.cjs').closingAction(
    palette.locator('.palette-execute').click(),
  );
  await host.waitForFunction(() => window.fixturePaletteResult?.status === 'executed');
  assert.equal(await completedCount(), before + 4);
  assert.equal(await host.evaluate(() => window.fixturePaletteEvents), 1);
  assert(
    !(await snapshot()).logs.some((l) => l.source === 'commands' && l.message.includes('[INFO]')),
  );
  assert.equal((await info()).length, 0);
  checks.push(
    'keyboard, direct and palette commands execute silently; shortcut counts, error logs and palette completion remain',
  );
  if (commandsOnly) {
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await ui.getByRole('button', { name: '読み上げ', exact: true }).click();
    await ui.getByRole('button', { name: 'すべての読み上げを停止', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).logs.some(
          (l) => l.source === 'tts' && l.message.includes('読み上げを停止しました。'),
        ),
      'specific operation receipt',
    );
    const historyFile = path.join(profile, 'local-state', 'notifications', 'history.json');
    await until(
      () =>
        fs.existsSync(historyFile) &&
        JSON.parse(fs.readFileSync(historyFile)).entries.some(
          (n) => n.body === '読み上げを停止しました。',
        ),
      'specific notification persisted',
    );
    const history = JSON.parse(fs.readFileSync(historyFile));
    assert(!history.entries.some((n) => n.body === 'コマンドを実行しました。'));
    checks.push(
      'no generic success log/history; specific TTS stop notification persists even when Windows suppresses banners',
    );
    const result = {
      ok: true,
      profile,
      mode: portable ? 'portable' : 'source',
      scope: 'commands-only',
      version: (await snapshot()).version,
      exeHash: portable ? hash(exe) : undefined,
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    return;
  }
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await ui.getByRole('button', { name: '通知', exact: true }).click();
  const cards = (await settingsPage(host)).locator('.notification-setting-card');
  assert.deepEqual(
    await Promise.all(
      [0, 1, 2].map((i) => cards.nth(i).locator(':scope > summary > h2').innerText()),
    ),
    ['エラー通知', '警告通知', 'インフォメーション通知'],
  );
  for (const card of await cards.all()) await card.locator(':scope > summary').click();
  for (const name of ['警告通知', 'インフォメーション通知']) {
    const checkbox = ui.getByRole('checkbox', { name: name + 'のバナー', exact: true });
    assert(await checkbox.isChecked());
    assert(await checkbox.isDisabled());
  }
  assert.equal(
    await ui
      .getByRole('textbox', { name: 'インフォメーション通知の表示時間', exact: true })
      .inputValue(),
    '6',
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(settingsFile)).notificationPreferences.overrides[0].targets,
    [],
  );
  await (await settingsPage(host)).screenshot({ path: path.join(profile, 'settings.png') });
  await cards.nth(2).scrollIntoViewIfNeeded();
  await (
    await settingsPage(host)
  ).screenshot({ path: path.join(profile, 'information-settings.png') });
  checks.push('settings order, 6 second default, mandatory banners and read-only legacy repair');
  await dismissAll();
  await automation({ kind: 'configure', enabled: true, allowWrite: false, port: 0 });
  await dismissAll();
  await automation({ kind: 'test' });
  const success = await until(
    async () => (await info()).find((i) => i.body.includes('疎通に成功')),
    'test result',
  );
  assert.equal(success.level, 'info');
  assert(success.body.includes('Codexからの接続確認は別途必要'));
  assert(!success.body.includes('http'));
  await automation({ kind: 'status' });
  await automation({ kind: 'status' });
  assert.equal((await info()).filter((i) => i.body.includes('疎通に成功')).length, 1);
  await (await banner()).page.screenshot({ path: path.join(profile, 'information.png') });
  await until(async () => !(await info()).some((i) => i.id === success.id), 'six second expiry');
  assert.equal(await host.locator('.toast').count(), 0);
  checks.push('real loopback test success, no status replay, automatic expiry and no bottom toast');
  assert.equal(
    await ui.getByRole('switch', { name: 'インフォメーション通知を通知', exact: true }).count(),
    0,
  );
  await dismissAll();
  await automation({ kind: 'test' });
  await until(async () => (await info()).length === 1, 'new result remains enabled');
  assert(
    (await snapshot()).logs.some(
      (l) => l.source === 'automation' && l.message.includes('疎通に成功'),
    ),
  );
  await dismissAll();
  await automation({ kind: 'status' });
  assert.equal((await info()).length, 0);
  checks.push('no OFF control; results notify and log, status does not replay dismissed results');
  await automation({ kind: 'configure', enabled: false, allowWrite: false, port: 0 });
  await assert.rejects(automation({ kind: 'test' }), /AppDock内の疎通を確認できません/);
  const failure = await until(
    async () =>
      (await banner()).model.items.find((i) => i.body.includes('MCP_CONNECTION_TEST_FAILED')),
    'error',
  );
  assert.equal(failure.ownerId, 'errors');
  assert.equal(failure.level, 'error');
  assert(!failure.body.includes(profile));
  checks.push('failed test uses common error notification and safe matching result');
  await dismissAll();
  await host.evaluate(() => window.dock.checkUpdates());
  await until(
    async () => (await info()).some((i) => i.body.includes('更新はありません')),
    'no updates',
  );
  await until(
    async () => (await host.locator('.update-operation').count()) === 0,
    'footer progress ends',
  );
  await dismissAll();
  feed.version = '99.0.0';
  saveFeed();
  await host.evaluate(() => window.dock.checkUpdates());
  await until(
    async () => (await info()).some((i) => i.body.includes('1件の更新があります')),
    'available',
  );
  await (await banner()).page.getByRole('button', { name: '更新画面を開く', exact: true }).click();
  await (
    await settingsPage(host)
  )
    .getByRole('region', { name: 'バージョン情報・更新', exact: true })
    .waitFor();
  checks.push('manual current/available results and details navigation; no footer result');
  await dismissAll();
  fs.writeFileSync(path.join(settings.updates.hostSource, 'update.json'), 'PRIVATE_BAD_JSON');
  await host.evaluate(() => window.dock.checkUpdates());
  const updateError = await until(
    async () =>
      (await banner()).model.items.find((i) => i.body.includes('UPDATE_OPERATION_FAILED')),
    'update error',
  );
  assert(!updateError.body.includes('PRIVATE'));
  assert(!updateError.body.includes(profile));
  checks.push('update failure moves to errors without raw paths or payload');
  const slowServer = require('node:http').createServer(() => {});
  await new Promise((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${slowServer.address().port}/update.json`;
    const next = JSON.parse(fs.readFileSync(settingsFile));
    next.updates.hostSource = url;
    fs.writeFileSync(settingsFile, JSON.stringify(next));
    await until(
      async () => (await snapshot()).settings.value.updates.hostSource === url,
      'fixture source applied',
    );
    await dismissAll();
    await host.evaluate(() => {
      window.fixtureCheck = window.dock.checkUpdates();
    });
    await host.getByRole('region', { name: '更新の進捗', exact: true }).waitFor();
    await host.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await host.evaluate(() => window.fixtureCheck);
    await until(
      async () => (await info()).some((i) => i.body === '更新確認を取り消しました。'),
      'cancel receipt',
    );
    await until(
      async () => (await host.locator('.update-operation').count()) === 0,
      'cancel ends progress',
    );
    checks.push(
      'slow local update keeps progress and cancel; cancellation is information, not failure',
    );
  } finally {
    slowServer.closeAllConnections();
    await new Promise((resolve) => slowServer.close(resolve));
  }
  await dismissAll();
  await ui.getByRole('button', { name: 'Webアカウント', exact: true }).click();
  await ui.getByRole('button', { name: 'アカウント枠を追加', exact: true }).click();
  await until(
    async () => (await info()).some((i) => i.body === 'アカウント枠を追加しました。'),
    'account saved',
  );
  assert.equal(await ui.getByText('アカウント枠を追加しました。', { exact: true }).count(), 0);
  checks.push('settings Shell operation reports account creation once without inline duplicate');
  await dismissAll();
  await ui.getByRole('button', { name: '読み上げ', exact: true }).click();
  await ui.getByLabel('APIキー', { exact: true }).fill('PRIVATE_TEST_KEY');
  await ui.getByRole('button', { name: 'APIキーを設定', exact: true }).click();
  await until(
    async () => (await info()).some((i) => i.body === 'APIキーをこのPCに保存しました。'),
    'key saved',
  );
  assert(!(await info()).some((i) => i.body.includes('PRIVATE_TEST_KEY')));
  await ui.getByRole('button', { name: 'APIキーを削除', exact: true }).click();
  await until(
    async () => (await info()).some((i) => i.body === 'APIキーを削除しました。'),
    'key removed',
  );
  await ui.getByRole('button', { name: 'すべての読み上げを停止', exact: true }).click();
  await until(
    async () => (await info()).some((i) => i.body === '読み上げを停止しました。'),
    'stop receipt',
  );
  checks.push('TTS key save/delete and stop receipts use safe information text');
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

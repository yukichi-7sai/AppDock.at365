const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { fixtureServer } = require('../tests/fixtures/mcp-server.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { defaultMcpConnection } = require('../out/main/shared/mcp-client');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] && path.resolve(process.argv[2]),
  profile = path.join(
    root,
    '.artifacts',
    `mcp-settings-${portable ? 'portable' : 'source'}-${Date.now()}`,
  ),
  local = path.join(profile, 'local'),
  localFile = path.join(local, 'mcp-client-secrets.json'),
  checks = [],
  sessions = new Map();
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(local, { recursive: true });
const executable = portable ? testHostPath(profile) : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, executable);
  assert.equal(hash(executable), hash(portable));
}
let application,
  browser,
  child,
  host,
  requests = 0;
const remoteState = { count: 0, changed: false };
const server = http.createServer(async (req, res) => {
  requests++;
  if (req.url === '/auth' && req.headers.authorization !== 'Bearer fixture-private-token') {
    res.writeHead(401);
    res.end();
    return;
  }
  if (req.url === '/offline') {
    res.writeHead(503);
    res.end();
    return;
  }
  try {
    let session = sessions.get(req.headers['mcp-session-id']);
    if (!session) {
      const sdk = fixtureServer(remoteState),
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (id) => sessions.set(id, { sdk, transport }),
        });
      session = { sdk, transport };
      await sdk.connect(transport);
    }
    await session.transport.handleRequest(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
async function until(fn, label) {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label + (last ? ': ' + last.message : ''));
}
async function start() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    `--test-profile=${profile}`,
    `--test-local-state=${local}`,
    `--remote-debugging-port=${port}`,
  ];
  if (portable) {
    child = spawn(executable, args, {
      cwd: profile,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
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
    application = await electron.launch({ executablePath: executable, args, env, timeout: 60000 });
    host = await until(
      () => application.windows().find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
  }
  host.setDefaultTimeout(15000);
  await until(
    () => host.evaluate(async () => (await window.dock.snapshot()).startupReady),
    'ready',
  );
  await host.evaluate(() => window.dock.navigate('settings'));
  await host.getByRole('button', { name: 'MCPクライアント', exact: true }).click();
  await host.getByRole('table', { name: 'MCP接続先', exact: true }).waitFor();
}
async function stop() {
  if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  if (application) {
    await application.close();
    application = undefined;
  }
  if (browser) {
    await browser.close();
    browser = undefined;
  }
  if (child && child.exitCode === null)
    await until(() => child.exitCode !== null, 'portable exits');
  host = undefined;
}
async function notices() {
  const items = [];
  for (const page of host
    .context()
    .pages()
    .filter((p) => p.url().endsWith('/notifications.html'))) {
    const model = (await page.evaluate(() => window.appdockNotifications.connect())).snapshot;
    if (model.surface === 'banner') items.push(...model.items);
  }
  return items;
}
const row = (name) =>
  host.getByRole('table', { name: 'MCP接続先' }).getByRole('row').filter({ hasText: name });
async function noInlineError() {
  const pageError = await host.evaluate(async () => {
    const surface = document.querySelector('.settings-surface');
    return (await window.dock.settingsPage.get(surface.dataset.settingsConnection)).content.editing
      .error;
  });
  assert.equal(pageError, '');
  assert.equal(await host.locator('.settings-surface [role="alert"]').count(), 0);
  assert.equal(await host.locator('.settings-surface .error-banner').count(), 0);
  assert.equal(await host.getByRole('button', { name: /設定の再読み込み/ }).count(), 0);
}
async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port,
    authId = randomUUID(),
    offlineId = randomUUID();
  const settings = createDefaultSettings();
  Object.assign(settings.host, {
    closeToTray: false,
    soundEnabled: false,
    hardwareAcceleration: false,
  });
  settings.gestures.enabled = false;
  settings.keybindings = [];
  settings.updates.checkHostOnStartup = false;
  settings.updates.checkAppletsOnStartup = false;
  settings.mcpClient = {
    version: 1,
    commands: [],
    servers: [
      {
        id: authId,
        name: 'Restored server',
        description: '',
        requiresEnvironment: false,
        connection: {
          ...defaultMcpConnection(),
          url: url + '/auth',
          authentication: 'bearer',
          enabled: true,
        },
      },
      {
        id: offlineId,
        name: 'Offline',
        description: '',
        requiresEnvironment: false,
        connection: { ...defaultMcpConnection(), url: url + '/offline' },
      },
    ],
  };
  require('./test-settings.cjs').write(profile, settings);
  const sharedFile = require('./test-settings.cjs').file(profile),
    deviceFile = require('./test-settings.cjs').file(
      profile,
      'settings-' + require('node:os').hostname() + '.json',
    );
  fs.writeFileSync(path.join(local, 'mcp-client.json'), 'legacy-not-imported');
  const sharedBefore = fs.readFileSync(sharedFile);
  await start();
  assert.equal(requests, 0);
  assert.equal(await host.getByRole('button', { name: 'JSON', exact: true }).count(), 1);
  assert.match(await row('Restored server').innerText(), /認証情報を再設定/);
  assert.equal(
    JSON.parse(fs.readFileSync(deviceFile)).mcpClient.servers[0].connection.enabled,
    true,
  );
  await host.getByRole('button', { name: '接続先を追加', exact: true }).click();
  let dialog = host.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '名前', exact: true }).fill('Invalid draft');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'MCPのURLを入力してください' }).waitFor();
  assert.equal(
    await dialog.getByRole('textbox', { name: '名前', exact: true }).inputValue(),
    'Invalid draft',
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  const repair = async () => {
    await row('Restored server')
      .getByRole('button', { name: '認証情報を再設定', exact: true })
      .click();
    dialog = host.getByRole('dialog');
    assert.equal(await dialog.getByLabel('ID', { exact: true }).inputValue(), authId);
    await dialog.getByLabel('Bearer token', { exact: true }).fill('fixture-private-token');
    const before = requests;
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(requests, before, 'credential save never connects or executes');
    assert.equal(
      JSON.parse(fs.readFileSync(deviceFile)).mcpClient.servers[0].connection.enabled,
      true,
    );
  };
  await repair();
  await require('./mcp-toolbar-checks.cjs')({ host, profile, deviceFile, localFile, repair });
  checks.push(
    'shared top toolbar, JSON edits and invalid draft retention, isolated connection/command/tool resets, cancellation and whole JSON reset',
  );
  await row('Restored server').getByRole('button', { name: '接続確認', exact: true }).click();
  await until(
    async () => (await row('Restored server').innerText()).includes('接続済み'),
    'connection checked',
  );
  assert.equal(remoteState.count, 0);
  await row('Offline').getByRole('switch').click();
  await until(
    () => !JSON.parse(fs.readFileSync(deviceFile)).mcpClient.servers[1].connection.enabled,
    'failed activation returns OFF',
  );
  checks.push(
    'device-only definitions, restored ON retained, local key re-entry without connection, explicit connection check and failed OFF-to-ON rollback',
  );
  await host.getByRole('button', { name: 'ツール確認', exact: true }).click();
  await host.getByLabel('確認するMCP接続先', { exact: true }).selectOption(authId);
  await until(() => host.getByLabel('MCPツール', { exact: true }).isEnabled(), 'tools discovered');
  await host.getByLabel('MCPツール', { exact: true }).selectOption('echo');
  await host.getByLabel('MCPツールの引数', { exact: true }).fill('{"message":"saved"}');
  await host.getByRole('button', { name: 'コマンドとして追加', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByLabel('名前', { exact: true }).fill('Saved MCP');
  await dialog.getByLabel('有効', { exact: true }).check();
  await until(
    () => dialog.getByRole('button', { name: 'OK', exact: true }).isEnabled(),
    'command draft ready',
  );
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const saved = JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0],
    commandId = 'appdock.mcp.tool.' + saved.id;
  assert(saved.toolBinding);
  assert.equal(saved.enabled, true);
  assert.equal(remoteState.count, 0);
  assert(!fs.readFileSync(deviceFile, 'utf8').includes('fixture-private-token'));
  assert(!fs.readFileSync(localFile, 'utf8').includes('fixture-private-token'));
  await host.getByRole('button', { name: 'MCPツールコマンド', exact: true }).click();
  await host.getByRole('button', { name: 'Saved MCPを編集', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByLabel('固定引数（JSON）', { exact: true }).fill('{bad');
  await until(
    async () => !(await dialog.getByRole('button', { name: 'OK', exact: true }).isEnabled()),
    'bad JSON remains invalid',
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.deepEqual(JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0], saved);
  await host.evaluate(async (command) => {
    const state = await window.dock.snapshot();
    state.settings.value.keybindings = [
      {
        id: 'mcp-ui',
        command,
        key: 'Ctrl+Alt+F7',
        enabled: true,
        when: { scope: 'app', appletIds: [] },
      },
    ];
    await window.dock.saveSettings(state.settings.value, state.settings.revision);
  }, commandId);
  assert.equal(
    (await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+Alt+F7'))).executed,
    1,
  );
  await until(() => remoteState.count === 1, 'saved command executes');
  await host.getByRole('button', { name: 'ツール確認', exact: true }).click();
  await until(async () => {
    const surface = host.locator('.settings-surface');
    const model = await host.evaluate(async () =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
    return (
      model.content.auxiliary.mcpClient.jobs.every((job) => job.state !== 'running') &&
      (await surface.getByRole('button', { name: '結果を表示', exact: true }).count()) > 0
    );
  }, 'completed job displayed');
  const beforeToolReset = fs.readFileSync(deviceFile);
  await host.getByRole('button', { name: '結果を表示', exact: true }).first().click();
  await host.getByRole('button', { name: 'このタブの設定を既定値に戻す', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByRole('button', { name: '既定値に戻す', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await host.getByRole('button', { name: '結果を表示', exact: true }).count(), 0);
  assert.deepEqual(fs.readFileSync(deviceFile), beforeToolReset);
  checks.push('tool reset clears completed result display without changing saved definitions');
  const binding = JSON.stringify(saved.toolBinding);
  await stop();
  fs.unlinkSync(localFile);
  await start();
  assert.equal(
    JSON.stringify(JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0].toolBinding),
    binding,
  );
  await row('Restored server')
    .getByRole('button', { name: 'Restored serverを編集', exact: true })
    .click();
  dialog = host.getByRole('dialog');
  await dialog.getByLabel('説明', { exact: true }).fill('Metadata without credentials');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    fs.existsSync(localFile),
    false,
    'metadata edit does not initialize or replace secrets',
  );
  await repair();
  assert.equal(
    (await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+Alt+F7'))).executed,
    1,
  );
  await until(() => remoteState.count === 2, 'restored command executes without rebinding');
  checks.push(
    'tool-to-command dialog, invalid JSON retention, stable shortcut ID, restart and lost credentials recovered without changing tool approval',
  );
  remoteState.changed = true;
  await assert.rejects(host.evaluate((id) => window.dock.executeCommand(id), commandId));
  assert.equal(remoteState.count, 2);
  await host.getByRole('button', { name: 'MCPツールコマンド', exact: true }).click();
  await host.getByRole('button', { name: 'Saved MCPを編集', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByTestId('custom-command-tool-review').waitFor();
  await dialog.getByTestId('custom-command-accept-tool').click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.notEqual(
    JSON.stringify(JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0].toolBinding),
    binding,
  );
  await host.getByRole('button', { name: 'Saved MCPを編集', exact: true }).click();
  dialog = host.getByRole('dialog');
  await host.screenshot({ path: path.join(profile, 'command-light.png') });
  await host.evaluate(async () => {
    const state = await window.dock.snapshot();
    state.settings.value.host.theme = 'dark';
    await window.dock.saveSettings(state.settings.value, state.settings.revision);
  });
  await host.setViewportSize({ width: 740, height: 760 });
  await host.screenshot({ path: path.join(profile, 'command-dark-narrow.png') });
  const bounds = await dialog.evaluate((el) => ({
    width: el.scrollWidth,
    client: el.clientWidth,
    bottom: el.querySelector('footer').getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  assert(bounds.width <= bounds.client + 1 && bounds.bottom <= bounds.height);
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await host.getByRole('button', { name: '接続先', exact: true }).click();
  await row('Restored server')
    .getByRole('button', { name: 'Restored serverを削除', exact: true })
    .click();
  dialog = host.getByRole('dialog');
  assert.match(await dialog.innerText(), /1件/);
  await dialog.getByRole('button', { name: '削除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0].id, saved.id);
  checks.push(
    'changed tool rejected until explicit adoption; light and narrow dark dialogs; deleting server preserves command and bindings',
  );
  fs.writeFileSync(localFile, 'corrupt original secret document');
  await host.getByRole('button', { name: '認証情報を初期化', exact: true }).waitFor();
  await row('Offline').getByRole('button', { name: 'Offlineを編集', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByLabel('説明', { exact: true }).fill('Metadata with corrupt file');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(fs.readFileSync(localFile, 'utf8'), 'corrupt original secret document');
  await host.getByRole('button', { name: '認証情報を初期化', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(JSON.parse(fs.readFileSync(deviceFile)).mcpClient.commands[0].id, saved.id);
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  await host.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  dialog = host.getByRole('dialog');
  await dialog.getByRole('button', { name: '既定値に戻す', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(JSON.parse(fs.readFileSync(deviceFile)).mcpClient, {
    version: 1,
    servers: [],
    commands: [],
  });
  assert.equal(
    (await host.evaluate(() => window.dock.snapshot())).settings.value.keybindings[0].command,
    commandId,
  );
  checks.push(
    'metadata retains absent and corrupt secrets; explicit credential reset preserves definitions; page reset preserves shortcut references',
  );
  assert.equal(fs.readFileSync(path.join(local, 'mcp-client.json'), 'utf8'), 'legacy-not-imported');
  const shared = JSON.parse(fs.readFileSync(sharedFile));
  assert.equal(shared.mcpClient, undefined);
  assert.equal(shared.mcpServers, undefined);
  await host.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
  await host.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
  assert.equal(
    await host.getByRole('dialog').locator('option[value="appdock.mcp.call"]').count(),
    0,
  );
  await host.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  const version = await host.evaluate(async () => (await window.dock.snapshot()).version);
  assert.equal(version, require('../package.json').version);
  const result = {
    ok: true,
    version,
    profile,
    portable: !!portable,
    exeSha256: portable && hash(executable),
    checks,
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

main()
  .catch(async (error) => {
    console.error(error);
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    await Promise.allSettled([...sessions.values()].map((s) => s.sdk.close()));
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

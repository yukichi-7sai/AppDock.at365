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
  localFile = path.join(local, 'mcp-client.json'),
  checks = [],
  sessions = new Map();
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(local, { recursive: true });
const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, executable);
  assert.equal(hash(executable), hash(portable));
}
let application,
  browser,
  child,
  host,
  requests = 0;
const server = http.createServer(async (req, res) => {
  requests++;
  if (req.url === '/offline') {
    res.writeHead(503);
    res.end();
    return;
  }
  try {
    let session = sessions.get(req.headers['mcp-session-id']);
    if (!session) {
      const sdk = fixtureServer({ count: 0, changed: false }),
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
  const url = `http://127.0.0.1:${server.address().port}`,
    ids = Object.fromEntries(
      ['shared', 'broken', 'good', 'offline', 'auth'].map((key) => [key, randomUUID()]),
    ),
    settings = createDefaultSettings();
  settings.host.closeToTray = false;
  settings.host.soundEnabled = false;
  settings.gestures.enabled = false;
  settings.keybindings = [];
  settings.updates.checkHostOnStartup = false;
  settings.updates.checkAppletsOnStartup = false;
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
  settings.mcpServers = {
    version: 1,
    items: Object.entries(ids).map(([key, id]) => ({ id, name: key, description: '' })),
  };
  fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
  const broken = {
      connection: { enabled: false, url: 'invalid' },
      secret: 'preserve-broken-value',
    },
    auth = {
      connection: { ...defaultMcpConnection(), url: url + '/mcp', authentication: 'bearer' },
      secret: 'unreadable-ciphertext',
    };
  fs.writeFileSync(
    localFile,
    JSON.stringify({
      version: 1,
      entries: {
        [ids.broken]: broken,
        [ids.good]: { connection: { ...defaultMcpConnection(), url: url + '/mcp' } },
        [ids.offline]: { connection: { ...defaultMcpConnection(), url: url + '/offline' } },
        [ids.auth]: auth,
      },
    }),
  );
  await start();
  assert.equal((await notices()).length, 0);
  assert.equal(requests, 0);
  assert.equal(await row('shared').getByRole('switch').isDisabled(), true);
  assert.equal(await row('broken').getByRole('switch').isDisabled(), true);
  assert.equal(await row('good').getByRole('switch').isEnabled(), true);
  checks.push(
    'shared-only and OFF damaged entries produce no startup notice; unconfigured switches disabled',
  );
  const sharedFile = require('./test-settings.cjs').file(profile, 'settings.json');
  const beforeAdd = [fs.readFileSync(sharedFile, 'utf8'), fs.readFileSync(localFile, 'utf8')];
  await host.getByRole('button', { name: '接続先を追加', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: '名前', exact: true })
    .fill('dialog-added');
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('alert')
    .filter({ hasText: 'MCPのURLを入力してください' })
    .waitFor();
  assert.equal(
    await host.getByRole('dialog').getByRole('textbox', { name: '名前', exact: true }).inputValue(),
    'dialog-added',
  );
  await noInlineError();
  assert.deepEqual(
    [fs.readFileSync(sharedFile, 'utf8'), fs.readFileSync(localFile, 'utf8')],
    beforeAdd,
  );
  await host.screenshot({ path: path.join(profile, 'add-validation-error.png') });
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: 'MCPのURL', exact: true })
    .fill(url + '/mcp');
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await until(() => row('dialog-added').count(), 'valid add after dialog error');
  const addedId = JSON.parse(fs.readFileSync(sharedFile)).mcpServers.items.find(
    (i) => i.name === 'dialog-added',
  ).id;
  await noInlineError();
  checks.push(
    'add validation appears only in the dialog, keeps drafts and files intact, and retries successfully',
  );
  await row('good').getByRole('button', { name: 'goodを編集', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: '名前', exact: true })
    .fill('healthy');
  const beforeEdit = [fs.readFileSync(sharedFile, 'utf8'), fs.readFileSync(localFile, 'utf8')];
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: 'MCPのURL', exact: true })
    .fill('bad-url');
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('alert')
    .filter({ hasText: 'MCPのURLを入力してください' })
    .waitFor();
  assert.equal(
    await host.getByRole('dialog').getByRole('textbox', { name: '名前', exact: true }).inputValue(),
    'healthy',
  );
  assert.equal(
    await host
      .getByRole('dialog')
      .getByRole('textbox', { name: 'MCPのURL', exact: true })
      .inputValue(),
    'bad-url',
  );
  await noInlineError();
  assert.deepEqual(
    [fs.readFileSync(sharedFile, 'utf8'), fs.readFileSync(localFile, 'utf8')],
    beforeEdit,
  );
  await host.screenshot({ path: path.join(profile, 'edit-validation-error.png') });
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: 'MCPのURL', exact: true })
    .fill(url + '/mcp');
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await until(() => row('healthy').count(), 'healthy rename');
  assert.deepEqual(JSON.parse(fs.readFileSync(localFile)).entries[ids.broken], broken);
  assert.deepEqual(JSON.parse(fs.readFileSync(localFile)).entries[ids.auth], auth);
  checks.push('healthy row editing preserves both malformed entry and encrypted secret');
  checks.push(
    'edit validation stays inside the dialog and preserves name, URL, and persisted settings until corrected',
  );
  await row('healthy').getByRole('switch').click();
  await until(
    async () => (await row('healthy').innerText()).includes('接続済み'),
    'connected after ON',
  );
  assert.equal(await row('healthy').getByRole('switch').getAttribute('aria-checked'), 'true');
  assert(requests > 0);
  await row('healthy').getByRole('switch').click();
  await until(
    async () => (await row('healthy').getByRole('switch').getAttribute('aria-checked')) === 'false',
    'OFF',
  );
  checks.push(
    'configured disconnected connection activates with real MCP handshake and can be disabled',
  );
  for (const name of ['offline', 'auth']) {
    const beforeWarnings = await host.evaluate(
      async () =>
        (await window.dock.snapshot()).logs.filter(
          (entry) => entry.source === 'mcp-client' && entry.message.includes('[WARNING]'),
        ).length,
    );
    await row(name).getByRole('switch').click();
    await until(
      async () => (await notices()).some((n) => n.ownerId === 'warnings'),
      'warning banner',
    );
    await until(
      async () =>
        (await row(name).getByRole('switch').getAttribute('aria-checked')) === 'false' &&
        (await row(name).getByRole('switch').isEnabled()),
      'failed activation OFF',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(localFile)).entries[ids[name]].connection.enabled,
      false,
    );
    await noInlineError();
    assert((await notices()).every((n) => n.level === 'warning'));
    const afterWarnings = await host.evaluate(
      async () =>
        (await window.dock.snapshot()).logs.filter(
          (entry) => entry.source === 'mcp-client' && entry.message.includes('[WARNING]'),
        ).length,
    );
    assert.equal(afterWarnings - beforeWarnings, 1, 'one warning per failed activation');
  }
  checks.push(
    'network and credential activation failures persist OFF and publish only warning banners without inline error or reload',
  );
  await row('offline').getByRole('button', { name: 'offlineを編集', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('checkbox', { name: 'このPCで接続を許可する', exact: true })
    .check();
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await until(
    async () => (await host.getByRole('dialog').count()) === 0,
    'failed ON save closes normally',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(localFile)).entries[ids.offline].connection.enabled,
    false,
  );
  await noInlineError();
  checks.push(
    'dialog save with ON persists the connection OFF after failure and closes without an inline error',
  );
  await host.getByRole('combobox', { name: '確認するMCP接続先' }).selectOption(ids.offline);
  await until(
    async () => await host.getByRole('combobox', { name: '確認するMCP接続先' }).isEnabled(),
    'inspection finished',
  );
  await noInlineError();
  checks.push(
    'selection-triggered tool inspection failure also leaves settings editable without reload',
  );
  await row('broken').getByRole('button', { name: 'brokenを編集', exact: true }).click();
  await host
    .getByRole('dialog')
    .getByRole('textbox', { name: 'MCPのURL', exact: true })
    .fill(url + '/mcp');
  await host.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await until(() => row('broken').getByRole('switch').isEnabled(), 'explicit repair');
  assert.deepEqual(JSON.parse(fs.readFileSync(localFile)).entries[ids.auth], auth);
  checks.push('explicit repair restores the affected row without replacing another credential');
  await host.screenshot({ path: path.join(profile, 'settings-light.png') });
  await noInlineError();
  const shared = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json')));
  assert.deepEqual(
    shared.mcpServers.items.map((i) => i.id),
    [...Object.values(ids), addedId],
  );
  assert(!JSON.stringify(shared).includes(url));
  assert(!JSON.stringify(shared).includes('unreadable-ciphertext'));
  await stop();
  await start();
  assert.equal((await notices()).length, 0);
  assert.equal(await row('shared').getByRole('switch').isDisabled(), true);
  await noInlineError();
  checks.push('restart retains shared IDs and local OFF states without startup warning');
  await host.screenshot({ path: path.join(profile, 'settings-restarted.png') });
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

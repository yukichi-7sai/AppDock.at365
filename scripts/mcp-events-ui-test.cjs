const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { parse } = require('smol-toml');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'mcp-events-ui-' + Date.now());
const local = path.join(profile, 'local'),
  config = path.join(profile, 'codex-fixture', 'config.toml');
fs.mkdirSync(local, { recursive: true });
fs.mkdirSync(path.dirname(config), { recursive: true });
fs.writeFileSync(config, '# isolated MCP Events test\n');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
settings.keybindings = [];
settings.gestures.enabled = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const type = require('../out/main/shared/notification-types')
  .notificationCatalog([])
  .find((t) => !t.requiredTargets.length);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
let child, browser, host;
const checks = [],
  errors = [];
async function until(fn, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
}
async function start() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    exe,
    [
      ...(portable ? [] : [root]),
      '--test-profile=' + profile,
      '--test-local-state=' + local,
      '--remote-debugging-port=' + port,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
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
  browser.contexts()[0].on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  await until(
    () => host.evaluate(async () => (await window.dock?.snapshot())?.startupReady),
    'startup',
  );
}
async function stop() {
  if (child?.exitCode === null) {
    await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    await until(() => child.exitCode !== null, 'shutdown');
  }
  await browser?.close();
  browser = undefined;
}
const action = (value) => host.evaluate((value) => window.dock.automation(value), value);
async function page() {
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  const p = await require('./settings-host-helper.cjs').settingsPage(host);
  await p.getByRole('button', { name: '通知', exact: true }).click();
  const card = p
    .locator('.notification-setting-card')
    .filter({ has: p.getByRole('heading', { name: type.title, exact: true }) });
  if (!(await card.evaluate((e) => e.open))) await card.locator(':scope > summary').click();
  return p;
}
async function rpc(method, args = {}) {
  const state = (await action({ kind: 'status' })).state;
  const headers = parse(fs.readFileSync(config, 'utf8')).mcp_servers[state.serverId].http_headers;
  const response = await fetch(state.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
        ...args,
      },
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
(async () => {
  let success = false;
  try {
    await start();
    let p = await page();
    const label = type.title + 'をMCP Eventsで送信';
    assert.equal(await p.getByLabel(label, { exact: true }).isChecked(), false);
    await p
      .locator('.notification-setting-card')
      .filter({ has: p.getByRole('heading', { name: type.title, exact: true }) })
      .getByText('購読中のdot等へタイトルと本文を送信。OFF中は送信を止め、購読は有効期限まで保持', {
        exact: true,
      })
      .waitFor();
    await action({ kind: 'selectConfig', file: config });
    await action({ kind: 'configure', enabled: true, allowWrite: false, port: 0 });
    await action({ kind: 'register' });
    assert.deepEqual((await rpc('events/list')).result.events, []);
    checks.push('fresh profile defaults OFF and exposes no notification events');
    await p.getByLabel(type.title + 'の通知センターのみ', { exact: true }).check();
    await settleSettings(p);
    await p.getByLabel(label, { exact: true }).check();
    await settleSettings(p);
    await p.getByText(/^MCP Eventsのみ ／/).waitFor();
    assert.equal(
      await p.getByLabel(type.title + 'の通知センターのみ', { exact: true }).isChecked(),
      false,
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json')),
      ).notificationPreferences.overrides.find(
        (r) => r.ownerId === type.ownerId && r.typeId === type.typeId,
      ).mcpEvents,
      true,
    );
    const discovered = await rpc('server/discover');
    assert.ok(discovered.result.capabilities.events);
    const listed = await rpc('events/list');
    assert.ok(listed.result.events[0].description.includes(type.typeId));
    const rejected = await rpc('events/subscribe', {
      name: 'appdock.notification.created',
      arguments: { ownerKind: type.ownerKind, ownerId: type.ownerId, typeId: type.typeId },
      delivery: {
        mode: 'webhook',
        url: 'https://127.0.0.1/events',
        secret: 'whsec_' + Buffer.alloc(32).toString('base64'),
      },
    });
    assert.equal(rejected.error.code, -32602);
    checks.push(
      'immediate selection save, accurate MCP-only summary, authenticated MCP 2 discovery, selected catalog and private callback rejection',
    );
    await p.getByLabel(label, { exact: true }).scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(profile, 'settings.png') });
    await stop();
    await start();
    p = await page();
    assert.equal(await p.getByLabel(label, { exact: true }).isChecked(), true);
    assert.equal((await rpc('events/list')).result.events.length, 1);
    checks.push('choice and MCP connection survive full application restart');
    await p.getByLabel(type.title + 'の通知センターのみ', { exact: true }).check();
    await settleSettings(p);
    assert.equal(await p.getByLabel(label, { exact: true }).isChecked(), false);
    assert.deepEqual((await rpc('events/list')).result.events, []);
    checks.push('center-only clears event sending and removes event catalog');
    await stop();
    await start();
    p = await page();
    assert.equal(await p.getByLabel(label, { exact: true }).isChecked(), false);
    assert.deepEqual((await rpc('events/list')).result.events, []);
    await p.getByLabel(label, { exact: true }).check();
    await settleSettings(p);
    assert.equal((await rpc('events/list')).result.events.length, 1);
    checks.push('OFF survives restart and ON resumes selected event discovery');
    await action({ kind: 'unregister' });
    assert.equal(fs.readFileSync(config, 'utf8'), '# isolated MCP Events test\n');
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      await stop();
    } catch (error) {
      child?.kill();
      success = false;
      process.exitCode = 1;
    }
    const result = {
      success,
      profile,
      checks,
      errors,
      version: require('../package.json').version,
      portable: portable ? { sha256: hash(portable), copySha256: hash(exe) } : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();

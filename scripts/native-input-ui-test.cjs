const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { getPublishDirectory } = require('./publish-paths.cjs');
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const { freePort, inspect } = require('./electron-main-helper.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const { NativeInput } = require('../out/main/main/core/native-input');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '..'),
  packaged = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', 'native-input-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
const ids = ['at365.web-browser-tools'];
const keyId = require('node:crypto').randomUUID(),
  keyCommand = 'appdock.custom.' + keyId;
settings.customCommands = {
  version: 2,
  items: [
    {
      id: keyId,
      typeId: 'appdock.input.sendKeys',
      owner: { kind: 'host' },
      title: 'Host key input',
      description: 'Native input fixture',
      configVersion: 1,
      config: { keys: 'Ctrl+A' },
      enabled: true,
      automation: true,
    },
  ],
};
for (const name of ['WebBrowserTools']) {
  const source = path.join(
    getPublishDirectory(path.resolve(root, `../Applet.${name}.at365`)),
    `Applet.${name}.at365`,
  );
  const dest = path.join(profile, 'extensions', name);
  fs.cpSync(source, dest, { recursive: true });
  const file = path.join(dest, 'extension.json'),
    m = JSON.parse(fs.readFileSync(file));
  if (name === 'WebBrowserTools')
    m.commands.find((c) => c.id.endsWith('.close-tab')).automation = true;
  fs.writeFileSync(file, JSON.stringify(m));
  settings.extensions[m.id] = {
    enabled: true,
    settings: {},
  };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
let application, target, targetPeer, client, page, sender, packagedChild, browser, resourcesPath;
let processOutput = '';
const checks = [],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const value = await fn();
    if (value) return value;
    await sleep(50);
  }
  throw Error(label);
}
async function focus() {
  return until(async () => {
    // Startup surfaces can briefly take foreground after the fixture is shown.
    // Retry acquisition only here, before starting an input/cancellation case.
    await targetPeer.request('focus');
    const s = await targetPeer.request('snapshot');
    return s.focused && s;
  }, 'target focus');
}
async function events() {
  return (await targetPeer.request('snapshot')).events;
}
async function clear() {
  await targetPeer.request('clear');
}
async function execute(id) {
  return page.evaluate((id) => window.dock.executeCommand(id), id);
}
(async () => {
  try {
    if (packaged) {
      const port = await freePort(),
        mainPort = await freePort();
      const executable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(packaged, executable);
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      packagedChild = spawn(
        executable,
        [
          `--test-profile=${profile}`,
          `--test-local-state=${path.join(profile, 'local')}`,
          `--remote-debugging-port=${port}`,
          `--inspect=${mainPort}`,
        ],
        { cwd: root, env, windowsHide: true, stdio: 'pipe' },
      );
      packagedChild.stdout.on('data', (d) => (processOutput += d));
      packagedChild.stderr.on('data', (d) => (processOutput += d));
      await until(async () => {
        browser = await chromium
          .connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 })
          .catch(() => null);
        return browser;
      }, 'portable CDP');
      await until(() => {
        page = browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/'));
        return page;
      }, 'portable host page');
      resourcesPath = await inspect(mainPort, 'process.resourcesPath');
    } else {
      application = await electron.launch({
        executablePath: packaged || require('electron'),
        args: [
          ...(packaged ? [] : [root]),
          `--test-profile=${profile}`,
          `--test-local-state=${path.join(profile, 'local')}`,
        ],
        timeout: 30000,
      });
      page = await application.firstWindow();
      resourcesPath = await application.evaluate(() => process.resourcesPath);
    }
    await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      return (
        s.startupReady &&
        ids.every((id) =>
          s.extensions.some(
            (e) =>
              e.id === id &&
              e.state === 'running' &&
              e.commands.some((c) => c.id === id + '.new-tab'),
          ),
        )
      );
    }, 'Applet commands ready without WindowsTools');
    target = spawn(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
      ),
      [],
      { windowsHide: false, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    target.stderr.resume();
    targetPeer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    await page.evaluate(() => window.dock.setAppletApiPermissions({}));
    await focus();
    await assert.rejects(execute(ids[0] + '.new-tab'), /許可/);
    assert.deepEqual(await events(), []);
    await execute(keyCommand);
    await until(
      async () => (await events()).includes('key:A, Control'),
      'local host key ignores external grants',
    );
    await page.evaluate(() => window.dock.setAppletApiPermissions({ sendInput: true }));
    const snapshot = await page.evaluate(() => window.dock.snapshot());
    const expected = {
      'close-tab': 'key:F4, Control',
      back: 'app:1',
      forward: 'app:2',
      reload: 'app:3',
      'super-reload': 'key:F5, Control',
      'toggle-fullscreen': 'key:F11',
      'new-tab': 'key:T, Control',
      'new-window': 'key:N, Control',
      'previous-tab': 'key:Tab, Shift, Control',
      'next-tab': 'key:Tab, Control',
      'restore-tab': 'key:T, Shift, Control',
    };
    for (const command of snapshot.extensions.find((e) => e.id === ids[0]).commands) {
      // Ordinary commands deliberately retain the native 150 ms re-entry guard.
      await sleep(170);
      await focus();
      await clear();
      await execute(command.id);
      await until(
        async () => (await events()).includes(expected[command.id.split('.').at(-1)]),
        command.id,
      );
    }
    await sleep(170);
    await clear();
    await execute(keyCommand);
    await until(
      async () => (await events()).some((e) => e.includes('A') && e.includes('Control')),
      'host custom input delivered',
    );
    checks.push(
      'host custom command without WindowsTools and real Node WebBrowserTools eleven commands use shared native input; direct Applet input grant remains independent of read permission',
    );
    await focus();
    await clear();
    await targetPeer.request('hold');
    await sleep(60);
    const pending = execute(ids[0] + '.new-tab').then(
      () => ({ ok: true }),
      (error) => ({ error: String(error) }),
    );
    await sleep(100);
    await page.evaluate(() => window.dock.setAppletApiPermissions({}));
    assert.ok((await pending).error);
    await targetPeer.request('release');
    await sleep(200);
    assert.ok(
      !(await events()).some((e) => e.startsWith('key:T')),
      'revocation must cancel pending send',
    );
    await page.evaluate(() => window.dock.setAppletApiPermissions({ sendInput: true }));
    checks.push('global Applet permission revocation cancels pending delegated input');
    const cfg = path.join(profile, 'codex', 'config.toml');
    await page.evaluate(async (file) => {
      await window.dock.automation({ kind: 'selectConfig', file });
      await window.dock.automation({
        kind: 'configure',
        enabled: true,
        allowWrite: false,
        port: 0,
      });
      await window.dock.automation({ kind: 'setExecution', allowed: true });
      await window.dock.automation({ kind: 'register' });
    }, cfg);
    const state = (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
    client = new Client({ name: 'input-regression', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(state.endpoint), {
        requestInit: {
          headers: parse(fs.readFileSync(cfg, 'utf8')).mcp_servers[state.serverId].http_headers,
        },
      }),
    );
    assert(!(await client.listTools()).tools.some((t) => t.name === 'appdock_send_keys'));
    assert.ok(
      (await client.callTool({ name: 'appdock_send_keys', arguments: { keys: 'A' } })).isError,
    );
    assert(
      (await client.callTool({ name: 'appdock_execute_command', arguments: { id: keyCommand } }))
        .isError,
    );
    assert(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: ids[0] + '.close-tab' },
        })
      ).isError,
    );
    await page.evaluate(() => window.dock.automation({ kind: 'setInputSending', allowed: true }));
    await focus();
    await clear();
    const result = await client.callTool({
      name: 'appdock_execute_command',
      arguments: { id: ids[0] + '.close-tab' },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.ok((await events()).length > 0);
    await focus();
    await clear();
    assert.equal(
      (await client.callTool({ name: 'appdock_execute_command', arguments: { id: keyCommand } }))
        .structuredContent.result.completion,
      'inputSubmitted',
    );
    await until(async () => (await events()).includes('key:A, Control'), 'MCP host key delivered');
    checks.push(
      'MCP cannot discover raw input; saved host key and published Applet command require independent MCP input grant with write OFF',
    );
    await focus();
    await clear();
    await targetPeer.request('hold');
    await sleep(60);
    const pendingHost = client.callTool({
      name: 'appdock_execute_command',
      arguments: { id: keyCommand },
    });
    await sleep(100);
    await page.evaluate(() => window.dock.automation({ kind: 'setInputSending', allowed: false }));
    assert((await pendingHost).isError);
    await targetPeer.request('release');
    await sleep(200);
    assert(!(await events()).some((e) => e.startsWith('key:A')));
    checks.push(
      'MCP permission revocation cancels a saved host key while a modifier is physically held',
    );
    sender = new NativeInput(
      packaged
        ? path.join(resourcesPath, 'dotnet-host/input/AppDock.InputHost.exe')
        : path.join(root, '.artifacts/dotnet-host/input/AppDock.InputHost.exe'),
    );
    const focused = await focus();
    await clear();
    await assert.rejects(
      sender.send('input.sendKeys', { keys: 'A' }, 'fixture', { window: '1', source: 'gesture' }),
      { code: 'INPUT_FAILED' },
    );
    // A foreground change tests target protection instead of cancellation. Retry only
    // that observed environmental interruption, and still require real cancellation.
    let cancellationVerified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await focus();
      await clear();
      const controller = new AbortController();
      try {
        await targetPeer.request('hold');
        await sleep(60);
        const cancelled = sender
          .send('input.sendKeys', { keys: 'A' }, 'fixture', {
            window: focused.window,
            source: 'gesture',
            signal: controller.signal,
          })
          .then(
            () => false,
            (e) => e.code,
          );
        await sleep(70);
        controller.abort();
        const code = await cancelled;
        const state = await targetPeer.request('snapshot');
        if (code === 'INPUT_FAILED' && !state.focused) {
          console.error(
            'Cancellation fixture lost foreground; restarting this case: ' + (attempt + 1),
          );
          continue;
        }
        assert.equal(code, 'CANCELLED');
        assert.ok(!state.events.some((e) => e.startsWith('key:A')));
        cancellationVerified = true;
        break;
      } finally {
        controller.abort();
        await targetPeer.request('release');
      }
    }
    assert.ok(cancellationVerified, 'Cancellation requires an uninterrupted foreground target');
    await sleep(60);
    await clear();
    const before = Date.now();
    for (let i = 0; i < 3; i++)
      await sender.send('input.sendKeys', { keys: 'Ctrl+A' }, 'fixture', {
        window: focused.window,
        source: 'gesture',
      });
    assert.ok((await events()).length >= 3);
    checks.push(
      'native worker rejects changed target, cancels while modifiers held, and accepts consecutive gesture input without 150ms waits; elapsed=' +
        (Date.now() - before) +
        'ms',
    );
    for (const [keys, symbol] of [
      ['Period', '.'],
      ['Semicolon', ';'],
      ['Slash', '/'],
      ['Plus', '+'],
      ['Minus', '-'],
    ]) {
      const state = await focus();
      await clear();
      assert.ok(state.symbolKeys[symbol], 'Foreground layout supports ' + symbol);
      await sender.send('input.sendKeys', { keys }, 'fixture', {
        window: state.window,
        source: 'gesture',
      });
      await until(
        async () => (await events()).includes(state.symbolKeys[symbol]),
        'layout-specific symbol ' + symbol,
      );
    }
    checks.push('symbol keys delivered to the isolated target using its current keyboard layout');
    const logs = (await page.evaluate(() => window.dock.snapshot())).logs;
    assert.ok(
      logs.some(
        (l) =>
          l.source === ids[0] &&
          l.message.includes('API=input.sendKeys') &&
          l.message.includes('success'),
      ),
    );
    assert.ok(
      logs.some(
        (l) =>
          l.source === ids[0] &&
          l.message.includes('API=input.sendKeys') &&
          l.message.includes('failed'),
      ),
    );
    const output = { ok: true, profile, packaged, checks };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure-state.json'),
      JSON.stringify((await targetPeer?.request('snapshot').catch(() => null)) ?? null, null, 2),
    );
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    sender?.close();
    await client?.close().catch(() => {});
    if (targetPeer && !targetPeer.closed) await targetPeer.request('release').catch(() => {});
    target?.stdin.end();
    await application?.close();
    if (packagedChild) {
      await page?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => packagedChild.exitCode !== null, 'portable shutdown').catch(() =>
        packagedChild.kill(),
      );
      await browser?.close().catch(() => {});
      fs.writeFileSync(path.join(profile, 'process.log'), processOutput);
    }
    if (target) {
      await sleep(100);
      if (target.exitCode === null) target.kill();
    }
  }
})();

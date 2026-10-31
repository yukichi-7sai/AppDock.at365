const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `noop-command-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const source = process.argv[2] && path.resolve(process.argv[2]);
const executable = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (source) {
  require('./copy-host.cjs').copyHost(source, executable);
  assert.equal(hash(source), hash(executable));
}
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.updates.checkHostOnAboutOpen = false;
settings.keybindings = [
  {
    id: 'noop',
    command: 'appdock.noop',
    key: 'Ctrl+Alt+F10',
    enabled: true,
    when: { scope: 'global', appletIds: [] },
    blockOriginalInput: true,
  },
];
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(100);
  }
  throw Error(message);
}
let child,
  browser,
  host,
  target,
  peer,
  output = '';
const checks = [];
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function apply(mode) {
  await host.evaluate(async (mode) => {
    const state = await window.dock.snapshot();
    const row = state.settings.value.keybindings.find((row) => row.id === 'noop');
    row.blockOriginalInput = mode !== 'pass';
    row.enabled = mode !== 'disabled';
    row.when =
      mode === 'miss'
        ? { scope: 'exe', appletIds: [], processes: ['appdock-noop-mismatch'] }
        : { scope: 'global', appletIds: [] };
    await window.dock.saveSettings(state.settings.value, state.settings.revision);
  }, mode);
  await until(async () => {
    const rows = (await snapshot()).globalHotKeys;
    return mode === 'disabled'
      ? rows.length === 0
      : rows.some((row) => row.shortcut === 'Ctrl+Alt+F10' && row.registered);
  }, 'binding applied');
  // Wait for native reconfiguration acknowledgement before checking input delivery.
  await sleep(300);
}
async function input(blocked) {
  await peer.request('focus');
  await until(async () => (await peer.request('snapshot')).focused, 'target focused');
  await peer.request('clear');
  await peer.request('chord', { key: 0x79, modifiers: [0x11, 0x12], repeats: 2 });
  await sleep(350);
  const state = await peer.request('snapshot');
  assert.equal(state.focused, true, 'no-op keeps target foreground');
  assert.equal(
    state.events.some((event) => event.includes('F10')),
    !blocked,
  );
}
(async () => {
  try {
    const targetExe = path.join(
      root,
      'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
    );
    target = spawn(targetExe, [], { windowsHide: true, stdio: 'pipe' });
    target.stderr.on('data', (chunk) => {
      output += chunk;
    });
    peer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      executable,
      [
        ...(source ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${port}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'CDP ready');
    host = await until(
      () =>
        browser
          .contexts()[0]
          .pages()
          .find((page) => page.url().startsWith('appdock://host/index.html')),
      'host page',
    );
    await until(async () => (await snapshot()).startupReady, 'startup ready');
    await apply('block');
    await host.evaluate(() => window.dock.executeCommand('appdock.open'));
    await require('./shell-overlay-helper.cjs').startupPage(host);
    await host.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    const palette = await require('./shell-overlay-helper.cjs').overlayPage(host);
    await palette.getByRole('combobox', { name: 'コマンドを検索' }).fill('appdock.noop');
    await palette.getByRole('option').filter({ hasText: '何もしない' }).waitFor();
    await palette.screenshot({ path: path.join(profile, 'noop-command.png') });
    await require('./shell-overlay-helper.cjs').closingAction(palette.keyboard.press('Escape'));
    checks.push('host starts and palette lists 何もしない');
    await peer.request('focus');
    await until(async () => (await peer.request('snapshot')).focused, 'target focused');
    const before = await snapshot();
    const saved = fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8');
    await host.evaluate(() => window.dock.executeCommand('appdock.noop'));
    const after = await snapshot();
    assert.equal((await peer.request('snapshot')).focused, true);
    assert.equal(after.settings.revision, before.settings.revision);
    assert.equal(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'), saved);
    checks.push('direct no-op keeps native foreground and settings unchanged');
    await input(true);
    checks.push('global no-op blocks F10 including repeated keydowns');
    await apply('pass');
    await input(false);
    checks.push('block OFF passes F10 to native target');
    await apply('miss');
    await input(false);
    checks.push('unmatched executable condition passes F10');
    await apply('disabled');
    await input(false);
    checks.push('disabled binding passes F10');
    await apply('block');
    await input(true);
    checks.push('re-enabled blocking works after pass-through and condition changes');
    if (source) assert.equal(hash(source), hash(executable));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (host && !host.isClosed())
      await host
        .evaluate(() => {
          void window.dock.windowAction('quit');
        })
        .catch(() => {});
    if (child) {
      try {
        await until(() => child.exitCode !== null, 'host exits', 20000);
      } catch {
        child.kill();
        process.exitCode = 1;
      }
    }
    await browser?.close().catch(() => {});
    target?.stdin.end();
    if (target) {
      try {
        await until(() => target.exitCode !== null, 'target exits', 10000);
      } catch {
        target.kill();
        process.exitCode = 1;
      }
    }
    fs.writeFileSync(path.join(profile, 'output.log'), output);
    const result = {
      ok: !process.exitCode,
      profile,
      checks,
      source: source ?? 'development build',
      sha256: hash(executable),
      hostExited: child?.exitCode !== null,
      targetExited: target?.exitCode !== null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();

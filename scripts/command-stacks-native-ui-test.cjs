const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect } = require('./electron-main-helper.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', 'command-stacks-native-' + Date.now());
const extension = path.join(profile, 'extensions/fixture.stack-native');
const trace = path.join(profile, 'trace.jsonl');
fs.mkdirSync(extension, { recursive: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
const names = ['host', 'external', 'tail'];
fs.writeFileSync(
  path.join(extension, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.stack-native',
    name: 'Stack input fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    commands: names.map((id) => ({ id: 'fixture.stack-native.' + id, title: id })),
  }),
);
fs.writeFileSync(
  path.join(extension, 'index.js'),
  `exports.activate=async c=>{for(const id of ${JSON.stringify(names)})c.commands.register('fixture.stack-native.'+id,id,async()=>{require('node:fs').appendFileSync(process.env.APPDOCK_STACK_TRACE,JSON.stringify({id})+'\\n');});};`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.host.soundEnabled = false;
settings.host.closeToTray = false;
settings.updates.checkHostOnAboutOpen = false;
settings.extensions['fixture.stack-native'] = { enabled: true, settings: {} };
settings.touchpadGestures.enabled = false;
settings.touchpadGestures.bindings = [];
settings.gestures.enabled = true;
settings.gestures.activateOnStart = false;
const row = (command, scope = 'global') => ({
  id: randomUUID(),
  command,
  enabled: true,
  when: {
    scope,
    appletIds: [],
    processes: scope === 'exe' ? ['AppDock.InputTarget'] : [],
  },
});
const stack = (title, entries, executionMode = 'all') => ({
  id: randomUUID(),
  typeId: 'appdock.commands.stack',
  owner: { kind: 'host' },
  title,
  description: '',
  configVersion: 1,
  config: { executionMode, entries },
  enabled: true,
  automation: false,
});
const nested = stack(
  'Native nested',
  [row('fixture.stack-native.host', 'app'), row('fixture.stack-native.external', 'exe')],
  'first',
);
const ordered = stack(
  'Native ordered',
  [
    row('appdock.custom.' + nested.id),
    row('fixture.stack-native.tail', 'exe'),
    row('fixture.stack-native.tail', 'exe'),
  ],
  { mode: 'count', count: 2 },
);
const hostOnly = stack('Native host only', [row('fixture.stack-native.host', 'app')]);
settings.customCommands = { version: 2, items: [nested, ordered, hostOnly] };
settings.keybindings = [
  { ...row('appdock.custom.' + ordered.id), key: 'Ctrl+Shift+9', blockOriginalInput: true },
  { ...row('appdock.custom.' + hostOnly.id), key: 'Ctrl+Shift+8', blockOriginalInput: true },
];
settings.keybindingOptions.inputExecutionModes = { 'Ctrl+Shift+9': { mode: 'count', count: 1 } };
settings.gestures.bindings = [
  { ...row('appdock.custom.' + ordered.id), gesture: 'move-left' },
  { ...row('fixture.stack-native.tail'), gesture: 'move-left' },
  { ...row('fixture.stack-native.tail'), gesture: 'move-left' },
];
settings.gestures.inputExecutionModes = { 'move-left': { mode: 'count', count: 2 } };
require('../out/main/shared/settings-schema').parseSettings(settings);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const executable = path.join(profile, 'AppDock.at365.exe');
require('./copy-host.cjs').copyHost(source, executable);
assert.equal(hash(source), hash(executable));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await wait(50);
  }
  throw Error(label);
}
const calls = () =>
  fs.existsSync(trace)
    ? fs
        .readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line).id)
    : [];
let helper,
  peer,
  child,
  browser,
  host,
  success = false;
const checks = [];
(async () => {
  try {
    const directory = path.join(profile, 'input-helper');
    const built = spawnSync(
      'dotnet',
      [
        'publish',
        'tests/fixtures/dotnet/AppDock.InputTarget/AppDock.InputTarget.csproj',
        '-c',
        'Release',
        '-o',
        directory,
      ],
      { cwd: root, windowsHide: true, stdio: 'pipe' },
    );
    fs.writeFileSync(
      path.join(profile, 'helper-build.log'),
      String(built.stdout ?? '') + String(built.stderr ?? ''),
    );
    assert.equal(built.status, 0);
    helper = spawn(path.join(directory, 'AppDock.InputTarget.exe'), [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    helper.stderr.on('data', (data) => fs.appendFileSync(path.join(profile, 'helper.log'), data));
    peer = new JsonLinePeer(helper.stdout, helper.stdin, async () => {});
    await peer.request('snapshot');
    const port = await freePort(),
      mainPort = await freePort();
    const env = { ...process.env, APPDOCK_STACK_TRACE: trace };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      executable,
      [
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--remote-debugging-port=' + port,
        '--inspect=' + mainPort,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'CDP');
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((page) => page.url().startsWith('appdock://host/')),
      'host',
    );
    await until(async () => {
      const state = await host.evaluate(() => window.dock.snapshot());
      return (
        state.startupReady &&
        state.extensions.some((e) => e.id === 'fixture.stack-native' && e.state === 'running') &&
        state.globalHotKeys.filter((s) => s.registered).length === 2
      );
    }, 'native registrations');
    const handle = await inspect(
      mainPort,
      `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(profile, 'resources/app.asar/package.json'))})('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/')).getNativeWindowHandle().readBigUInt64LE().toString()`,
    );
    await peer.request('focusWindow', { window: handle });
    await until(
      async () => (await peer.request('snapshot')).foreground === handle,
      'host foreground',
    );
    await wait(150);
    await peer.request('hotkey', { key: 0x39 });
    await until(() => calls().length === 1, 'host stack key');
    assert.deepEqual(calls(), ['host']);
    checks.push('native key chooses nested host condition');
    const target = await peer.request('focus');
    await until(async () => (await peer.request('snapshot')).focused, 'fixture foreground');
    await peer.request('clear');
    await wait(150);
    await peer.request('hotkey', { key: 0x39 });
    await until(() => calls().length === 3, 'external stack key');
    assert.deepEqual(calls(), ['host', 'external', 'tail']);
    assert(!(await peer.request('snapshot')).events.some((event) => event.includes('D9')));
    checks.push(
      'native key captures external exe condition, ordered leaves and original-input blocking',
    );
    await peer.request('clear');
    await peer.request('hotkey', { key: 0x38 });
    await until(
      async () => (await peer.request('snapshot')).events.some((event) => event.includes('D8')),
      'unmatched key passes through',
    );
    await wait(200);
    assert.equal(calls().length, 3);
    checks.push('nested condition mismatch releases original key and executes no command');
    await host.evaluate(() => window.dock.executeCommand('appdock.open'));
    await until(
      async () => (await host.evaluate(() => window.dock.snapshot())).windowVisible,
      'host visible for mouse',
    );
    await peer.request('focusWindow', { window: handle });
    await wait(150);
    const sent = spawnSync(
      path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
      ['--send', handle, 'move-left'],
      { cwd: root, windowsHide: true, stdio: 'pipe' },
    );
    fs.writeFileSync(
      path.join(profile, 'mouse.log'),
      String(sent.stdout ?? '') + String(sent.stderr ?? ''),
    );
    assert.equal(sent.status, 0, 'mouse input probe');
    await until(() => calls().length === 5, 'mouse stack execution');
    assert.deepEqual(calls(), ['host', 'external', 'tail', 'host', 'tail']);
    checks.push(
      'actual mouse gesture count selects two rows including a nested stack and excludes the third',
    );
    assert.equal(hash(source), hash(executable));
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack);
    if (host)
      fs.writeFileSync(
        path.join(profile, 'snapshot.json'),
        JSON.stringify(
          await host.evaluate(() => window.dock.snapshot()).catch(() => null),
          null,
          2,
        ),
      );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'exit', 10000).catch(() => child.kill());
    await browser?.close().catch(() => {});
    peer?.close();
    if (helper?.exitCode === null) helper.kill();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { success, checks, source, sha256: hash(source), completedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success, profile, checks }));
    if (!success) process.exitCode = 1;
  }
})();

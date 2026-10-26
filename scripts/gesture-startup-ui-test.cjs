const { _electron: electron, chromium } = require('playwright');
const { getPublishDirectory } = require('./publish-paths.cjs');
const { createHash } = require('node:crypto');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `gesture-startup-${Date.now()}`);
const exchange = path.join(profile, 'probe');
const fixture = path.join(profile, 'extensions/test.startup');
fs.mkdirSync(exchange, { recursive: true });
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.startup',
    name: 'Startup gesture fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['storage'],
    commands: [{ id: 'test.startup.run', title: 'Record gesture' }],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  "exports.activate=async c=>{c.commands.register('test.startup.run','Record gesture',()=>c.storage.set('call'+Date.now(),true));};",
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.startMinimized = true;
settings.host.notifications = false;
settings.gestures.activateOnStart = true;
settings.gestures.bindings = [
  {
    id: 'startup',
    command: 'test.startup.run',
    enabled: true,
    gesture: 'move-left',
    when: { scope: 'global', appletIds: [], processes: [] },
  },
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(label);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, probe;
const checks = [];
const portable = process.argv.includes('--portable');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let portableHash;
async function launch(restore) {
  const args = [`--test-profile=${profile}`, ...(restore ? ['--restore-view'] : [])];
  if (!portable)
    return electron.launch({ executablePath: require('electron'), args: [root, ...args], env });
  const source = path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe');
  const executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(source, executable);
  portableHash = hash(source);
  assert.equal(hash(executable), portableHash);
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const child = spawn(executable, [...args, `--remote-debugging-port=${port}`], {
    cwd: profile,
    env,
    windowsHide: true,
    stdio: 'ignore',
  });
  let browser, dock;
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }, 'portable browser');
  await until(async () => {
    dock = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith('appdock://host/'));
    return !!dock;
  }, 'portable host page');
  return {
    firstWindow: async () => dock,
    close: async () => {
      await dock
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
      await until(() => child.exitCode !== null, 'portable exit');
      await browser.close();
      assert.equal(hash(executable), portableHash);
      assert.equal(hash(source), portableHash);
    },
  };
}
(async () => {
  probe = spawn(
    path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
    ['--external-gesture', exchange],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  probe.stdout.pipe(process.stdout);
  probe.stderr.pipe(process.stderr);
  await until(() => fs.existsSync(path.join(exchange, 'ready')), 'external target ready');
  for (const restore of [false, true]) {
    app = await launch(restore);
    const dock = await app.firstWindow();
    await until(
      async () => (await dock.evaluate(() => window.dock.snapshot())).startupReady,
      'host ready',
    );
    const n = checks.length;
    const calls = () => {
      try {
        return fs
          .readdirSync(path.join(profile, 'data/storage/test.startup'))
          .filter((n) => /^call\d+\.json$/.test(n)).length;
      } catch {
        return 0;
      }
    };
    const before = calls();
    fs.writeFileSync(path.join(exchange, 'send-' + n), '');
    await until(() => fs.existsSync(path.join(exchange, 'done-' + n)), 'stroke done');
    await until(() => calls() > before, 'background startup gesture executed');
    assert.equal(calls(), before + 1);
    checks.push(
      restore
        ? 'restore-view launch executes external gesture without manual AppDock activation'
        : 'tray startup executes external gesture before AppDock focus',
    );
    await app.close();
    app = undefined;
  }
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify({ ok: true, checks, profile, portable, sha256: portableHash }, null, 2),
  );
  console.log(
    JSON.stringify({ ok: true, checks, profile, portable, sha256: portableHash }, null, 2),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(path.join(exchange, 'stop'), '');
    if (app) await app.close();
    if (probe && probe.exitCode === null) await new Promise((r) => probe.once('exit', r));
  });

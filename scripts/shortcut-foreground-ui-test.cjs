const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'shortcut-foreground-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
const keyId = randomUUID(),
  keyCommand = 'appdock.custom.' + keyId;
settings.customCommands = {
  version: 2,
  items: [
    {
      id: keyId,
      typeId: 'appdock.input.sendKeys',
      owner: { kind: 'host' },
      title: 'Explorer test',
      description: 'Desktop Win+E fixture',
      configVersion: 1,
      config: { keys: 'Win+E' },
      enabled: true,
      automation: false,
    },
  ],
};
settings.extensions['test.foreground'] = { enabled: true, settings: {} };
settings.keybindings = [
  ['show', 'appdock.open', 'Ctrl+Shift+F23'],
  ['send', keyCommand, 'Ctrl+Shift+F24'],
].map(([id, command, key]) => ({
  id,
  command,
  key,
  enabled: true,
  when: { scope: 'global', appletIds: [] },
}));
const fixture = path.join(profile, 'extensions/test.foreground');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.foreground',
    name: 'Foreground fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: [],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async()=>require('node:fs').writeFileSync(${JSON.stringify(path.join(profile, 'host-pid'))},String(process.ppid));`,
);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(70);
  }
  throw Error(label);
}
let browser,
  child,
  target,
  peer,
  page,
  newExplorer,
  output = '';
const checks = [];
(async () => {
  try {
    const portable = process.argv[2] && path.resolve(process.argv[2]);
    const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      fs.copyFileSync(portable, executable);
      assert.equal(hash(executable), hash(portable));
    }
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise((r) => server.close(r));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      executable,
      [
        ...(portable ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${port}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'CDP ready');
    page = await until(
      () =>
        browser
          .contexts()[0]
          .pages()
          .find(
            (p) =>
              p.url().startsWith('appdock://host/index.html') &&
              !p.url().endsWith('/notifications.html'),
          ),
      'host page',
    );
    await until(async () => {
      const s = await page.evaluate(() => window.dock.snapshot());
      return (
        s.startupReady && s.globalHotKeys.length === 2 && s.globalHotKeys.every((k) => k.registered)
      );
    }, 'two global shortcuts registered');
    target = spawn(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
      ),
      [],
      { windowsHide: false, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    target.stderr.resume();
    peer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    const pid = Number(fs.readFileSync(path.join(profile, 'host-pid'), 'utf8'));
    const { hostWindow } = await peer.request('snapshot', { pid });
    assert.ok(hostWindow, 'isolated host HWND');
    for (const [name, state] of process.argv.includes('--desktop-only')
      ? []
      : [
          ['covered', 1],
          ['minimized', 6],
          ['hidden', 0],
        ]) {
      await peer.request('windowState', { window: hostWindow, state });
      await peer.request('focus');
      await until(async () => (await peer.request('snapshot')).focused, 'target focus');
      // Let native activation and the previous hotkey release finish before the next case.
      await sleep(150);
      // Only the independent native helper gets focus here. CDP never focuses AppDock.
      await peer.request('hotkey', { key: 0x86 });
      await until(
        async () => (await peer.request('snapshot')).foreground === hostWindow,
        'AppDock foreground from ' + name,
      );
      checks.push('global show brings ' + name + ' AppDock to native foreground');
    }
    const before = await peer.request('snapshot');
    await peer.request('desktop');
    const desktop = await until(async () => {
      const s = await peer.request('snapshot');
      return s.foreground === s.shell && s;
    }, 'real desktop foreground');
    await peer.request('hotkey', { key: 0x87 });
    newExplorer = await until(async () => {
      const s = await peer.request('snapshot');
      return (
        s.foregroundClass === 'CabinetWClass' &&
        !before.explorers.includes(s.foreground) &&
        s.foreground
      );
    }, 'Win+E from desktop opens new Explorer');
    checks.push(
      'host custom command without WindowsTools sends Win+E from desktop through a real global shortcut and opens Explorer',
    );
    const result = {
      ok: true,
      profile,
      version: (await page.evaluate(() => window.dock.snapshot())).version,
      executableSha256: portable ? hash(executable) : null,
      desktop,
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    if (page)
      fs.writeFileSync(
        path.join(profile, 'failure-host.json'),
        JSON.stringify(
          await page.evaluate(() => window.dock.snapshot()).catch(() => null),
          null,
          2,
        ),
      );
    if (peer)
      fs.writeFileSync(
        path.join(profile, 'failure-state.json'),
        JSON.stringify(await peer.request('snapshot').catch(() => null), null, 2),
      );
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(e.stack));
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (newExplorer) await peer?.request('closeExplorer', { window: newExplorer }).catch(() => {});
    if (page && !page.isClosed())
      await page
        .evaluate(() => {
          void window.dock.windowAction('quit');
        })
        .catch(() => {});
    await browser?.close().catch(() => {});
    peer?.close();
    target?.stdin.end();
    await sleep(500);
    if (target && target.exitCode === null) target.kill();
    if (child && child.exitCode === null) child.kill();
    fs.writeFileSync(path.join(profile, 'host.log'), output);
  }
})();

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `gesture-foreground-${Date.now()}`);
const exchange = path.join(profile, 'probe');
const fixture = path.join(profile, 'extensions/test.foreground');
fs.mkdirSync(exchange, { recursive: true });
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.foreground',
    name: 'Foreground fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['storage'],
    commands: [{ id: 'test.foreground.record', title: 'Record' }],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  "exports.activate=async c=>{let n=0;c.commands.register('test.foreground.record','Record',()=>c.storage.set('call'+(++n),true));};",
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.startMinimized = true;
settings.host.notifications = false;
settings.extensions['test.foreground'] = { enabled: true, settings: {} };
settings.keybindings = [
  {
    id: 'foreground.shortcut',
    command: 'appdock.open',
    key: 'F16',
    enabled: true,
    blockOriginalInput: true,
    when: { scope: 'global', appletIds: [] },
  },
];
settings.gestures.bindings = [
  {
    id: 'open',
    command: 'appdock.open',
    gesture: 'move-left',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
  {
    id: 'tail',
    command: 'test.foreground.record',
    gesture: 'move-left',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(30);
  }
  throw Error(label);
}
const foreground = () => {
  try {
    return fs.readFileSync(path.join(exchange, 'foreground'), 'utf8');
  } catch {
    return '';
  }
};
const calls = () => {
  try {
    return fs
      .readdirSync(path.join(profile, 'data/storage/test.foreground'))
      .filter((n) => /^call\d+\.json$/.test(n)).length;
  } catch {
    return 0;
  }
};
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const portable = process.argv.includes('--portable');
const source = path.join(
  require('./publish-paths.cjs').getPublishDirectory(root),
  'AppDock.at365.exe',
);
const executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
let sha256, app, probe;
const checks = [];
(async () => {
  if (portable) {
    fs.copyFileSync(source, executablePath);
    sha256 = hash(source);
    assert.equal(hash(executablePath), sha256);
  }
  probe = spawn(
    path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
    ['--external-gesture', exchange],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  probe.stdout.pipe(process.stdout);
  probe.stderr.pipe(process.stderr);
  await until(() => fs.existsSync(path.join(exchange, 'ready')), 'external fixture ready');
  const sourceWindow = fs.readFileSync(path.join(exchange, 'ready'), 'utf8');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchTestHost({
    executablePath,
    portable,
    args: [...(portable ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  let dock;
  await until(() => {
    dock = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('appdock://host/'));
    return !!dock;
  }, 'host page');
  await until(
    async () => (await dock.evaluate(() => window.dock?.snapshot()))?.startupReady,
    'host ready',
  );
  const target = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
      .getNativeWindowHandle()
      .readBigUInt64LE()
      .toString(),
  );
  let sequence = 0;
  async function stroke(gesture) {
    const request = path.join(exchange, 'send-' + sequence);
    fs.writeFileSync(request + '.tmp', JSON.stringify({ gesture }));
    fs.renameSync(request + '.tmp', request);
    await until(() => fs.existsSync(path.join(exchange, 'done-' + sequence)), 'gesture finished');
    sequence++;
  }
  for (const [command, state, gesture] of [
    ['appdock.open', 'hidden', 'move-left'],
    ['appdock.open', 'visible', 'move-right-up'],
    ['appdock.open', 'minimized', 'move-left'],
    ['appdock.settings.open', 'hidden', 'move-right-up'],
    ['appdock.settings.gestures.open', 'visible', 'move-left'],
    ['appdock.logs.open', 'minimized', 'move-right-up'],
    ['appdock.open', 'hidden', 'click-left'],
    ['appdock.open', 'visible', 'wheel-up'],
    ['appdock.open', 'hidden', 'key:A'],
    ['test.foreground.record', 'visible', 'move-left'],
    ['test.foreground.record', 'hidden', 'move-right-up'],
    ['appdock.open', 'hidden', 'shortcut:F16'],
    ['appdock.open', 'same-window', 'move-left'],
  ]) {
    await dock.evaluate(
      async ({ command, gesture }) => {
        if (gesture.startsWith('shortcut:')) return;
        const s = await window.dock.snapshot();
        s.settings.value.gestures.bindings = [
          {
            id: 'open',
            command,
            gesture,
            enabled: true,
            when: { scope: 'global', appletIds: [], processes: [] },
          },
          ...(command === 'test.foreground.record'
            ? []
            : [
                {
                  id: 'tail',
                  command: 'test.foreground.record',
                  gesture,
                  enabled: true,
                  when: { scope: 'global', appletIds: [], processes: [] },
                },
              ]),
        ];
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      },
      { command, gesture },
    );
    await app.evaluate(({ BrowserWindow }, state) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      if (state === 'hidden') w.hide();
      else {
        w.showInactive();
        if (state === 'minimized') w.minimize();
      }
    }, state);
    await wait(150);
    const n = calls();
    if (state === 'same-window') {
      const sender = spawn(
        path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
        ['--send', target, gesture],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      sender.stdout.pipe(process.stdout);
      sender.stderr.pipe(process.stderr);
      await new Promise((resolve, reject) => {
        sender.once('error', reject);
        sender.once('exit', (code) =>
          code === 0 ? resolve() : reject(Error('Host gesture sender failed: ' + code)),
        );
      });
    } else await stroke(gesture);
    if (command === 'test.foreground.record' || state === 'same-window') {
      await until(() => calls() === n + 1, 'ordinary command executed');
      assert.equal(foreground(), state === 'same-window' ? target : sourceWindow);
    } else {
      await until(
        () => foreground() === target,
        `${command}/${state}/${gesture} must become actual foreground`,
      );
      await wait(250);
      assert.equal(
        calls(),
        n,
        'commands after foreground transfer must not execute against the old target',
      );
    }
    if (command === 'appdock.settings.gestures.open')
      assert.equal((await dock.evaluate(() => window.dock.settingsEditing())).pageId, 'gestures');
    const route = command.startsWith('appdock.settings.')
      ? 'settings'
      : command === 'appdock.logs.open'
        ? 'logs'
        : null;
    if (route)
      await until(
        async () => (await dock.evaluate(() => window.dock.snapshot())).navigation.route === route,
        `${command} opens its requested page`,
      );
    checks.push(`${command}/${state}/${gesture}: actual foreground and complete command checked`);
  }
  const errors = (await dock.evaluate(() => window.dock.snapshot())).logs.filter(
    (l) => l.level === 'error',
  );
  assert.deepEqual(errors, []);
  if (portable) {
    assert.equal(hash(source), sha256);
    assert.equal(hash(executablePath), sha256);
  }
  const result = { ok: true, checks, profile, portable, sha256 };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})()
  .catch(async (error) => {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
    if (app) {
      const diagnostic = await app
        .evaluate(({ BrowserWindow }) => ({
          windows: BrowserWindow.getAllWindows().map((w) => ({
            handle: w.getNativeWindowHandle().readBigUInt64LE().toString(),
            visible: w.isVisible(),
            focused: w.isFocused(),
          })),
        }))
        .catch(() => null);
      fs.writeFileSync(path.join(profile, 'diagnostic.json'), JSON.stringify(diagnostic, null, 2));
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(path.join(exchange, 'stop'), '');
    if (app) await app.close();
    if (probe && probe.exitCode === null) await new Promise((r) => probe.once('exit', r));
  });

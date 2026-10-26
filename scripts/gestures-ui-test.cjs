const { getPublishDirectory } = require('./publish-paths.cjs');
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');
const net = require('node:net');
const webId = 'web.' + randomUUID(),
  accountId = 'account.' + randomUUID();
const server = http.createServer((req, res) =>
  res.end('<h1>Gesture web fixture</h1><input aria-label="Web入力">'),
);
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', `gestures-ui-${Date.now()}`);
const fixture = path.join(profile, 'extensions', 'test.gestures');
fs.mkdirSync(fixture, { recursive: true });
const webSource = path.join(
  getPublishDirectory(path.resolve(root, '../Applet.WebApplet.at365')),
  'extensions/at365.web-applet',
);
fs.cpSync(webSource, path.join(profile, 'extensions/at365.web-applet'), { recursive: true });
const webInputs = fs
  .readdirSync(webSource, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    return { file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.gestures',
    name: 'ジェスチャー検証',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['storage', 'pages'],
    commands: [
      { id: 'test.gestures.open', title: 'ページを開く', activateOnExecute: true },
      ...['a', 'b', 'c'].map((x) => ({ id: `test.gestures.${x}`, title: '記録' + x })),
    ],
    pages: [
      {
        id: 'main',
        title: '検証ページ',
        source: 'local',
        ui: 'index.html',
        openCommand: 'test.gestures.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  `exports.activate=async c=>{let n=0;c.commands.register('test.gestures.open','Open',()=>c.pages.open('main'));for(const x of ['a','b','c'])c.commands.register('test.gestures.'+x,'記録'+x,async()=>{await c.storage.set('call'+String(++n).padStart(5,'0'),x);});};`,
);
fs.writeFileSync(
  path.join(fixture, 'index.html'),
  '<h1>Gesture fixture</h1><input aria-label="文字入力"><p>右ボタンを使う隔離試験ページ</p>',
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.extensions['test.gestures'] = { enabled: true, settings: {} };
const row = (id, command, scope, gesture = 'move-left', appletIds = []) => ({
  id,
  command: 'test.gestures.' + command,
  gesture,
  enabled: true,
  when: { scope, appletIds, processes: [] },
});
settings.gestures.bindings = [
  row('global', 'a', 'global'),
  row('app', 'b', 'app'),
  row('duplicate', 'a', 'app'),
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const calls = () => {
  const dir = path.join(profile, 'data/storage/test.gestures');
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => /^call\d+\.json$/.test(n))
      .sort()
      .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
  } catch {
    return [];
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(label);
};
const checks = [];
const indicatorOnly = process.env.APPDOCK_GESTURE_INDICATOR_ONLY === '1';
const uiOnly = process.env.APPDOCK_GESTURE_UI_ONLY === '1' || indicatorOnly;
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  settings.extensions['at365.web-applet'] = {
    enabled: true,
    settings: {
      items: [
        {
          id: webId,
          name: 'Webジェスチャー',
          url: `http://127.0.0.1:${server.address().port}/`,
          accountId,
          enabled: true,
          display: 'page',
          navigation: 'none',
          allowedOrigins: [],
          icon: '',
        },
      ],
    },
  };
  settings.migrations = { webApplet: { version: 1, owner: 'at365.web-applet', ids: [webId] } };
  fs.mkdirSync(path.join(profile, 'data/web-applets'), { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'data/web-applets/accounts.json'),
    JSON.stringify({
      schemaVersion: 1,
      accounts: [{ id: accountId, name: 'Test' }],
    }),
  );
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let portableChild, portableBrowser, portableHash;
  const portable = process.argv.includes('--portable');
  const launch = async () =>
    portable
      ? await (async () => {
          const source = path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe'),
            executable = path.join(profile, 'AppDock.at365.exe');
          require('./copy-host.cjs').copyHost(source, executable);
          const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
          portableHash = hash(source);
          assert.equal(hash(executable), portableHash);
          const listener = net.createServer();
          await new Promise((r) => listener.listen(0, '127.0.0.1', r));
          const port = listener.address().port;
          await new Promise((r) => listener.close(r));
          portableChild = spawn(
            executable,
            [`--test-profile=${profile}`, `--remote-debugging-port=${port}`],
            { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
          );
          await until(async () => {
            try {
              portableBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
                timeout: 1000,
              });
              return true;
            } catch {
              return false;
            }
          }, 'portable browser');
          const session = await portableBrowser.newBrowserCDPSession();
          const info = await session.send('SystemInfo.getProcessInfo');
          const pid = info.processInfo.find((p) => p.type === 'browser').id;
          let dock;
          await until(async () => {
            for (const candidate of portableBrowser.contexts()[0].pages()) {
              if (await candidate.evaluate(() => !!window.dock).catch(() => false)) {
                dock = candidate;
                return true;
              }
            }
            return false;
          }, 'portable main page ready');
          return {
            firstWindow: async () => dock,
            evaluate: async () => `pid:${pid}`,
            close: async () => {
              await dock
                .evaluate(() => {
                  void window.dock.executeCommand('appdock.quit');
                })
                .catch(() => {});
              await until(() => portableChild.exitCode !== null, 'portable exit');
              await portableBrowser.close();
              assert.equal(hash(executable), portableHash);
            },
          };
        })()
      : await electron.launch({
          executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
          args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
          env,
        });
  let app = await launch();
  try {
    const dock = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
    await until(
      async () => (await dock.evaluate(() => window.dock.snapshot())).startupReady,
      'host startup ready',
    );
    await dock.evaluate(() => window.dock.executeCommand('appdock.open'));
    await dock.bringToFront();
    await wait(300);
    const save = async (bindings) => {
      await dock.evaluate(async (bindings) => {
        const s = await window.dock.snapshot();
        s.settings.value.gestures.bindings = bindings;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, bindings);
      await wait(250);
    };
    const send = async (gesture = 'move-left', inactive = false) => {
      const handle = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        w.show();
        w.focus();
        return w.getNativeWindowHandle().readBigUInt64LE().toString();
      });
      await wait(150);
      await new Promise((resolve, reject) => {
        const child = spawn(
          path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
          [inactive ? '--send-inactive' : '--send', handle, gesture],
          { windowsHide: true, stdio: 'pipe' },
        );
        child.on('error', reject);
        child.stdout.on('data', (d) => process.stdout.write(d));
        child.stderr.on('data', (d) => process.stderr.write(d));
        child.on('exit', (code) => (code === 0 ? resolve() : reject(Error('input ' + code))));
      });
    };
    const expect = async (expected) => {
      const n = calls().length;
      await send();
      try {
        await until(() => calls().length >= n + expected.length, 'expected ' + expected);
      } catch (error) {
        console.log('CALLS', calls());
        console.log('STATE', JSON.stringify(await dock.evaluate(() => window.dock.snapshot())));
        throw error;
      }
      assert.deepEqual(calls().slice(n), expected);
    };
    if (uiOnly) {
      await save([row('key', 'a', 'global', 'key:Ctrl+A')]);
      checks.push('native input checks skipped explicitly: UI-only mode');
    } else {
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.gestures.activateOnStart = true;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      await save([row('inactive-local', 'a', 'app')]);
      const beforeInactive = calls().length;
      await send('move-left', true);
      await until(
        () => calls().length === beforeInactive + 1,
        'inactive AppDock starts with synchronized local conditions',
      );
      assert.deepEqual(calls().slice(beforeInactive), ['a']);
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.gestures.executionMode = 'first';
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      await save([row('inactive-owner', 'c', 'owner'), row('active-app', 'a', 'app')]);
      await expect(['a']);
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.gestures.activateOnStart = false;
        s.settings.value.gestures.executionMode = 'all';
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      const beforeDisabled = calls().length;
      await send('move-left', true);
      await wait(200);
      assert.equal(calls().length, beforeDisabled);
      await save([
        row('global-a', 'a', 'global'),
        row('app-b', 'b', 'app'),
        row('duplicate-a', 'a', 'global'),
      ]);
      checks.push(
        'inactive AppDock activation synchronizes local-only rows without cancelling; OFF preserves ordinary input',
      );
      await expect(['a', 'b']);
      checks.push('global/app order and duplicate suppression');
      for (const mode of ['first', 'all']) {
        await dock.evaluate(async (mode) => {
          const s = await window.dock.snapshot();
          s.settings.value.gestures.executionMode = mode;
          s.settings.value.gestures.indicatorPosition = 'none';
          await window.dock.saveSettings(s.settings.value, s.settings.revision);
        }, mode);
        await wait(150);
        for (const gesture of [
          'move-left',
          'move-right-up',
          'move-up-down',
          'key:A',
          'click-left',
          'wheel-up',
        ]) {
          await save([
            ...(gesture.split('-').length === 3
              ? [row('prefix', 'c', 'global', 'move-' + gesture.split('-')[1])]
              : []),
            row('wrong-owner', 'c', 'owner', gesture),
            row('first', 'a', 'global', gesture),
            row('second', 'b', 'app', gesture),
            row('duplicate', 'a', 'global', gesture),
          ]);
          const n = calls().length;
          const expected = mode === 'first' ? ['a'] : ['a', 'b'];
          await send(gesture);
          await until(() => calls().length >= n + expected.length, mode + ' ' + gesture);
          await wait(100);
          assert.deepEqual(calls().slice(n), expected);
        }
      }
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.gestures.indicatorPosition = 'gesture-start';
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      checks.push(
        'first/all execution with condition skipping, deduplication, no prefix execution and hidden indicator for single/two-step stroke/key/click/wheel',
      );
      await save([
        row('start-stroke', 'a', 'global'),
        row('start-wheel', 'b', 'global', 'wheel-up'),
      ]);
      for (const blocker of [
        'left-ctrl',
        'right-ctrl',
        'left-alt',
        'right-alt',
        'left-shift',
        'right-shift',
        'left-win',
        'right-win',
        'left',
        'middle',
        'x1',
        'x2',
      ]) {
        const before = calls().length;
        await send('blocked:' + blocker);
        await wait(200);
        assert.equal(calls().length, before, blocker + ' must bypass gesture start');
      }
      await expect(['a']);
      checks.push(
        'pre-held modifiers and other mouse buttons bypass start, including early release; plain gesture resumes',
      );
      await save([
        row('pages', 'a', 'pages'),
        row('owner', 'b', 'owner'),
        row('selected', 'c', 'applets', 'move-left', ['page:test.gestures:main']),
      ]);
      let n;
      await expect(['a']);
      await dock.evaluate(() => window.dock.executeCommand('test.gestures.open'));
      await wait(400);
      await expect(['a', 'b', 'c']);
      checks.push('pages/owner/selected conditions');
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.extensions['test.gestures'].pages = { main: { display: 'window' } };
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
        await window.dock.executeCommand('test.gestures.open');
      });
      await wait(400);
      await expect(['a', 'b', 'c']);
      checks.push('detached Applet window conditions');
      await dock.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.extensions['test.gestures'].pages = { main: { display: 'page' } };
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      await save([
        row('web-pages', 'a', 'pages'),
        row('other-owner', 'b', 'owner'),
        row('web-selected', 'c', 'applets', 'move-left', [`page:${webId}:main`]),
      ]);
      await dock.evaluate((id) => window.dock.executeCommand(id + '.open'), webId);
      await wait(500);
      await expect(['a', 'c']);
      checks.push('WebApplet scope without leaking provider condition');
      await dock.evaluate(async (id) => {
        const s = await window.dock.snapshot();
        s.settings.value.extensions['at365.web-applet'].settings.items.find(
          (i) => i.id === id,
        ).display = 'window';
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
        await window.dock.executeCommand(id + '.open');
      }, webId);
      await wait(400);
      await expect(['a', 'c']);
      checks.push('detached WebApplet conditions');
      await save([row('key', 'a', 'global', 'key:A')]);
      n = calls().length;
      await send('key:A');
      await until(() => calls().length === n + 1, 'key gesture');
      checks.push('native key through host dispatcher');
      await save([row('key', 'a', 'global', 'key:Ctrl+A')]);
      n = calls().length;
      await send('key:Ctrl+A');
      await until(() => calls().length === n + 1, 'modified key gesture');
      checks.push('modifier key gesture');
    }
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    const settingsPage = await require('./settings-host-helper.cjs').settingsPage(dock);
    await settingsPage.getByRole('button', { name: 'マウスジェスチャー', exact: true }).click();
    await require(
      indicatorOnly ? './gesture-indicator-checks.cjs' : './gesture-command-checks.cjs',
    )({
      page: settingsPage,
      host: dock,
      profile,
      checks,
      calls,
      until,
      send: uiOnly ? null : send,
    });
    const errors = (await dock.evaluate(() => window.dock.snapshot())).logs.filter(
      (l) => l.level === 'error',
    );
    assert.deepEqual(errors, []);
    const persisted = (await dock.evaluate(() => window.dock.snapshot())).settings.value.gestures;
    await app.close();
    app = await launch();
    const restarted = require('./settings-aware-page.cjs').settingsAwarePage(
      await app.firstWindow(),
    );
    await until(
      async () => (await restarted.evaluate(() => window.dock.snapshot())).startupReady,
      'restarted host ready',
    );
    assert.deepEqual(
      (await restarted.evaluate(() => window.dock.snapshot())).settings.value.gestures,
      persisted,
    );
    checks.push(
      'process restart preserves gesture assignments, conditions, order and global options',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, checks, profile, portable, indicatorOnly, sha256: portableHash, webInputs },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        { ok: true, checks, profile, portable, indicatorOnly, sha256: portableHash },
        null,
        2,
      ),
    );
  } finally {
    try {
      await app.close();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
})().catch((e) => {
  fs.writeFileSync(path.join(profile, 'failure.txt'), String(e.stack));
  console.error(e);
  process.exitCode = 1;
});

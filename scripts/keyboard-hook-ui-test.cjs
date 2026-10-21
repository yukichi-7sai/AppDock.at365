const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const assert = require('node:assert/strict');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'keyboard-hook-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const targetExe = path.join(
  root,
  'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
);
const callsFile = path.join(profile, 'calls.jsonl'),
  processFile = path.join(profile, 'process-target.json');
const fixture = path.join(profile, 'extensions/test.hook');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.hook',
    name: 'Keyboard hook fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: [],
    commands: ['a', 'b'].map((key) => ({ id: 'test.hook.' + key, title: 'Hook ' + key })),
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async c=>{const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');fs.writeFileSync(${JSON.stringify(path.join(profile, 'host-pid'))},String(process.ppid));const nativeRoot=path.join(path.dirname(process.execPath),'resources','dotnet-host');if(fs.existsSync(nativeRoot)){const hashes={};for(const file of ['input/AppDock.InputHost.dll','input/AppDock.Runtime.dll','process/AppDock.ProcessHost.dll'])hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(nativeRoot,file))).digest('hex');fs.writeFileSync(${JSON.stringify(path.join(profile, 'native-payload.json'))},JSON.stringify(hashes));}for(const key of ['a','b'])c.commands.register('test.hook.'+key,'Hook '+key,async()=>fs.appendFileSync(${JSON.stringify(callsFile)},JSON.stringify({key})+'\\n'));};`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
settings.extensions['test.hook'] = { enabled: true, settings: {} };
const processId = randomUUID();
settings.customCommands = {
  version: 2,
  items: [
    {
      id: processId,
      typeId: 'appdock.process.start',
      owner: { kind: 'host' },
      title: 'Hook process target',
      description: '',
      configVersion: 1,
      config: {
        mode: 'executable',
        executable: targetExe,
        arguments: ['--process-target', processFile],
        workingDirectory: '',
        showConsole: false,
      },
      enabled: true,
      automation: false,
    },
  ],
};
const binding = (id, command, key, block, scope = 'global') => ({
  id,
  command,
  key,
  enabled: true,
  when: { scope, appletIds: [] },
  ...(block === undefined ? {} : { blockOriginalInput: block }),
});
settings.keybindings = [
  binding('win', 'test.hook.a', 'Win+W'),
  binding('pass-a', 'test.hook.a', 'Ctrl+Shift+F16', false),
  binding('pass-duplicate', 'test.hook.a', 'Ctrl+Shift+F16', false),
  binding('pass-local', 'test.hook.a', 'Ctrl+Shift+F16', true, 'app'),
  binding('pass-b', 'test.hook.b', 'Ctrl+Shift+F16', false),
  { ...binding('disabled', 'test.hook.b', 'Ctrl+Shift+F16', true), enabled: false },
  binding('missing', 'test.missing.run', 'Ctrl+Shift+F16', true),
  binding('process', 'appdock.custom.' + processId, 'Shift+Win+F19'),
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const portableSource = process.argv[2] && path.resolve(process.argv[2]);
const terminalExe = process.env.APPDOCK_TEST_TERMINAL;
const terminalTitle = 'AppDock shortcut test ' + randomUUID();
let terminalWindow, widgetsBaseline;
const executable = portableSource ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portableSource) {
  fs.copyFileSync(portableSource, executable);
  assert.equal(hash(executable), hash(portableSource));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await sleep(70);
  }
  throw Error(message);
}
let browser,
  child,
  target,
  peer,
  host,
  page,
  hostWindow,
  hostPid,
  output = '';
const checks = [];
const calls = () =>
  fs.existsSync(callsFile)
    ? fs.readFileSync(callsFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
    : [];
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function save(edit) {
  await host.evaluate(async (operation) => {
    const s = await window.dock.snapshot();
    if (operation === 'add-block')
      s.settings.value.keybindings.push({
        ...s.settings.value.keybindings.find((r) => r.id === 'pass-a'),
        id: 'block-duplicate',
        blockOriginalInput: true,
      });
    else
      s.settings.value.keybindings = s.settings.value.keybindings.filter(
        (r) => r.id !== 'block-duplicate',
      );
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  }, edit);
  await until(
    async () => (await snapshot()).globalHotKeys.every((s) => s.registered),
    'capture reapplied',
  );
}
async function launch() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    executable,
    [
      ...(portableSource ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  await until(
    async () => {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    },
    'CDP ready',
    60000,
  );
  host = await until(
    () =>
      browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host page',
  );
  page = require('./settings-aware-page.cjs').settingsAwarePage(host);
  await until(async () => {
    const s = await snapshot();
    return (
      s.startupReady && s.globalHotKeys.length >= 5 && s.globalHotKeys.every((k) => k.registered)
    );
  }, 'capture ready');
  hostPid = Number(fs.readFileSync(path.join(profile, 'host-pid'), 'utf8'));
  if (portableSource) {
    const native = JSON.parse(fs.readFileSync(path.join(profile, 'native-payload.json'), 'utf8'));
    for (const [file, digest] of Object.entries(native))
      assert.equal(
        digest,
        hash(path.join(root, '.artifacts', 'dotnet-host', file)),
        'packaged native payload ' + file,
      );
  }
  hostWindow = (await peer.request('snapshot', { pid: hostPid })).hostWindow;
  assert.ok(hostWindow);
}
async function closeHost() {
  if (host && !host.isClosed())
    await host
      .evaluate(() => {
        void window.dock.windowAction('quit');
      })
      .catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'isolated host exits');
  await browser?.close().catch(() => {});
}
async function chord(key, modifiers, repeats = 0) {
  return peer.request('chord', { key, modifiers, repeats });
}
async function focusHost() {
  await peer.request('focusWindow', { window: hostWindow });
  await until(
    async () => (await peer.request('snapshot')).foreground === hostWindow,
    'native host focus',
  );
}
async function openShortcuts() {
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await focusHost();
  await page
    .locator('.settings-categories')
    .getByRole('button', { name: 'ショートカットキー', exact: true })
    .click();
}
(async () => {
  try {
    target = spawn(targetExe, [], { windowsHide: false, stdio: ['pipe', 'pipe', 'pipe'] });
    target.stderr.resume();
    peer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    await peer.request('focus');
    const baselineBefore = await peer.request('snapshot');
    await chord(0x57, [0x5b]);
    await sleep(400);
    const baselineAfter = await peer.request('snapshot');
    widgetsBaseline = {
      changedForeground: baselineBefore.foreground !== baselineAfter.foreground,
      foregroundClass: baselineAfter.foregroundClass,
      foregroundTitle: baselineAfter.foregroundTitle,
    };
    await chord(27, []);
    await peer.request('focus');
    await launch();
    await peer.request('focus');
    let start = calls().length;
    await chord(0x57, [0x5b], 2);
    await until(() => calls().length === start + 1, 'Win+W command once');
    await sleep(180);
    assert.equal((await peer.request('snapshot')).focused, true, 'Widgets and Start stay closed');
    assert.equal(calls().length, start + 1);
    checks.push(
      'Win+W command repeats dispatch once; releasing Win keeps native target foreground',
    );
    start = calls().length;
    await peer.request('clear');
    await chord(0x7f, [0x11, 0x10], 2);
    await until(() => calls().length === start + 2, 'two commands once');
    assert.deepEqual(
      calls()
        .slice(start)
        .map((c) => c.key),
      ['a', 'b'],
    );
    assert.ok((await peer.request('snapshot')).events.some((e) => e.includes('F16')));
    await focusHost();
    start = calls().length;
    await chord(0x7f, [0x11, 0x10]);
    await until(() => calls().length === start + 2, 'focused global and local deduplicated');
    await sleep(200);
    assert.equal(calls().length, start + 2);
    checks.push(
      'passthrough reaches native target including repeats; disabled, unavailable and local rows do not block; focused local/global commands deduplicate',
    );
    await save('add-block');
    await peer.request('focus');
    await peer.request('clear');
    start = calls().length;
    await chord(0x7f, [0x11, 0x10]);
    await until(() => calls().length === start + 2, 'OR blocking dispatch');
    assert.equal(
      (await peer.request('snapshot')).events.some((e) => e.includes('F16')),
      false,
    );
    await save('remove-block');
    checks.push('same-command duplicate with block ON wins before command deduplication');
    await peer.request('focus');
    await chord(0x82, [0x10, 0x5b]);
    const launched = await until(() => {
      try {
        return JSON.parse(fs.readFileSync(processFile, 'utf8'));
      } catch {
        return false;
      }
    }, 'process command launches target');
    await until(
      async () => (await peer.request('snapshot')).foreground === launched.window,
      'launched process foreground',
    );
    fs.writeFileSync(processFile + '.stop', 'stop');
    await until(
      () => fs.existsSync(processFile + '.closed'),
      'launched target closes before UI focus',
    );
    checks.push(
      'Win shortcut launches configured executable and its native window reaches foreground',
    );
    if (terminalExe) {
      await host.evaluate(
        async ({ terminalExe, terminalTitle, processId }) => {
          const state = await window.dock.snapshot();
          state.settings.value.keybindings.find((r) => r.id === 'win').enabled = false;
          state.settings.value.keybindings.find((r) => r.id === 'process').key = 'Win+W';
          state.settings.value.customCommands.items.find((c) => c.id === processId).config = {
            mode: 'cmd',
            command:
              'start "" "' +
              terminalExe +
              '" --window new new-tab --title "' +
              terminalTitle +
              '" --suppressApplicationTitle powershell.exe -NoProfile -Command "Start-Sleep -Seconds 5"',
            workingDirectory: '',
            showConsole: false,
          };
          await window.dock.saveSettings(state.settings.value, state.settings.revision);
        },
        { terminalExe, terminalTitle, processId },
      );
      await until(
        async () =>
          (await snapshot()).globalHotKeys.some((k) => k.shortcut === 'Win+W' && k.registered),
        'terminal shortcut applied',
      );
      await peer.request('focus');
      await chord(0x57, [0x5b]);
      const terminal = await until(async () => {
        const state = await peer.request('snapshot');
        if (state.terminals?.length) {
          terminalWindow = state.terminals[0].window;
          fs.writeFileSync(
            path.join(profile, 'terminal-observed.json'),
            JSON.stringify(state, null, 2),
          );
        }
        return (
          state.foregroundClass === 'CASCADIA_HOSTING_WINDOW_CLASS' &&
          state.foregroundTitle.includes(terminalTitle) &&
          state
        );
      }, 'Win+W opens actual Windows Terminal in foreground');
      terminalWindow = terminal.foreground;
      await peer.request('closeTerminal', { window: terminalWindow, title: terminalTitle });
      await until(
        async () => !(await peer.request('snapshot')).foregroundTitle.includes(terminalTitle),
        'test terminal closes',
      );
      terminalWindow = undefined;
      await host.evaluate(
        async ({ processId, config }) => {
          const state = await window.dock.snapshot();
          state.settings.value.keybindings.find((r) => r.id === 'win').enabled = true;
          state.settings.value.keybindings.find((r) => r.id === 'process').key = 'Shift+Win+F19';
          state.settings.value.customCommands.items.find((c) => c.id === processId).config = config;
          await window.dock.saveSettings(state.settings.value, state.settings.revision);
        },
        { processId, config: settings.customCommands.items[0].config },
      );
      checks.push(
        'actual Windows Terminal opens in native foreground through Win+W; only the uniquely titled test window is closed',
      );
    }
    await openShortcuts();
    const dialog = () => page.locator('.applet-shortcut-dialog');
    const recorder = () =>
      dialog().getByRole('button', { name: 'ショートカットキーを入力', exact: true });
    await page.locator('[data-binding-id="win"] .applet-shortcut-edit').click();
    await dialog().getByText('押して入力', { exact: true }).waitFor();
    start = calls().length;
    await chord(0x57, [0x5c]);
    await until(
      async () => (await recorder().locator('kbd').allTextContents()).join('+') === 'Win+W',
      'right Win recording',
    );
    await sleep(170);
    assert.equal(calls().length, start);
    assert.equal((await peer.request('snapshot')).foreground, hostWindow);
    checks.push(
      'native recorder captures right Win+W without Widgets or executing configured command',
    );
    await dialog()
      .getByRole('button', { name: /特殊キーから選ぶ/ })
      .click();
    await dialog().getByLabel('英数字のキーを選択').selectOption('D');
    assert.deepEqual(await recorder().locator('kbd').allTextContents(), ['Win', 'D']);
    await dialog()
      .getByRole('button', { name: /特殊キーから選ぶ/ })
      .click();
    await dialog().getByLabel('英数字のキーを選択').selectOption('W');
    await dialog().getByRole('switch', { name: '元のキー入力をブロックする', exact: true }).click();
    for (const width of [700, 900, 1280])
      for (const theme of ['light', 'dark']) {
        await host.setViewportSize({ width, height: 800 });
        const settingsPage = await require('./settings-host-helper.cjs').settingsPage(host);
        await settingsPage.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await dialog().scrollIntoViewIfNeeded();
        await settingsPage.screenshot({ path: path.join(profile, `dialog-${width}-${theme}.png`) });
        const bounds = await dialog().boundingBox();
        assert.ok(bounds.width <= width && bounds.height < 800, 'dialog fits viewport');
      }
    await dialog().getByRole('button', { name: '適用', exact: true }).click();
    await until(
      async () =>
        (await snapshot()).settings.value.keybindings.find((r) => r.id === 'win')
          .blockOriginalInput === false,
      'UI passthrough saved',
    );
    checks.push(
      'manual Win plus alpha picker; block toggle saves immediately; dialog at three widths in both themes',
    );
    await page.locator('[data-binding-id="pass-local"] .applet-shortcut-edit').click();
    await dialog().getByText('押して入力', { exact: true }).waitFor();
    assert.equal(
      await dialog()
        .getByRole('switch', { name: '元のキー入力をブロックする', exact: true })
        .isDisabled(),
      true,
    );
    await dialog().getByRole('button', { name: '編集をキャンセル', exact: true }).click();
    await until(async () => (await snapshot()).globalHotKeys.length > 0, 'capture restored');
    // Terminate only the capture child of this isolated host, then retry through the existing UI.
    await new Promise((resolve, reject) => {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$items=Get-CimInstance Win32_Process -Filter "ParentProcessId=${hostPid}" | Where-Object Name -eq 'AppDock.InputHost.exe'; if (@($items).Count -ne 1) { throw 'isolated capture child not unique' }; $items | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let error = '';
      ps.stderr.on('data', (data) => (error += data));
      ps.on('exit', (code) => (code === 0 ? resolve() : reject(Error(error))));
    });
    await until(
      async () => (await snapshot()).globalHotKeys.some((s) => !s.registered),
      'capture failure visible',
    );
    await page
      .locator('[data-binding-id="win"]')
      .getByRole('button', { name: '入力を再試行', exact: true })
      .click();
    await until(
      async () => (await snapshot()).globalHotKeys.every((s) => s.registered),
      'retry capture succeeds',
    );
    checks.push(
      'local block control disabled; capture child failure releases ownership and explicit retry recovers',
    );
    await closeHost();
    await launch();
    const saved = (await snapshot()).settings.value.keybindings;
    assert.equal(saved.find((r) => r.id === 'win').blockOriginalInput, false);
    assert.equal(saved.find((r) => r.id === 'pass-a').blockOriginalInput, false);
    checks.push('saved Win shortcut and explicit passthrough survive full restart');
    const result = {
      ok: true,
      profile,
      version: (await snapshot()).version,
      executableSha256: portableSource ? hash(executable) : null,
      widgetsBaseline,
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
    if (host && !host.isClosed())
      fs.writeFileSync(
        path.join(profile, 'failure-host.json'),
        JSON.stringify(await snapshot().catch(() => null), null, 2),
      );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (terminalWindow)
      await peer
        ?.request('closeTerminal', { window: terminalWindow, title: terminalTitle })
        .catch(() => {});
    fs.writeFileSync(processFile + '.stop', 'stop');
    await closeHost().catch(() => {});
    peer?.close();
    target?.stdin.end();
    fs.writeFileSync(path.join(profile, 'host-output.log'), output);
  }
})();

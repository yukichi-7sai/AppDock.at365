const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { overlayPage, closingAction } = require('./shell-overlay-helper.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', 'command-stacks-ui-' + Date.now()),
  local = path.join(profile, 'local'),
  trace = path.join(profile, 'trace.jsonl');
const extension = path.join(profile, 'extensions', 'fixture.stacks');
fs.mkdirSync(extension, { recursive: true });
fs.mkdirSync(local, { recursive: true });
const names = ['a', 'b', 'host', 'fail', 'private'];
fs.writeFileSync(
  path.join(extension, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.stacks',
    name: 'Stack fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    commands: names.map((id) => ({
      id: 'fixture.stacks.' + id,
      title: 'Stack fixture ' + id,
      automation: id !== 'private',
    })),
  }),
);
fs.writeFileSync(
  path.join(extension, 'index.js'),
  `exports.activate=async c=>{for(const id of ${JSON.stringify(names)})c.commands.register('fixture.stacks.'+id,'Stack fixture '+id,async()=>{require('node:fs').appendFileSync(process.env.APPDOCK_STACK_TRACE,JSON.stringify({id})+'\\n');if(id==='fail')throw Error('Expected stack fixture failure');});};`,
);
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.closeToTray = false;
initial.host.hardwareAcceleration = false;
initial.host.soundEnabled = false;
initial.keybindings = [];
initial.gestures.enabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
initial.extensions['fixture.stacks'] = { enabled: true, settings: {} };
const row = (id, command, scope = 'global') => ({
  id,
  command,
  enabled: true,
  when: { scope, appletIds: [] },
});
const nestedId = randomUUID();
initial.customCommands = {
  version: 2,
  items: [
    {
      id: nestedId,
      typeId: 'appdock.commands.stack',
      owner: { kind: 'host' },
      title: 'Nested stack',
      description: '',
      configVersion: 1,
      config: {
        executionMode: 'first',
        entries: [
          row('nested-host', 'fixture.stacks.host', 'app'),
          row('nested-a', 'fixture.stacks.a'),
        ],
      },
      enabled: true,
      automation: false,
    },
  ],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
let browser,
  host,
  child,
  page,
  mainPort,
  helper,
  peer,
  success = false;
const errors = [],
  checks = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await wait(50);
  }
  throw Error(label + (last ? ': ' + last.message : ''));
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const calls = () =>
  fs.existsSync(trace)
    ? fs
        .readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line).id)
    : [];
async function launch() {
  if (!helper) {
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
    assert.equal(built.status, 0, 'input helper build');
    helper = spawn(path.join(directory, 'AppDock.InputTarget.exe'), [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    helper.stderr.on('data', (data) => fs.appendFileSync(path.join(profile, 'helper.log'), data));
    peer = new JsonLinePeer(helper.stdout, helper.stdin, async () => {});
    await peer.request('snapshot');
  }
  let exe = require('electron');
  if (portable) {
    exe = path.join(profile, 'AppDock.at365.exe');
    require('./copy-host.cjs').copyHost(portable, exe);
    assert.equal(hash(exe), hash(portable));
  }
  const port = await freePort(),
    env = { ...process.env, APPDOCK_STACK_TRACE: trace };
  mainPort = await freePort();
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    exe,
    [
      ...(portable ? [] : [root]),
      '--test-profile=' + profile,
      '--test-local-state=' + local,
      '--remote-debugging-port=' + port,
      '--inspect=' + mainPort,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
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
  host.on('pageerror', (e) => errors.push(e.message));
  await until(async () => {
    const state = await snapshot();
    return (
      state.startupReady &&
      state.extensions.some((e) => e.id === 'fixture.stacks' && e.state === 'running')
    );
  }, 'fixture startup');
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  page = await settingsPage(host);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1320, height: 900 });
}
async function focusHost() {
  const handle = await inspect(
    mainPort,
    `process.getBuiltinModule('module').createRequire(${JSON.stringify(portable ? path.join(profile, 'resources/app.asar/package.json') : path.join(root, 'package.json'))})('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/')).getNativeWindowHandle().readBigUInt64LE().toString()`,
  );
  await peer.request('focusWindow', { window: handle });
  await until(
    async () => (await peer.request('snapshot')).foreground === handle,
    'native host foreground',
  );
}
async function close() {
  if (child?.exitCode === null)
    await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'exit', 10000).catch(() => child.kill());
  await browser?.close().catch(() => {});
}
(async () => {
  try {
    await launch();
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    const dialog = page.getByTestId('settings-dialog');
    const save = async () => {
      await until(() => dialog.getByTestId('settings-dialog-confirm').isEnabled(), 'save ready');
      await dialog.getByTestId('settings-dialog-confirm').click();
      await dialog.waitFor({ state: 'hidden' });
    };
    const choose = async (id) => {
      await dialog.getByTestId('stack-add-command').click();
      const palette = await overlayPage(host);
      await palette.getByRole('combobox').fill(id);
      await until(async () => !!(await palette.locator('[role=option]').count()), 'command result');
      await closingAction(palette.getByRole('combobox').press('Enter'));
      await until(() => palette.isClosed(), 'picker closed');
      await dialog.getByTestId('command-stack-editor').waitFor();
    };
    await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    await dialog.getByTestId('custom-command-kind').selectOption('appdock.commands.stack');
    await dialog.getByLabel('名前', { exact: true }).fill('Ordered stack');
    await choose('fixture.stacks.a');
    await choose('fixture.stacks.b');
    await dialog.getByTestId('stack-entry').nth(1).locator('.stack-drag').focus();
    await page.keyboard.press('ArrowUp');
    assert.match(await dialog.getByTestId('stack-entry').first().innerText(), /fixture b/);
    await choose('appdock.custom.' + nestedId);
    await dialog.screenshot({ path: path.join(profile, 'named-stack.png') });
    assert.equal(
      await dialog
        .locator('.settings-choice')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
      '0px',
    );
    await save();
    let state = await snapshot();
    const item = state.settings.value.customCommands.items.find((d) => d.title === 'Ordered stack');
    assert(item);
    assert.deepEqual(
      item.config.entries.map((e) => e.command),
      ['fixture.stacks.b', 'fixture.stacks.a', 'appdock.custom.' + nestedId],
    );
    checks.push('named stack creation through real command picker and keyboard reorder');
    await focusHost();
    await host.evaluate((id) => window.dock.executeCommand(id), 'appdock.custom.' + item.id);
    await until(() => calls().length === 3, 'direct stack execution');
    assert.deepEqual(calls(), ['b', 'a', 'host']);
    checks.push('direct nested stack executes ordered leaves with captured host condition');
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await page.getByTestId('command-stack-tab:' + kind).click();
      await page.getByTestId('trigger-stack-table').getByRole('button', { name: /追加/ }).click();
      if (kind === 'shortcuts') {
        const capture = dialog.locator('.shortcut-capture');
        await capture.dispatchEvent('keydown', {
          key: '9',
          code: 'Digit9',
          ctrlKey: true,
          shiftKey: true,
        });
      }
      await choose('appdock.custom.' + item.id);
      await dialog.getByTestId('binding-scope:app').click();
      await dialog.getByTestId('stack-execution-mode').selectOption('all');
      await save();
      assert.equal(await page.getByTestId('trigger-stack-table').locator('tbody tr').count(), 1);
    }
    state = await snapshot();
    assert.equal(state.settings.value.keybindings.length, 1);
    assert.equal(state.settings.value.gestures.bindings.length, 1);
    assert.equal(state.settings.value.touchpadGestures.bindings.length, 1);
    checks.push('three trigger kinds create dedicated stacks from custom-command tabs');
    for (const [kind, title] of [
      ['shortcuts', 'キージェスチャー'],
      ['gestures', 'マウスジェスチャー'],
      ['touchpad-gestures', 'タッチパッドジェスチャー'],
    ]) {
      await page.getByTestId('settings-nav:' + kind).click();
      const table = page.getByTestId('trigger-stack-table');
      await table.waitFor();
      const optionsId = {
        shortcuts: 'key-gesture-options',
        gestures: 'mouse-gesture-enablement',
        'touchpad-gestures': 'touchpad-gesture-enablement',
      }[kind];
      const settingsKey = {
        shortcuts: 'keybindingOptions',
        gestures: 'gestures',
        'touchpad-gestures': 'touchpadGestures',
      }[kind];
      for (const mode of ['first', 'all', 'first', 'all']) {
        await page.getByTestId(optionsId).first().getByRole('combobox').first().selectOption(mode);
        await until(
          async () => (await snapshot()).settings.value[settingsKey].executionMode === mode,
          'feature option saved',
        );
        assert.equal(
          await page.getByTestId(optionsId).count(),
          1,
          kind + ' options must not multiply',
        );
        assert.equal(
          await page.getByTestId('gesture-common-options').count(),
          1,
          kind + ' common options must not multiply',
        );
        assert.equal(await table.count(), 1, kind + ' stack table must not multiply');
        if (kind === 'touchpad-gestures')
          assert.equal(await page.getByTestId('touchpad-connection').count(), 1);
      }
      assert.equal(await table.locator('tbody tr').count(), 1);
      await table.getByRole('button', { name: /を編集$/ }).click();
      await dialog.getByTestId('stack-execution-mode').selectOption('first');
      await save();
      assert.equal(
        await page.getByTestId(optionsId).count(),
        1,
        kind + ' options remain unique after stack edit',
      );
    }
    checks.push(
      'repeated feature-option and stack edits retain one options section and table for each gesture kind',
    );
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    await page.getByTestId('command-stack-tab:gestures').click();
    assert.match(await page.getByTestId('trigger-stack-table').innerText(), /最初/);
    checks.push('feature pages and custom tabs edit the same saved stacks');
    await focusHost();
    const dispatched = await host.evaluate(() => window.dock.dispatchShortcut('Ctrl+Shift+9'));
    assert.equal(dispatched.executed, 3);
    assert.deepEqual(calls(), ['b', 'a', 'host', 'b', 'a', 'host']);
    checks.push(
      'local key trigger invokes its dedicated stack and nested named stack through the dispatcher',
    );
    await page.getByTestId('command-stack-tab:created').click();
    await page.getByRole('button', { name: 'Ordered stackを編集', exact: true }).click();
    await dialog.getByTestId('stack-entry').first().locator('.stack-entry-select').click();
    await dialog.getByTestId('binding-scope:exe').filter({ visible: true }).click();
    await until(
      () => dialog.getByTestId('settings-dialog-confirm').isDisabled(),
      'invalid condition blocks save',
    );
    await dialog.getByTestId('binding-scope:app').filter({ visible: true }).click();
    await page.setViewportSize({ width: 900, height: 640 });
    await dialog.screenshot({ path: path.join(profile, 'stack-compact.png') });
    assert(await dialog.getByTestId('settings-dialog-confirm').isVisible());
    const bounds = await dialog.boundingBox();
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 641);
    await dialog
      .getByTestId('stack-entry')
      .first()
      .getByRole('button', { name: 'このコマンドを削除', exact: true })
      .click();
    await save();
    const raw = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
    assert.equal(raw.triggerStacks.items.length, 3);
    assert.equal(raw.keybindings, undefined);
    assert.equal(raw.gestures?.bindings, undefined);
    checks.push('compact dialog footer, entry removal and canonical grouped persistence');
    await close();
    await launch();
    state = await snapshot();
    assert.equal(
      state.settings.value.customCommands.items.find((d) => d.id === item.id).config.entries.length,
      2,
    );
    assert.equal(state.settings.value.touchpadGestures.bindings.length, 1);
    assert.deepEqual(errors, []);
    checks.push('restart retains named and dedicated stacks');
    success = true;
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack);
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await close();
    peer?.close();
    if (helper?.exitCode === null) helper.kill();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success,
          checks,
          errors,
          portable,
          sha256: portable ? hash(portable) : null,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success, profile, checks }));
    if (!success) process.exitCode = 1;
  }
})();

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
const layouts = [];
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
    let dialog = page.getByTestId('settings-dialog');
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
    const next = async () => {
      const action = dialog.getByTestId('settings-dialog-confirm');
      assert.equal(await action.innerText(), '次へ');
      await until(() => action.isEnabled(), 'valid trigger selection');
      await action.click();
      await dialog.getByTestId('stack-command-step').waitFor();
      assert(await dialog.getByTestId('stack-trigger-selection').isHidden());
    };
    const pickerSignatures = {};
    const pickerSignature = () =>
      dialog
        .getByTestId('gesture-input-picker')
        .locator('button[data-testid]')
        .evaluateAll((buttons) =>
          buttons.map((button) => ({ id: button.dataset.testid, text: button.textContent.trim() })),
        );
    const checkSelectionLayout = async (kind) => {
      for (const viewport of [
        { width: 1320, height: 1050 },
        { width: 900, height: 640 },
        { width: 560, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        assert(await dialog.getByTestId('stack-command-step').isHidden());
        const dimensions = await dialog.evaluate((element) => {
          const body = element.querySelector('.settings-dialog-body');
          const selection = element.querySelector('.stack-trigger-selection');
          const footer = element
            .querySelector('[data-testid=settings-dialog-confirm]')
            .getBoundingClientRect();
          return {
            height: selection.clientHeight,
            bodyHeight: body.clientHeight,
            bodyScroll: body.scrollHeight,
            overflow: getComputedStyle(body).overflowY,
            footer: footer.bottom,
          };
        });
        assert(dimensions.height > 200, JSON.stringify(dimensions));
        assert.equal(dimensions.overflow, 'hidden');
        assert(dimensions.bodyScroll <= dimensions.bodyHeight + 1);
        assert(dimensions.footer <= viewport.height - 8);
        await dialog.screenshot({
          path: path.join(profile, `trigger-select-${kind}-${viewport.width}.png`),
        });
      }
      await page.setViewportSize({ width: 1320, height: 900 });
    };
    const checkTriggerLayout = async (kind, suffix = '') => {
      assert.equal(
        await dialog
          .locator('.stack-trigger-header .settings-field-label')
          .getByText('トリガー', { exact: true })
          .count(),
        1,
      );
      for (const viewport of [
        { width: 1320, height: 1050 },
        { width: 900, height: 640 },
        { width: 560, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        const layout = await dialog.evaluate((element) => {
          const body = element.querySelector('.settings-dialog-body');
          const conditions = element.querySelector('.stack-condition-panel');
          const list = element.querySelector('.stack-entry-list');
          const box = element.getBoundingClientRect();
          const page = document.querySelector('.shell > main').getBoundingClientRect();
          const footer = element
            .querySelector('[data-testid=settings-dialog-confirm]')
            .getBoundingClientRect();
          return {
            height: box.height,
            bottom: box.bottom,
            top: box.top,
            pageTop: page.top,
            pageBottom: page.bottom,
            footerBottom: footer.bottom,
            bodyHeight: body.clientHeight,
            bodyScroll: body.scrollHeight,
            outerOverflow: getComputedStyle(body).overflowY,
            headerBorder: getComputedStyle(element.querySelector('.stack-trigger-header'))
              .borderBottomWidth,
            divider:
              getComputedStyle(conditions)[innerWidth < 620 ? 'borderTopWidth' : 'borderLeftWidth'],
            conditionsHeight: conditions.clientHeight,
            listHeight: list.clientHeight,
            conditionsOverflow: getComputedStyle(conditions).overflowY,
          };
        });
        layouts.push({ kind, suffix, viewport, ...layout });
        assert.equal(layout.outerOverflow, 'hidden');
        assert(layout.bodyScroll <= layout.bodyHeight + 1, JSON.stringify(layout));
        assert(parseFloat(layout.headerBorder) > 0);
        assert(parseFloat(layout.divider) > 0);
        assert.equal(layout.conditionsOverflow, 'auto');
        assert(layout.conditionsHeight > 60 && layout.listHeight > 30, JSON.stringify(layout));
        assert(layout.top >= 0 && layout.bottom <= viewport.height + 1);
        assert(layout.top >= layout.pageTop && layout.bottom <= layout.pageBottom + 1);
        assert(layout.footerBottom <= viewport.height - 8);
        if (viewport.height > 900) assert(layout.height > 850 && layout.height <= 900);
        await dialog.screenshot({
          path: path.join(profile, `trigger-${kind}-${viewport.width}${suffix}.png`),
        });
      }
      await page.setViewportSize({ width: 1320, height: 900 });
    };
    await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    await dialog.getByTestId('custom-command-kind').selectOption('appdock.commands.stack');
    await dialog.getByLabel('名前', { exact: true }).fill('Ordered stack');
    await dialog.getByTestId('stack-add-command').click();
    const cancelledPicker = await overlayPage(host);
    await closingAction(cancelledPicker.mouse.click(5, 5));
    await until(() => cancelledPicker.isClosed(), 'background closes only the command picker');
    assert(await dialog.isVisible(), 'parent editor survives command picker cancellation');
    assert.equal(await dialog.getByLabel('名前', { exact: true }).inputValue(), 'Ordered stack');
    checks.push(
      'command picker background cancellation preserves the parent dialog and unsaved input',
    );
    await choose('fixture.stacks.a');
    await choose('fixture.stacks.b');
    await dialog.getByTestId('stack-entry').nth(1).locator('.stack-drag').focus();
    await page.keyboard.press('ArrowUp');
    assert.match(await dialog.getByTestId('stack-entry').first().innerText(), /fixture b/);
    await choose('appdock.custom.' + nestedId);
    await require('./custom-command-layout-checks.cjs')({
      page,
      dialog,
      profile,
      name: 'named-stack-layout',
      stack: true,
    });
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
        await page.setViewportSize({ width: 900, height: 640 });
        await dialog.locator('.shortcut-special-trigger').click();
        await dialog
          .locator('.shortcut-special-picker')
          .getByRole('button', { name: 'F12', exact: true })
          .scrollIntoViewIfNeeded();
        assert(
          await dialog.getByTestId('stack-trigger-selection').evaluate((el) => el.scrollTop > 0),
        );
        await dialog.locator('.shortcut-special-trigger').click();
      } else {
        pickerSignatures[kind] = await pickerSignature();
        if (kind === 'gestures') {
          await dialog.getByTestId('gesture-family:key').click();
          assert(await dialog.getByTestId('settings-dialog-confirm').isDisabled());
          await dialog.getByTestId('gesture-family:move').click();
          await dialog.getByTestId('gesture-steps:2').click();
          await dialog.getByTestId('gesture-direction:1:right').click();
          await dialog.getByTestId('gesture-direction:2:up').click();
          assert(await dialog.getByTestId('gesture-direction:2:right').isDisabled());
          await dialog.getByTestId('gesture-family:click').click();
          await dialog.getByTestId('gesture-action:click-middle').click();
          await dialog.getByTestId('gesture-family:move').click();
          assert.equal(
            await dialog.getByTestId('gesture-direction:1:right').getAttribute('aria-pressed'),
            'true',
          );
          await dialog.getByTestId('gesture-steps:1').click();
          await dialog.getByTestId('gesture-direction:1:up').click();
        } else {
          await dialog.getByTestId('touchpad-action:four.right').click();
          await dialog.getByTestId('touchpad-action:three.tap').click();
        }
      }
      await checkSelectionLayout(kind);
      const beforeSteps = (await snapshot()).settings.value;
      await next();
      await choose('appdock.custom.' + item.id);
      await dialog.getByTestId('binding-scope:exe').click();
      await until(
        () => dialog.getByTestId('settings-dialog-confirm').isDisabled(),
        'condition validation applied',
      );
      await dialog.getByTestId('settings-dialog-reset').click();
      await next();
      assert.equal(await dialog.getByTestId('stack-entry').count(), 1);
      await until(
        () => dialog.getByTestId('settings-dialog-confirm').isDisabled(),
        'condition draft retained',
      );
      assert.deepEqual(
        (await snapshot()).settings.value,
        beforeSteps,
        'wizard steps must not persist drafts',
      );
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
      assert.equal(await dialog.locator('h2').innerText(), 'トリガーの編集');
      assert.equal(
        await dialog
          .locator('.shortcut-capture, .gesture-input-picker, [data-testid=stack-trigger-input]')
          .count(),
        0,
      );
      assert.equal(await dialog.getByTestId('settings-dialog-reset').count(), 0);
      const fixedInput = await dialog.getByTestId('stack-trigger-readonly').innerText();
      await dialog.getByTestId('binding-scope:exe').filter({ visible: true }).click();
      await checkTriggerLayout(kind);
      await dialog.getByTestId('binding-scope:app').filter({ visible: true }).click();
      await dialog.getByTestId('stack-execution-mode').selectOption('first');
      assert.equal(await dialog.getByTestId('stack-trigger-readonly').innerText(), fixedInput);
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
    dialog = page.getByTestId('settings-dialog');
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    for (const [kind, inputs, expected] of [
      [
        'shortcuts',
        ['Ctrl+Shift+F10', 'Ctrl+Shift+F2'],
        ['Ctrl+Shift+9', 'Ctrl+Shift+F2', 'Ctrl+Shift+F10'],
      ],
      ['gestures', ['wheel-down', 'move-down'], ['move-up', 'move-down', 'wheel-down']],
      [
        'touchpad-gestures',
        ['four.right', 'three.left'],
        ['three.tap', 'three.left', 'four.right'],
      ],
    ]) {
      await page.getByTestId('command-stack-tab:' + kind).click();
      const table = page.getByTestId('trigger-stack-table');
      const titles = new Map();
      titles.set(
        expected[0],
        await table.locator('tbody tr').first().locator('td').first().innerText(),
      );
      for (const input of inputs) {
        await table.getByRole('button', { name: /追加/ }).click();
        if (kind === 'shortcuts') {
          const key = input.split('+').at(-1);
          await dialog
            .locator('.shortcut-capture')
            .dispatchEvent('keydown', { key, code: key, ctrlKey: true, shiftKey: true });
          titles.set(input, input);
        } else {
          if (kind === 'touchpad-gestures')
            await dialog.getByTestId('touchpad-action:' + input).click();
          else if (input.startsWith('wheel-')) {
            await dialog.getByTestId('gesture-family:wheel').click();
            await dialog.getByTestId('gesture-action:' + input).click();
          } else await dialog.getByTestId('gesture-direction:1:' + input.slice(5)).click();
          titles.set(
            input,
            await dialog.getByTestId('binding-input-summary').locator('strong').innerText(),
          );
        }
        await next();
        await choose('fixture.stacks.a');
        await dialog.getByTestId('binding-scope:app').click();
        await save();
      }
      const expectedTitles = expected.map((input) => titles.get(input));
      const displayed = () =>
        table
          .locator('tbody tr')
          .evaluateAll((rows) => rows.map((tr) => tr.querySelector('td').innerText));
      assert.deepEqual(await displayed(), expectedTitles);
      await page.getByTestId('settings-nav:' + kind).click();
      assert.deepEqual(await displayed(), expectedTitles);
      await table
        .getByRole('button', { name: titles.get(inputs[1]) + 'を編集', exact: true })
        .click();
      await dialog.getByTestId('stack-execution-mode').selectOption('all');
      if (kind === 'shortcuts') {
        for (let index = 0; index < 9; index++) await choose('fixture.stacks.b');
        await checkTriggerLayout(kind, '-many');
        const list = dialog.locator('.stack-entry-list');
        await list.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        assert(await list.evaluate((el) => el.scrollTop > 0));
      }
      await save();
      const stored = require('../out/main/shared/trigger-stacks').triggerStacks(
        (await snapshot()).settings.value,
        kind,
      );
      assert.equal(stored.find((stack) => stack.input === inputs[1]).executionMode, 'all');
      assert.equal(stored.find((stack) => stack.input === inputs[0]).executionMode, 'inherit');
      await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    }
    checks.push(
      'trigger dialogs retain separators, one trigger label and reachable footer at tall, compact and narrow sizes',
    );
    checks.push(
      'all trigger tables follow picker order and sorted edits update the correct saved stack',
    );
    const beforeCancel = (await snapshot()).settings.value;
    await page.getByTestId('command-stack-tab:gestures').click();
    await page.getByTestId('trigger-stack-table').getByRole('button', { name: /追加/ }).click();
    assert(
      await dialog.getByTestId('settings-dialog-confirm').isDisabled(),
      'duplicate trigger blocks next',
    );
    await dialog.getByTestId('settings-dialog-cancel').click();
    await page.getByTestId('command-stack-tab:touchpad-gestures').click();
    await page.getByTestId('trigger-stack-table').getByRole('button', { name: /追加/ }).click();
    await dialog.getByTestId('touchpad-action:four.down').click();
    await next();
    await choose('fixture.stacks.a');
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(
      (await snapshot()).settings.value,
      beforeCancel,
      'cancellation on either step discards the draft',
    );
    await page.getByRole('button', { name: 'コマンドトリガー', exact: true }).click();
    for (const kind of ['gestures', 'touchpad-gestures']) {
      await page.locator('[data-shortcut-command="fixture.stacks.host"] .command-title').hover();
      await page.getByTestId('binding-add:fixture.stacks.host:' + kind).click();
      assert.deepEqual(
        await pickerSignature(),
        pickerSignatures[kind],
        'assignment and stack creation must share the same picker',
      );
      if (kind === 'gestures') {
        await dialog.getByTestId('gesture-family:wheel').click();
        await dialog.getByTestId('gesture-action:wheel-up').click();
      } else await dialog.getByTestId('touchpad-action:four.up').click();
      await dialog.getByTestId('binding-apply').click();
      await dialog.waitFor({ state: 'hidden' });
      await until(async () => {
        const value = (await snapshot()).settings.value;
        return (kind === 'gestures' ? value.gestures : value.touchpadGestures).bindings.some(
          (entry) =>
            entry.command === 'fixture.stacks.host' &&
            entry.gesture === (kind === 'gestures' ? 'wheel-up' : 'four.up'),
        );
      }, 'shared picker assignment persisted');
    }
    checks.push(
      'two-step creation retains invalid condition drafts without persisting; editing locks trigger identity',
    );
    checks.push(
      'assignment addition and stack creation share identical gesture pickers and persist selected actions',
    );
    const triggerTable = page.locator('.command-triggers-editor .command-binding-table');
    assert.deepEqual(await triggerTable.locator('thead th').allTextContents(), [
      'コマンド',
      'トリガー',
      'いつ・どこで',
      '',
    ]);
    assert.equal(await triggerTable.locator('.applet-shortcut-edit').count(), 0);
    assert.equal(await triggerTable.locator('.binding-trigger-actions-cell').count(), 0);
    const { triggerStacks } = require('../out/main/shared/trigger-stacks');
    const stacks = (await snapshot()).settings.value;
    const bindingRow = (kind, id) =>
      triggerTable.locator('[data-binding-id]').filter({
        has: page.getByTestId('binding-delete:' + JSON.stringify([kind, id])),
      });
    for (const [kind, input, multiple] of [
      ['shortcuts', 'Ctrl+Shift+F2', true],
      ['gestures', 'move-down', false],
      ['touchpad-gestures', 'three.left', false],
    ]) {
      const stack = triggerStacks(stacks, kind).find((item) => item.input === input);
      const selected = stack.entries.at(-1);
      const binding = bindingRow(kind, selected.id);
      const gear = binding.locator('.binding-order');
      await binding.locator('.binding-condition-cell').hover();
      assert.deepEqual(
        await binding
          .locator('.binding-assignment-actions-cell button')
          .evaluateAll((buttons) =>
            buttons.map((button) =>
              button.classList.contains('binding-order')
                ? 'gear'
                : button.classList.contains('binding-delete')
                  ? 'delete'
                  : 'unexpected',
            ),
          ),
        ['gear', 'delete'],
      );
      assert.equal(await gear.getAttribute('data-multiple-commands'), String(multiple));
      assert.equal(
        await gear.evaluate((button) => button.classList.contains('accent-action')),
        multiple,
      );
      if (multiple) assert.match(await gear.getAttribute('aria-description'), /複数のコマンド/);
      await binding.locator('.binding-condition-edit').focus();
      await page.keyboard.press('Tab');
      assert(await gear.evaluate((button) => button === document.activeElement));
      await gear.press('Enter');
      await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
      assert.equal(
        await dialog
          .locator('[data-stack-entry][data-selected=true]')
          .getAttribute('data-stack-entry'),
        selected.id,
      );
      assert.equal(await dialog.getByTestId('stack-entry').count(), stack.entries.length);
      await dialog.getByTestId('settings-dialog-cancel').click();
      await dialog.waitFor({ state: 'hidden' });
      assert(await gear.evaluate((button) => button === document.activeElement));
    }
    const multiStack = triggerStacks(stacks, 'shortcuts').find(
      (item) => item.input === 'Ctrl+Shift+F2',
    );
    const repeated = multiStack.entries.find((entry) => entry.command === 'fixture.stacks.b');
    const multiRow = bindingRow('shortcuts', repeated.id);
    const multiGear = multiRow.locator('.binding-order');
    const search = page.locator('.command-triggers-editor input[type=search]');
    await search.fill('fixture.stacks.b');
    assert.equal(
      await triggerTable.locator('[data-shortcut-command="fixture.stacks.a"]').count(),
      0,
    );
    assert(await multiGear.evaluate((button) => button.classList.contains('accent-action')));
    await multiRow.locator('.binding-condition-cell').hover();
    await page.screenshot({ path: path.join(profile, 'trigger-row-actions.png') });
    await multiGear.click();
    const unique = multiStack.entries.find((entry) => entry.command === 'fixture.stacks.a');
    await dialog.locator(`[data-stack-entry="${unique.id}"] .settings-list-icon`).click();
    await save();
    await until(
      async () => (await multiGear.getAttribute('data-multiple-commands')) === 'false',
      'only repeated instances of the same command do not accent the gear',
    );
    assert(!(await multiGear.evaluate((button) => button.classList.contains('accent-action'))));
    assert(await multiGear.evaluate((button) => button === document.activeElement));
    await search.fill('');
    checks.push(
      'trigger rows use one gear beside delete; all three kinds open the selected entry and restore focus; accent counts distinct commands across filters and updates after save',
    );
    assert.deepEqual(errors, []);
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
          layouts,
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

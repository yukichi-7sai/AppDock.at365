const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { _electron: electron, chromium } = require('playwright');
const { waitForHost } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `command-triggers-ui-${Date.now()}`);
const extension = path.join(profile, 'extensions', 'fixture.triggers');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(
  path.join(extension, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.triggers',
    name: 'Trigger fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    commands: ['one', 'two', 'new', 'long', 'tail'].map((name) => ({
      id: `fixture.triggers.${name}`,
      title: `Trigger ${name}`,
      automation: name === 'two',
    })),
  }),
);
fs.writeFileSync(
  path.join(extension, 'index.js'),
  "exports.activate = async c => { for (const name of ['one', 'two', 'new', 'long', 'tail']) c.commands.register('fixture.triggers.' + name, 'Trigger ' + name, async () => {}); };",
);
const initial = createDefaultSettings();
const featureSettingsOnly = process.argv.includes('--feature-settings-only');
const triggerTabsOnly = process.argv.includes('--trigger-tabs-only');
const inheritanceOnly = process.argv.includes('--inheritance-only');
const bindingEditorsOnly = process.argv.includes('--binding-editors-only');
const triggerSettingsOnly = process.argv.includes('--trigger-settings-only');
const lockKeysOnly = process.argv.includes('--lock-keys-only');
if (bindingEditorsOnly) {
  initial.keybindingOptions.excludedProcesses = ['key-base'];
  initial.gestures.excludedProcesses = ['mouse-base'];
  initial.touchpadGestures.excludedProcesses = ['touch-base'];
}
const source = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
initial.host.hardwareAcceleration = false;
initial.extensions['fixture.triggers'] = { enabled: true, settings: {} };
if (featureSettingsOnly) {
  delete initial.commandTriggerOptions;
  initial.customCommands = {
    version: 2,
    items: [
      {
        id: '27b98202-1867-4ae4-b6c3-4c310ce05f10',
        title: 'Trigger custom',
        description: '',
        typeId: 'fixture.unavailable',
        owner: { kind: 'host' },
        configVersion: 1,
        config: {},
        enabled: false,
        automation: false,
      },
    ],
  };
  for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures']) {
    initial[key].browsers = ['legacy-browser'];
    initial[key].requireChromiumWindowClass = true;
  }
}
const common = {
  id: 'same-id',
  command: 'fixture.triggers.one',
  enabled: true,
  when: { scope: 'app', appletIds: [] },
};
initial.keybindings = [
  { ...common, key: 'Ctrl+F8' },
  { ...common, id: 'second-key', command: 'fixture.triggers.two', key: 'Ctrl+F8' },
  ...['long', 'tail'].flatMap((name) =>
    Array.from({ length: 24 }, (_, index) => ({
      ...common,
      id: `${name}-${index}`,
      command: `fixture.triggers.${name}`,
      key: 'Ctrl+Shift+F8',
    })),
  ),
];
initial.gestures.enabled = false;
initial.gestures.distance = 87;
initial.gestures.bindings = [
  { ...common, gesture: 'move-up', when: { ...common.when, processes: [] } },
];
initial.touchpadGestures.enabled = false;
initial.touchpadGestures.bindings = [
  { ...common, gesture: 'four.right', when: { ...common.when, processes: [] } },
  {
    ...common,
    id: 'touchpad-second',
    gesture: 'three.tap',
    when: { ...common.when, processes: [] },
  },
];
if (triggerSettingsOnly) {
  for (const key of ['gestures', 'touchpadGestures']) {
    initial[key].bindings.push({
      ...initial[key].bindings[0],
      id: 'second-input',
      command: 'fixture.triggers.two',
    });
  }
}
if (lockKeysOnly) {
  initial.keybindings = [];
  initial.gestures.bindings = [];
  initial.touchpadGestures.bindings = [];
}
if (inheritanceOnly) {
  initial.keybindingOptions.executionMode = 'first';
  initial.gestures.executionMode = 'first';
  initial.touchpadGestures.executionMode = 'first';
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const portable = source ? path.join(profile, 'AppDock.at365.exe') : null;
if (portable) {
  require('./copy-host.cjs').copyHost(path.resolve(source), portable);
  assert.equal(hash(portable), hash(path.resolve(source)));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const until = async (predicate, title) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(title);
};
async function launch() {
  if (!portable)
    return electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`],
      env,
    });
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const child = spawn(portable, [`--test-profile=${profile}`, `--remote-debugging-port=${port}`], {
    env,
    cwd: profile,
    windowsHide: true,
    stdio: 'ignore',
  });
  const browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'portable CDP',
  );
  const host = await until(
    () =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith('appdock://host/')),
    'host page',
  );
  return {
    firstWindow: async () => host,
    close: async () => {
      await host
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
      await until(() => child.exitCode !== null, 'portable shutdown');
      await browser.close();
    },
  };
}
const checks = [];
const recordSuccess = () => {
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify(
      {
        success: true,
        checks,
        featureSettingsOnly,
        triggerTabsOnly,
        inheritanceOnly,
        bindingEditorsOnly,
        lockKeysOnly,
        source: source ? path.resolve(source) : 'development build',
        sha256: portable ? hash(portable) : null,
        limitations: ['UI and durable settings only; no physical input or Windows touchpad writes'],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ success: true, checks: checks.length, profile }));
};
(async () => {
  let app;
  try {
    app = await launch();
    let host = await app.firstWindow();
    host.setDefaultTimeout(15000);
    const errors = [];
    host.on('pageerror', (error) => errors.push(error.message));
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    const snapshot = () => host.evaluate(() => window.dock.snapshot());
    const saved = async () => (await snapshot()).settings.value;
    const open = async (page = 'command-triggers') => {
      await host.evaluate(
        (page) => window.dock.executeCommand(`appdock.settings.${page}.open`),
        page,
      );
      await host.getByTestId(`settings-page:${page}`).waitFor();
    };
    const command = (id) => host.locator(`[data-shortcut-command="${id}"]`);
    const row = (kind, id) =>
      host.locator(`[data-binding-id=${JSON.stringify(JSON.stringify([kind, id]))}]`);
    const dialog = () => host.getByTestId('settings-dialog');
    const save = async () => settleSettings(host);
    if (inheritanceOnly) {
      await open();
      const inheritance = require('./trigger-inheritance-checks.cjs');
      await inheritance.check({ host, saved, save, open, row, checks });
      const durable = await saved();
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open();
      await inheritance.verify({ host, checks });
      assert.deepEqual(await saved(), durable);
      assert.deepEqual(errors, []);
      checks.push('actual restart retains global modes and inherited trigger selections');
      recordSuccess();
      return;
    }
    if (lockKeysOnly) {
      await open();
      await require('./lock-key-ui-checks.cjs')({ host, saved, save, checks, row, until });
      const durable = (await saved()).keybindings;
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open();
      assert.deepEqual((await saved()).keybindings, durable);
      await until(async () => {
        const state = await snapshot();
        return durable.every(({ key }) =>
          state.globalHotKeys.some((status) => status.shortcut === key && status.registered),
        );
      }, 'lock keys applied after restart');
      assert.deepEqual(errors, []);
      checks.push('lock keys and blocking choices persist and register after an actual restart');
      recordSuccess();
      return;
    }
    if (triggerSettingsOnly) {
      for (const [page, description] of [
        [
          'command-triggers',
          '操作（トリガー）にコマンドを割り当て、いつ・どこで実行するかを設定します。',
        ],
        ['shortcuts', 'キー操作をトリガーとして使うための、共通の動作を設定します。'],
        ['gestures', 'マウス操作をトリガーとして使うための、認識方法や共通の動作を設定します。'],
        [
          'touchpad-gestures',
          'タッチパッド操作をトリガーとして使うための、共通の動作やWindowsとの接続を設定します。',
        ],
      ]) {
        await open(page);
        const heading = host.getByTestId(`settings-page:${page}`).locator('.settings-page-heading');
        assert.equal(await heading.locator('p').innerText(), description);
        await heading.screenshot({ path: path.join(profile, `description-${page}.png`) });
      }
      checks.push(
        'four settings pages explain the roles of gestures, triggers and command bindings',
      );
      await open();
      await require('./trigger-settings-checks.cjs')({ host, saved, save, checks, profile, row });
      const durable = await saved();
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open();
      for (const key of ['keybindingOptions', 'keybindings', 'gestures', 'touchpadGestures'])
        assert.deepEqual((await saved())[key], durable[key]);
      assert.deepEqual(errors, []);
      checks.push(
        'per-input modes and order survive actual restart; connections and defaults stay intact',
      );
      recordSuccess();
      return;
    }
    if (bindingEditorsOnly) {
      await open();
      await require('./binding-editor-checks.cjs')({ host, saved, save, checks, profile, row });
      const durable = await saved();
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open();
      for (const key of ['keybindings', 'gestures', 'touchpadGestures'])
        assert.deepEqual((await saved())[key], durable[key]);
      assert.deepEqual(errors, []);
      checks.push(
        'all editor changes survive an actual restart without changing connection mappings',
      );
      recordSuccess();
      return;
    }
    if (featureSettingsOnly) {
      await require('./gesture-settings-checks.cjs')({ host, open, save, saved, checks, profile });
      const beforeRestart = await saved();
      const durable = beforeRestart.commandTriggerOptions;
      const exclusions = ['keybindingOptions', 'gestures', 'touchpadGestures'].map(
        (key) => beforeRestart[key].excludedProcesses,
      );
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open('shortcuts');
      assert.deepEqual((await saved()).commandTriggerOptions, durable);
      const restarted = await saved();
      assert.deepEqual(
        ['keybindingOptions', 'gestures', 'touchpadGestures'].map(
          (key) => restarted[key].excludedProcesses,
        ),
        exclusions,
      );
      assert.equal(
        await host.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).inputValue(),
        durable.browsers.join(', '),
      );
      assert.deepEqual(errors, []);
      checks.push('common browser settings persist after an actual restart');
      recordSuccess();
      return;
    }
    await open();
    const tabs = host.getByTestId('command-trigger-tabs');
    assert.deepEqual(await tabs.getByRole('button').allTextContents(), [
      'コマンド一覧',
      'キージェスチャー',
      'マウスジェスチャー',
      'タッチパッドジェスチャー',
      'JSON',
    ]);
    assert.equal(
      await host.getByTestId('command-trigger-tab:commands').getAttribute('aria-pressed'),
      'true',
    );
    const beforeTabs = await saved();
    const commandList = host.getByTestId('command-triggers-list');
    await commandList.locator('input[type=search]').fill('fixture.triggers');
    await commandList.locator('select').selectOption('assigned');
    await host.getByTestId('command-trigger-filter:touchpad-gestures').click();
    const body = host.locator('.settings-body');
    const position = await body.evaluate((element) => {
      const tabs = element.querySelector('[data-testid="command-trigger-tabs"]');
      const visibleTabTop =
        tabs.getBoundingClientRect().top - element.getBoundingClientRect().top - 8;
      element.scrollTop = Math.min(120, Math.max(0, visibleTabTop));
      element.scrollLeft = 40;
      return { top: element.scrollTop, left: element.scrollLeft };
    });
    // Click visible tabs directly so automation does not scroll them past the toolbar's scroll padding.
    const clickTab = async (kind) => {
      const bounds = await host.getByTestId('command-trigger-tab:' + kind).boundingBox();
      assert(bounds);
      await host.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    };
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await clickTab(kind);
      assert.equal(await host.getByTestId('trigger-stack-table').count(), 1);
      assert.equal(await host.getByTestId('command-triggers-list').count(), 0);
    }
    await clickTab('commands');
    assert.equal(await commandList.locator('input[type=search]').inputValue(), 'fixture.triggers');
    assert.equal(await commandList.locator('select').inputValue(), 'assigned');
    assert.equal(
      await host
        .getByTestId('command-trigger-filter:touchpad-gestures')
        .getAttribute('aria-pressed'),
      'false',
    );
    assert.deepEqual(
      await body.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft })),
      position,
    );
    assert.deepEqual(await saved(), beforeTabs);
    checks.push(
      'four command-trigger views share the toolbar with JSON and preserve command filters and scroll without saving',
    );
    if (triggerTabsOnly) {
      await open('custom-commands');
      assert.equal(await host.getByTestId('command-trigger-tabs').count(), 0);
      assert.equal(await host.getByTestId('trigger-stack-table').count(), 0);
      assert.equal(await host.locator('.custom-commands-settings table').count(), 1);
      assert.deepEqual(await saved(), beforeTabs);
      checks.push(
        'custom commands retain only their command list without trigger tabs or stack tables',
      );
      await open();
      assert.equal(
        await host.getByTestId('command-trigger-tab:commands').getAttribute('aria-pressed'),
        'true',
      );
      await host.screenshot({ path: path.join(profile, 'command-trigger-tabs.png') });
      await app.close();
      app = await launch();
      host = await app.firstWindow();
      await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
      await open();
      assert.equal(
        await host.getByTestId('command-trigger-tab:commands').getAttribute('aria-pressed'),
        'true',
      );
      assert.deepEqual(await saved(), beforeTabs);
      assert.deepEqual(errors, []);
      checks.push(
        'reopening and actual restart select the command list and preserve all saved commands and triggers',
      );
      recordSuccess();
      return;
    }
    await commandList.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    await body.evaluate((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    assert.equal(await command('fixture.triggers.one').locator('[data-binding-id]').count(), 4);
    assert.equal(
      await command('fixture.triggers.new').getByText('未割り当て', { exact: true }).count(),
      1,
    );
    assert.deepEqual((await saved()).keybindings, initial.keybindings);
    assert.deepEqual((await saved()).touchpadGestures.bindings, initial.touchpadGestures.bindings);
    assert.equal(await host.getByTestId('settings-nav:shortcuts').count(), 1);
    assert.equal(await host.getByTestId('settings-nav:gestures').count(), 1);
    assert.equal(await host.getByTestId('settings-nav:touchpad-gestures').count(), 1);
    checks.push(
      'single mixed catalog / unassigned commands / overlapping IDs / original pages retained / display does not rewrite storage',
    );
    await require('./command-trigger-usability-checks.cjs')({ host, command, row, checks });
    const search = host.getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true });
    const assignmentFilter = host.getByLabel('トリガーの絞り込み', { exact: true });
    await assignmentFilter.selectOption('unassigned');
    assert.equal(await command('fixture.triggers.one').count(), 0);
    assert.equal(await command('fixture.triggers.new').count(), 1);
    await assignmentFilter.selectOption('assigned');
    assert.equal(await command('fixture.triggers.new').count(), 0);
    await assignmentFilter.selectOption('all');
    await search.fill('fixture.triggers.new');
    assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 1);
    await search.fill('');
    await host.getByTestId('command-provider:fixture.triggers.one').click();
    assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 5);
    await host.locator('.command-provider-filter button').click();
    checks.push('text search / assigned and unassigned / provider filter');
    const kindButton = (kind) => host.getByTestId(`command-trigger-filter:${kind}`);
    const selectKinds = async (selected) => {
      for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures'])
        if (
          (await kindButton(kind).getAttribute('aria-pressed')) !== String(selected.includes(kind))
        )
          await kindButton(kind).click();
    };
    for (const [kind, count] of [
      ['shortcuts', 1],
      ['gestures', 1],
      ['touchpad-gestures', 2],
    ]) {
      await selectKinds([kind]);
      assert.equal(
        await command('fixture.triggers.one').locator('[data-binding-id]').count(),
        count,
      );
    }
    await selectKinds(['shortcuts', 'touchpad-gestures']);
    assert.equal(await command('fixture.triggers.one').locator('[data-binding-id]').count(), 3);
    await row('shortcuts', 'same-id').locator('.binding-input-filter').click();
    assert.equal(await kindButton('gestures').getAttribute('aria-pressed'), 'false');
    await host.getByTestId('command-provider:fixture.triggers.one').click();
    assert.equal(await kindButton('gestures').getAttribute('aria-pressed'), 'false');
    await selectKinds([]);
    assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 0);
    await host.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    assert.equal(await kindButton('gestures').getAttribute('aria-pressed'), 'true');
    // Clear the independent provider target before continuing with the full catalog.
    await host.locator('.command-provider-filter button').click();
    await command('fixture.triggers.new').locator('.command-title').hover();
    await host.getByTestId('binding-add:fixture.triggers.new:touchpad-gestures').click();
    await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert(
      await host
        .getByTestId('binding-add:fixture.triggers.new:touchpad-gestures')
        .evaluate((button) => button === document.activeElement),
    );
    assert.deepEqual((await saved()).keybindings, initial.keybindings);
    await row('shortcuts', 'same-id').locator('.binding-input-filter').click();
    assert.equal(await command('fixture.triggers.two').count(), 1);
    assert.equal(await command('fixture.triggers.new').count(), 0);
    await host.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    checks.push(
      'multiple trigger kinds persist while temporary input/provider filters replace each other / no types yields zero rows / clear restores defaults',
    );
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await command('fixture.triggers.new').locator('.command-title').hover();
      await host.getByTestId(`binding-add:fixture.triggers.new:${kind}`).click();
      assert.equal(await host.getByTestId('command-trigger-add-kind').count(), 0);
      if (kind === 'shortcuts')
        await dialog()
          .getByRole('button', { name: 'キージェスチャーを入力', exact: true })
          .press('Control+F9');
      await dialog().getByRole('button', { name: '追加', exact: true }).click();
      await save();
      assert.equal(
        await command('fixture.triggers.new').locator('[data-binding-id]').count(),
        ['shortcuts', 'gestures', 'touchpad-gestures'].indexOf(kind) + 1,
      );
    }
    checks.push(
      'one-click typed addition for all three trigger types / no kind-selection step / cancel restores the same add button',
    );
    assert.equal(await host.locator('.binding-disabled-badge').count(), 0);
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await row(kind, 'same-id').locator('.binding-condition-cell').hover();
      await row(kind, 'same-id').locator('.binding-condition-edit').click();
      await dialog().getByRole('checkbox', { name: '有効', exact: true }).uncheck();
      await dialog().getByTestId('settings-dialog-confirm').click();
      await save();
      assert.equal(
        await row(kind, 'same-id')
          .locator('.binding-value-cell')
          .getByText('無効', { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await row(kind, 'same-id')
          .locator('.binding-condition-cell .binding-disabled-badge')
          .innerText(),
        '無効',
      );
    }
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures'])
      assert(await row(kind, 'same-id').getByText('無効', { exact: true }).isVisible());
    checks.push('disabled state stays visible for all three trigger kinds');
    const edited = await saved();
    assert.equal(edited.keybindings.find((row) => row.id === 'same-id').enabled, false);
    assert.equal(edited.gestures.bindings.find((row) => row.id === 'same-id').enabled, false);
    assert.equal(
      edited.touchpadGestures.bindings.find((row) => row.id === 'same-id').enabled,
      false,
    );
    assert.equal(edited.gestures.distance, 87);
    assert.deepEqual(edited.touchpadGestures.connections, initial.touchpadGestures.connections);
    checks.push(
      'edit each source independently / preserve recognition options and Windows connection mapping',
    );
    await row('gestures', 'same-id').locator('.binding-condition-cell').hover();
    await row('gestures', 'same-id').locator('.binding-delete').click();
    await host.getByTestId('settings-dialog-cancel').click();
    assert.equal(await row('gestures', 'same-id').count(), 1);
    await row('gestures', 'same-id').locator('.binding-condition-cell').hover();
    await row('gestures', 'same-id').locator('.binding-delete').click();
    await host.getByTestId('settings-dialog-confirm').click();
    await save();
    assert.equal(
      (await saved()).gestures.bindings.some((row) => row.id === 'same-id'),
      false,
    );
    assert((await saved()).keybindings.some((row) => row.id === 'same-id'));
    assert((await saved()).touchpadGestures.bindings.some((row) => row.id === 'same-id'));
    checks.push('delete confirmation / cancellation / equal IDs in other trigger types remain');
    await row('shortcuts', 'same-id').locator('.binding-condition-cell').hover();
    await row('shortcuts', 'same-id').locator('.binding-order').click();
    assert.equal(await dialog().getByTestId('stack-entry').count(), 2);
    await dialog().locator('[data-stack-entry="same-id"] .stack-drag').press('ArrowDown');
    await dialog().getByTestId('settings-dialog-confirm').click();
    await save();
    assert.deepEqual(
      (await saved()).keybindings.filter((row) => row.key === 'Ctrl+F8').map((row) => row.id),
      ['second-key', 'same-id'],
    );
    checks.push('same-input order dialog includes all commands and saves source order');
    await row('shortcuts', 'same-id').locator('.binding-condition-edit').click();
    await dialog().getByRole('checkbox', { name: '有効', exact: true }).check();
    await dialog().getByTestId('settings-dialog-confirm').click();
    await save();
    await open();
    assert.equal(await row('shortcuts', 'same-id').getByText('無効', { exact: true }).count(), 0);
    checks.push('key binding edits remain in the combined list');
    assert.equal(await host.locator('.command-triggers-editor .command-settings-cell').count(), 0);
    for (const page of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await open(page);
      assert.equal(await host.locator('[data-shortcut-command]').count(), 0);
    }
    await open();
    checks.push(
      'feature pages contain settings only; combined list omits its own navigation column',
    );
    const durable = await saved();
    await host.screenshot({ path: path.join(profile, 'command-triggers.png') });
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    host = await app.firstWindow();
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    await open();
    assert.deepEqual((await saved()).keybindings, durable.keybindings);
    assert.deepEqual((await saved()).gestures.bindings, durable.gestures.bindings);
    assert.deepEqual((await saved()).touchpadGestures.bindings, durable.touchpadGestures.bindings);
    checks.push('all three stores survive an actual restart');
    recordSuccess();
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success: false, checks, error: String(error.stack) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})();

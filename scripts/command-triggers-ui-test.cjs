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
initial.host.hardwareAcceleration = false;
initial.extensions['fixture.triggers'] = { enabled: true, settings: {} };
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
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : null;
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
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
    await open();
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
    await require('./command-trigger-layout-checks.cjs')({ host, command, row, checks, profile });
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
          .getByRole('button', { name: 'ショートカットキーを入力', exact: true })
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
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await row(kind, 'same-id').locator('.binding-condition-cell').hover();
      await row(kind, 'same-id').locator('.applet-shortcut-edit').click();
      await dialog().getByRole('switch', { name: 'この割り当てを有効にする' }).click();
      await dialog().getByRole('button', { name: '適用', exact: true }).click();
      await save();
    }
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
    assert.equal(await host.locator('.shortcut-order-row').count(), 2);
    await host.getByTestId('binding-order-down:same-id').click();
    await dialog().getByRole('button', { name: '適用', exact: true }).click();
    await save();
    assert.deepEqual(
      (await saved()).keybindings.filter((row) => row.key === 'Ctrl+F8').map((row) => row.id),
      ['second-key', 'same-id'],
    );
    checks.push('same-input order dialog includes all commands and saves source order');
    await open('shortcuts');
    assert.equal(
      await host.locator('[data-binding-id="same-id"]').getByText('無効', { exact: true }).count(),
      1,
    );
    await host.locator('[data-binding-id="same-id"]').locator('.applet-shortcut-edit').click();
    await dialog().getByRole('switch', { name: 'この割り当てを有効にする' }).click();
    await dialog().getByRole('button', { name: '適用', exact: true }).click();
    await save();
    await open();
    assert.equal(await row('shortcuts', 'same-id').getByText('無効', { exact: true }).count(), 0);
    checks.push('existing page edits immediately visible in the new page');
    assert.equal(await host.locator('.command-triggers-editor .command-settings-cell').count(), 0);
    await open('touchpad-gestures');
    await host.getByTestId('command-settings:fixture.triggers.one:command-triggers').click();
    await host.getByTestId('settings-page:command-triggers').waitFor();
    assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 1);
    checks.push('old list can target a command in the new list / new list omits navigation column');
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
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success: true,
          checks,
          source: portable ? path.resolve(process.argv[2]) : 'development build',
          sha256: portable ? hash(portable) : null,
          limitations: [
            'UI and durable settings only; no physical input or Windows touchpad writes',
          ],
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success: true, checks: checks.length, profile }));
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

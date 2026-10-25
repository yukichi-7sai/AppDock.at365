const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `shortcuts-ui-${Date.now()}`);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
settings.host.hardwareAcceleration = false;
for (const owner of ['a', 'b']) {
  const id = `test.${owner}`,
    directory = path.join(profile, 'extensions', id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: owner === 'a' ? 'UI A' : 'UI B — 長い名前のAppletでも列の位置を揃える確認用グループ',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      capabilities: ['storage'],
      commands: ['first', 'second', 'new'].map((command) => ({
        id: `${id}.${command}`,
        title: `${owner.toUpperCase()} ${command}`,
        ...(command === 'first' ? { aliases: [`${id}.legacy`] } : {}),
      })),
    }),
  );
  fs.writeFileSync(
    path.join(directory, 'index.js'),
    `exports.activate = async c => { let calls=0; for (const command of ['first','second','new']) c.commands.register('${id}.'+command, '${owner.toUpperCase()} '+command, async () => c.storage.set('calls', ++calls)); };`,
  );
  settings.extensions[id] = { enabled: true, settings: {} };
}
const binding = (id, command) => ({
  id,
  command,
  key: 'Ctrl+F8',
  enabled: true,
  when: { scope: 'app', appletIds: [] },
});
settings.keybindings = [
  {
    ...binding('a1', 'test.a.first'),
    key: 'Ctrl+Alt+F10',
    when: { scope: 'global', appletIds: [] },
  },
  binding('b1', 'test.b.first'),
  binding('a2', 'test.a.second'),
];
settings.gestures.bindings = [
  {
    id: 'gesture.first',
    command: 'test.a.first',
    gesture: 'move-left',
    enabled: true,
    when: { scope: 'app', appletIds: [], processes: [] },
  },
  {
    id: 'gesture.second',
    command: 'test.b.first',
    gesture: 'key:Ctrl+Shift+F12',
    enabled: true,
    when: { scope: 'app', appletIds: [], processes: [] },
  },
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : null;
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
async function until(fn, message) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
}
async function launch(testProfile = profile) {
  if (!portable)
    return electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${testProfile}`],
      env,
    });
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const child = spawn(
    portable,
    [`--test-profile=${testProfile}`, `--remote-debugging-port=${port}`],
    {
      env,
      cwd: testProfile,
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  const browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'portable CDP',
  );
  const page = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host renderer',
  );
  return {
    firstWindow: async () => page,
    close: async () => {
      await page
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
      await until(() => child.exitCode !== null, 'portable shutdown');
      await browser.close().catch(() => {});
    },
  };
}
const checks = [];
(async () => {
  let app = await launch();
  try {
    let page = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    const original = (await snapshot()).settings.value.keybindings;
    const button = (name) => page.getByRole('button', { name, exact: true });
    const command = (id) => page.locator(`.shortcuts-editor [data-shortcut-command="${id}"]`);
    const row = (id) => page.locator(`[data-binding-id="${id}"]`);
    const filter = () => page.getByLabel('ショートカットキーのコマンドを検索');
    const status = () => page.getByLabel('ショートカットキーの絞り込み', { exact: true });
    const dialog = () => page.locator('.applet-shortcut-dialog');
    const recorder = () =>
      dialog().getByRole('button', { name: 'ショートカットキーを入力', exact: true });
    const ready = async () => {
      await dialog().getByText('押して入力', { exact: true }).waitFor();
      assert(await recorder().evaluate((el) => document.activeElement === el));
    };
    const save = async () => {
      await settleSettings(page);
    };
    await button('設定').click();
    await page
      .locator('.settings-categories')
      .getByRole('button', { name: 'ショートカットキー', exact: true })
      .click();
    assert.equal(await page.locator('[data-shortcut-key], .gesture-drag-handle').count(), 0);
    assert(await command('appdock.restart').count());
    assert(await command('test.a.new').getByText('未割り当て', { exact: true }).count());
    assert(await command('test.b.new').count());
    assert.deepEqual((await snapshot()).settings.value.keybindings, original);
    await require('./shortcut-order-checks.cjs')({ page, snapshot, save, profile, checks });
    await status().selectOption('unassigned');
    assert.equal(await command('test.a.first').count(), 0);
    assert(await command('test.a.new').count());
    await status().selectOption('assigned');
    assert.equal(await command('test.a.new').count(), 0);
    assert(await command('test.a.first').count());
    await status().selectOption('all');
    await filter().fill('test.a.new');
    assert.equal(await page.locator('.shortcuts-editor [data-shortcut-command]').count(), 1);
    await command('test.a.new')
      .getByRole('button', { name: /に割り当てを追加/ })
      .click();
    await ready();
    assert.equal(await dialog().getByLabel('割り当てのいつ・どこで').inputValue(), 'owner');
    await recorder().press('Control+F7');
    await dialog().getByRole('button', { name: '追加', exact: true }).click();
    assert.equal(await filter().inputValue(), 'test.a.new');
    await save();
    await filter().fill('');
    const added = (await snapshot()).settings.value.keybindings.find(
      (r) => r.command === 'test.a.new',
    );
    assert.deepEqual(
      (await snapshot()).settings.value.keybindings.filter((r) => r.id !== added.id),
      original,
    );
    await row(added.id).locator('.applet-shortcut-edit').click();
    await ready();
    await dialog().getByLabel('割り当てのいつ・どこで').selectOption('app');
    await dialog().getByRole('button', { name: '適用', exact: true }).click();
    await save();
    const beforeEdit = (await snapshot()).settings.value.keybindings.map((r) => r.id);
    await row('a2').locator('.applet-shortcut-edit').click();
    await ready();
    await dialog().getByRole('switch', { name: 'この割り当てを有効にする' }).click();
    await dialog().getByRole('button', { name: '適用', exact: true }).click();
    await save();
    assert.deepEqual(
      (await snapshot()).settings.value.keybindings.map((r) => r.id),
      beforeEdit,
    );
    await status().selectOption('assigned');
    assert.deepEqual(
      await row('a2')
        .locator('.binding-row-actions button')
        .evaluateAll((buttons) => buttons.map((button) => button.title)),
      ['編集', 'このキーの実行順（複数のコマンド）', '削除'],
    );
    await row('a2').locator('.binding-delete').click();
    await page.getByTestId('settings-dialog-cancel').click();
    assert.equal(await row('a2').count(), 1);
    await page.getByTestId('binding-delete:a2').click();
    await page.getByTestId('settings-dialog-confirm').click();
    assert.equal(await command('test.a.second').count(), 0);
    assert(
      await page
        .locator('.shortcuts-editor .shortcut-command-list')
        .evaluate((el) => el === document.activeElement),
    );
    await status().selectOption('all');
    assert(await command('test.a.second').getByText('未割り当て', { exact: true }).count());
    await save();
    checks.push(
      'flat full catalog / host and Applet unassigned commands / search and assignment filters / direct addition / condition and disabled edit preserve order / immediate deletion keeps command',
    );
    await command('appdock.restart')
      .getByRole('button', { name: /に割り当てを追加/ })
      .click();
    await ready();
    assert.equal(await dialog().getByLabel('割り当てのいつ・どこで').inputValue(), 'app');
    assert.equal(await dialog().locator('option[value="owner"]').count(), 0);
    await recorder().press('Escape');
    assert.equal((await page.evaluate(() => window.dock.settingsEditing())).pending, false);
    await filter().fill('not-a-command-here');
    await page.getByText('表示するコマンドはありません。').waitFor();
    await button('絞り込みを解除').click();
    assert.equal(await filter().inputValue(), '');
    await page.evaluate(async () => {
      const state = await window.dock.snapshot();
      for (const [id, command, key] of [
        ['overview.extra', 'test.a.new', 'Shift+F6'],
        ['overview.alias', 'test.a.legacy', 'Ctrl+F6'],
        ['unknown', 'missing.command', 'Alt+F9'],
      ])
        state.settings.value.keybindings.push({
          id,
          command,
          key,
          enabled: false,
          when: { scope: 'owner', appletIds: [] },
        });
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    });
    await command('missing.command').waitFor();
    assert.match(await command('missing.command').innerText(), /未確認のコマンド/);
    assert.match(await command('test.a.legacy').innerText(), /互換コマンド/);
    await filter().fill('Ctrl+F7');
    assert.equal(await page.locator('.shortcuts-editor [data-shortcut-command]').count(), 1);
    assert.equal(await command('test.a.new').locator('[data-binding-id]').count(), 2);
    await filter().fill('');
    checks.push(
      'host default app scope / cancel leaves clean state / empty search and reset / unknown and bound aliases retained / key search retains all command assignments',
    );

    // Low-level hooks do not reserve keys exclusively through RegisterHotKey.
    const conflictProfile = path.join(profile, 'conflict');
    fs.mkdirSync(conflictProfile);
    const conflictSettings = require('../out/main/shared/settings-schema').createDefaultSettings();
    conflictSettings.host.notifications = false;
    conflictSettings.keybindings = [
      {
        ...binding('conflict', 'appdock.open'),
        key: 'Ctrl+Alt+F10',
        when: { scope: 'global', appletIds: [] },
      },
    ];
    fs.writeFileSync(path.join(conflictProfile, 'settings.json'), JSON.stringify(conflictSettings));
    const conflictApp = await launch(conflictProfile);
    try {
      const cp = require('./settings-aware-page.cjs').settingsAwarePage(
        await conflictApp.firstWindow(),
      );
      await cp.evaluate(() => window.dock.executeCommand('appdock.open'));
      await until(
        async () =>
          (await cp.evaluate(() => window.dock.snapshot())).globalHotKeys.some(
            (s) => s.registered && s.backend === 'hook' && !s.error,
          ),
        'second host applies shared shortcut',
      );
      await cp.getByRole('button', { name: '設定', exact: true }).click();
      await cp
        .locator('.settings-categories')
        .getByRole('button', { name: 'ショートカットキー', exact: true })
        .click();
      const cr = cp.locator('[data-binding-id="conflict"]');
      assert.equal(await cr.getByRole('alert').count(), 0);
      await cr.locator('.applet-shortcut-edit').click();
      await cp
        .locator('.applet-shortcut-dialog')
        .getByText('押して入力', { exact: true })
        .waitFor();
      await until(
        async () => !(await cp.evaluate(() => window.dock.snapshot())).globalHotKeys.length,
        'recorder suspends capture',
      );
      await cp
        .locator('.applet-shortcut-dialog')
        .getByRole('button', { name: '編集をキャンセル', exact: true })
        .click();
      await until(
        async () =>
          (await cp.evaluate(() => window.dock.snapshot())).globalHotKeys.some((s) => s.registered),
        'capture resumes after recorder',
      );
    } finally {
      await conflictApp.close();
    }
    // CDP clicks do not restore native Windows focus after the second host exits.
    await page.evaluate(() => window.dock.executeCommand('appdock.open'));
    await page.evaluate(async () => {
      const state = await window.dock.snapshot();
      state.settings.value.keybindings.find((r) => r.id === 'a1').enabled = true;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    });
    checks.push(
      'two hook hosts apply the same key without registration errors / recorder suspends and resumes capture',
    );
    await button('Applet管理').click();
    await page
      .locator('[data-applet-id="test.a"]')
      .getByRole('button', { name: 'UI Aのショートカットを開く', exact: true })
      .click();
    assert.deepEqual(
      await page
        .locator('.shortcuts-editor .shortcut-command-list')
        .first()
        .locator('[data-shortcut-command]')
        .evaluateAll((rows) => rows.map((r) => r.dataset.shortcutCommand)),
      ['test.a.first', 'test.a.second', 'test.a.new', 'test.a.legacy'],
    );
    await page.screenshot({ path: path.join(profile, 'applet-overview.png') });
    await require('./applet-shortcut-edit-checks.cjs')({
      page,
      snapshot,
      save,
      until,
      profile,
      checks,
    });
    await page.getByRole('button', { name: 'UI Aの絞り込みを解除', exact: true }).click();
    await button('設定').click();
    await page
      .locator('.settings-categories')
      .getByRole('button', { name: 'ショートカットキー', exact: true })
      .click();
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      for (const width of [1280, 900, 700]) {
        await page.setViewportSize({ width, height: 760 });
        const search = await page.locator('.command-shortcut-search').boundingBox();
        const select = await status().boundingBox();
        assert(Math.abs(search.y - select.y) < 1 && Math.abs(search.height - select.height) < 1);
        assert(search.x + search.width < select.x);
        assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
        assert(
          await page
            .locator('.applet-shortcut-overview')
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        );
        await page.screenshot({ path: path.join(profile, `${theme}-${width}-settings.png`) });
      }
    }
    checks.push(
      'settings header and catalog dark/light at 1280, 900, 700px / filters aligned / no horizontal overflow',
    );
    assert.deepEqual(errors, []);
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      const row = s.settings.value.keybindings.find((r) => r.key === 'Ctrl+F8');
      s.settings.value.keybindings.push({ ...row, id: 'final-order-fixture' });
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await page.locator('[data-binding-id="final-order-fixture"]').waitFor();
    await page.locator('[data-binding-id="final-order-fixture"] .binding-order').click();
    const orderPanel = page.locator('.shortcut-order-dialog');
    await orderPanel.getByLabel('実行順を変更するキー').selectOption('Ctrl+F8');
    const previousOrder = await orderPanel
      .locator('[data-order-binding]')
      .evaluateAll((items) => items.map((el) => el.dataset.orderBinding));
    assert(previousOrder.length > 1);
    await orderPanel
      .locator('[data-order-binding]')
      .last()
      .getByRole('button', { name: /を上へ/ })
      .click();
    await orderPanel.getByRole('button', { name: '適用', exact: true }).click();
    await save();
    assert.notDeepEqual(
      (await snapshot()).settings.value.keybindings
        .filter((r) => r.key === 'Ctrl+F8')
        .map((r) => r.id),
      previousOrder,
    );
    const persisted = (await snapshot()).settings.value.keybindings;
    await app.close();
    app = await launch();
    page = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
    await page.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
    assert.deepEqual((await snapshot()).settings.value.keybindings, persisted);
    checks.push('restart preserves all assignments and their execution order');
    const result = { ok: true, checks, ...(portable ? { sha256: hash(portable) } : {}) };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ profile, ...result }));
  } finally {
    await app.close();
  }
})().catch((error) => {
  fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
  console.error(error);
  process.exitCode = 1;
});

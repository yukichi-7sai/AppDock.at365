const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `tray-menu-ui-${Date.now()}`);
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const pause = 'appdock.gestures.togglePause';
const settings = createDefaultSettings();
settings.updates.checkHostOnAboutOpen = false;
settings.keybindings = [
  ...require('../out/main/shared/keybindings').getKeybindings(settings),
  {
    id: 'test.pause',
    command: pause,
    key: 'Ctrl+Alt+F9',
    enabled: true,
    when: { scope: 'app', appletIds: [] },
  },
];
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.trayCommands = ['a.run', 'b.run', 'missing.run', 'appdock.quit'];
for (const owner of ['a', 'b']) {
  const dir = path.join(profile, 'extensions', owner);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: owner,
      name: `Applet ${owner}`,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      capabilities: ['ui'],
      commands: [{ id: `${owner}.run`, title: `操作 ${owner}` }],
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `exports.activate=async c=>{let count=0; const show=()=>c.ui.showPanel({title:'Count',facts:[{label:'Count',value:String(count)}]});c.commands.register('${owner}.run','操作 ${owner}',async()=>{count++;await show();});await show();};`,
  );
  settings.extensions[owner] = { enabled: true, settings: {} };
}
const settingsFile = path.join(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : null;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
}
async function launch() {
  let app;
  if (!portable)
    app = await electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`],
      env,
    });
  else {
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise((r) => server.close(r));
    const child = spawn(
      portable,
      [`--test-profile=${profile}`, `--remote-debugging-port=${port}`],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
      'portable connection',
    );
    const page = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host page',
    );
    app = {
      firstWindow: async () => page,
      close: async () => {
        if (child.exitCode === null && child.signalCode === null)
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        await browser.close().catch(() => {});
      },
    };
  }
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await page.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
  if (!portable) {
    const launched = app;
    const close = launched.close.bind(launched);
    let closed = false;
    launched.close = async () => {
      if (closed) return;
      closed = true;
      // This UI fixture verifies saved-state restart, not the application's quit workflow.
      spawnSync('taskkill', ['/PID', String(launched.process().pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      void close().catch(() => {});
    };
  }
  if (app.evaluate)
    await app.evaluate(({ Tray }) => {
      const original = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function (menu) {
        globalThis.testTray = this;
        globalThis.testMenu = menu;
        return original.call(this, menu);
      };
    });
  await page.evaluate(async () => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  });
  return { app, page };
}
const checks = [];
(async () => {
  let { app, page } = await launch();
  page = await require('./settings-host-helper.cjs').settingsPage(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    const button = (name) => page.getByRole('button', { name, exact: true });
    const nav = (name) => ({
      click: async () => {
        const id = {
          一般: 'general',
          ショートカットキー: 'shortcuts',
          コマンドトリガー: 'command-triggers',
          タスクトレイ: 'tray',
        }[name];
        await page.getByTestId('settings-nav:' + id).click();
        await page.getByTestId('settings-page:' + id).waitFor();
      },
    });
    const save = async () => {
      await settleSettings(page);
    };
    const choose = async (trigger, id) => {
      await button(trigger).click();
      const palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
      await palette.getByRole('combobox').fill(id);
      await require('./shell-overlay-helper.cjs').closingAction(
        palette.locator(`[data-command-id="${id}"] .palette-execute`).click(),
      );
    };
    const select = async (id) => page.locator(`[data-tray-item="${id}"] .tray-select`).click();
    const ids = () =>
      page.locator('[data-tray-item]').evaluateAll((rows) => rows.map((r) => r.dataset.trayItem));
    const commandRow = (cmd) =>
      page
        .locator('.tray-editor-row')
        .filter({ has: page.locator('.command-id').filter({ hasText: cmd }) });
    let s = await snapshot();
    assert(s.settings.value.trayMenu);
    assert.equal(s.settings.value.trayMenu.filter((i) => i.type === 'group').length, 2);
    assert(s.settings.value.trayCommands.includes('missing.run'));
    assert(!s.settings.value.trayCommands.includes('appdock.quit'));
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByTestId('settings-index').waitFor();
    await nav('一般').click();
    assert.equal(
      await page
        .getByRole('button', { name: 'トレイクリックのコマンドを選択', exact: true })
        .count(),
      0,
    );
    await nav('ショートカットキー').click();
    assert.equal(await page.getByRole('checkbox', { name: /トレイに表示/ }).count(), 0);
    await nav('タスクトレイ').click();
    assert.equal(await commandRow('missing.run').count(), 1);
    checks.push('legacy migration, unavailable IDs retained, dedicated page and removed checkbox');
    await button('＋ グループ').click();
    await page.getByLabel('グループ名', { exact: true }).fill('日常 & 操作');
    const groupId = await page.locator('.tray-editor-row.selected').getAttribute('data-tray-item');
    await choose('＋ コマンド', 'appdock.open');
    const openId = await page.locator('.tray-editor-row.selected').getAttribute('data-tray-item');
    assert.equal(await page.getByLabel('メニュー項目の配置先').inputValue(), groupId);
    await commandRow('a.run').locator('.tray-select').click();
    await page.getByLabel('メニュー項目の配置先').selectOption(groupId);
    await commandRow('b.run').locator('.tray-select').click();
    await page.getByLabel('メニュー項目の配置先').selectOption(groupId);
    await commandRow('b.run').getByTitle('上へ移動', { exact: true }).click();
    await select(groupId);
    await button('＋ 区切り線').click();
    await page.getByLabel('メニュー項目の配置先').selectOption('');
    await select(openId);
    await page.getByLabel('メニュー項目の配置先').selectOption('');
    await save();
    const before = await ids();
    // CDP mouse dragging in an embedded WebContentsView may emit no HTML5 drag events.
    // Exercise the browser's drag handlers with one shared DataTransfer; keyboard and
    // reorder buttons above still use normal UI input.
    const dragPage = await require('./settings-host-helper.cjs').settingsPage(page);
    const dataTransfer = await dragPage.evaluateHandle(() => new DataTransfer());
    const sourceRow = dragPage.locator(`[data-tray-item="${openId}"] .tray-drag`);
    const targetRow = dragPage.locator('[data-tray-item]').first();
    await sourceRow.dispatchEvent('dragstart', { dataTransfer });
    await targetRow.dispatchEvent('dragover', { dataTransfer });
    await targetRow.dispatchEvent('drop', { dataTransfer });
    await sourceRow.dispatchEvent('dragend', { dataTransfer });
    await dataTransfer.dispose();
    await until(
      async () => JSON.stringify(await ids()) !== JSON.stringify(before),
      'drag order saved',
    );
    await nav('一般').click();
    await nav('タスクトレイ').click();
    assert.equal(
      await page.locator('[data-tray-item]').filter({ hasText: '日常 & 操作' }).count(),
      1,
    );
    await save();
    s = await snapshot();
    assert.equal(
      s.settings.value.trayMenu
        .find((i) => i.id === groupId)
        .children.filter((i) => i.type === 'command').length,
      2,
    );
    checks.push(
      'custom group, mixed Applets, add separator, place, reorder, drag, navigation retains saved edits',
    );
    await select(groupId);
    await page.getByLabel('グループ名', { exact: true }).fill('');
    await page.getByLabel('グループ名', { exact: true }).press('Tab');
    await settleSettings(page);
    await page.getByRole('alert').first().waitFor();
    await page.getByLabel('グループ名', { exact: true }).fill('日常 & 操作');
    await save();
    await button('＋ コマンド').click();
    const addPalette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await addPalette.getByRole('combobox').fill('appdock.quit');
    assert.equal(await addPalette.locator('[data-command-id="appdock.quit"]').count(), 0);
    await require('./shell-overlay-helper.cjs').closingAction(addPalette.keyboard.press('Escape'));
    await choose('トレイクリックのコマンドを選択', 'a.run');
    await choose('トレイダブルクリックのコマンドを選択', 'b.run');
    assert.equal(await page.locator('.tray-click-controls .command-id').count(), 0);
    await save();
    if (app.evaluate) {
      const native = () =>
        app.evaluate(() => {
          const walk = (menu) =>
            menu.items.map((i) => ({
              label: i.label,
              type: i.type,
              enabled: i.enabled,
              checked: i.checked,
              children: i.submenu ? walk(i.submenu) : undefined,
            }));
          return walk(globalThis.testMenu);
        });
      let menu = await native();
      assert.deepEqual(
        menu.slice(-2).map((i) => i.label),
        ['設定…', '終了'],
      );
      assert.equal(menu.filter((i) => i.label === '終了').length, 1);
      const group = menu.find((i) => i.label === '日常 && 操作');
      assert.deepEqual(
        group.children.map((i) => i.label),
        ['操作 b', '操作 a'],
      );
      await app.evaluate(() =>
        globalThis.testMenu.items.find((i) => i.label === '日常 && 操作').submenu.items[0].click(),
      );
      await page.waitForFunction(
        async () =>
          (await window.dock.snapshot()).extensions.find((e) => e.id === 'b').panel.facts[0]
            .value === '1',
      );
      await app.evaluate(() => {
        globalThis.testTray.emit('click');
        globalThis.testTray.emit('double-click');
      });
      await page.waitForFunction(
        async () =>
          (await window.dock.snapshot()).extensions.find((e) => e.id === 'b').panel.facts[0]
            .value === '2',
      );
      await page.waitForTimeout(1000);
      assert.equal(
        (await snapshot()).extensions.find((e) => e.id === 'a').panel.facts[0].value,
        '0',
      );
      await app.evaluate(() => globalThis.testTray.emit('click'));
      await page.waitForFunction(
        async () =>
          (await window.dock.snapshot()).extensions.find((e) => e.id === 'a').panel.facts[0]
            .value === '1',
      );
      await page.evaluate((id) => window.dock.executeCommand(id), pause);
      menu = await native();
      assert.equal(menu.find((i) => i.type === 'checkbox').checked, true);
      await app.evaluate(() =>
        globalThis.testMenu.items.find((i) => i.type === 'checkbox').click(),
      );
      assert.equal((await native()).find((i) => i.type === 'checkbox').checked, false);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
      await page.keyboard.press('Control+Alt+F9');
      await until(
        async () => (await native()).find((i) => i.type === 'checkbox').checked,
        'pause keyboard command',
      );
      await page.keyboard.press('Control+Alt+F9');
      await until(
        async () => !(await native()).find((i) => i.type === 'checkbox').checked,
        'resume keyboard command',
      );
      checks.push(
        'native menu layout, fixed footer, callbacks, single/double dispatch, pause IPC/menu/keyboard command and checked state',
      );
    }
    // The registered host command must be selectable in keyboard bindings too.
    await nav('コマンドトリガー').click();
    assert.equal(await page.getByTestId(`binding-command-summary:${pause}`).count(), 1);
    assert.equal(await page.getByTestId(`binding-add:${pause}:shortcuts`).count(), 1);
    await nav('タスクトレイ').click();
    await choose('トレイクリックのコマンドを選択', 'appdock.open');
    await button('未設定に戻す').click();
    await save();
    await select(groupId);
    await page
      .locator(`[data-tray-item="${groupId}"]`)
      .getByTitle('グループを解除', { exact: true })
      .click();
    await page.getByTestId('settings-dialog-cancel').click();
    assert.equal(await page.locator(`[data-tray-item="${groupId}"]`).count(), 1);
    await page.getByTestId(`tray-remove:${groupId}`).click();
    await page.getByTestId('settings-dialog-confirm').click();
    assert.equal(await commandRow('a.run').count(), 1);
    assert.equal(await commandRow('b.run').count(), 1);
    // Confirmed ungrouping is saved immediately; no shared discard state exists.
    await settleSettings(page);
    assert.equal(await page.locator(`[data-tray-item="${groupId}"]`).count(), 0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, theme);
      for (const width of [1280, 1000, 900]) {
        if (app.evaluate)
          await app.evaluate(
            ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900),
            width,
          );
        else await page.setViewportSize({ width, height: 900 });
        await page.locator('.settings-body').evaluate((el) => {
          el.scrollTop = 0;
        });
        await page.waitForTimeout(100);
        assert(
          await page
            .locator('.settings-body')
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        assert(
          await page
            .locator('.tray-select')
            .first()
            .evaluate((el) => getComputedStyle(el).alignItems === 'center'),
        );
        const layout = await page.locator('.tray-editor-row').evaluateAll((rows) =>
          rows.map((row) => {
            const box = row.getBoundingClientRect();
            const labels = [
              ...row.querySelectorAll('.tray-select > span, .tray-select > small'),
            ].map((e) => {
              const r = e.getBoundingClientRect(),
                s = getComputedStyle(e);
              return { y: r.y, height: r.height, whiteSpace: s.whiteSpace };
            });
            return { height: box.height, border: getComputedStyle(row).borderTopWidth, labels };
          }),
        );
        for (const row of layout) {
          assert.equal(row.border, '0px');
          assert(row.height >= 36 && row.height <= 44);
          for (const label of row.labels) assert.equal(label.whiteSpace, 'nowrap');
          if (row.labels.length === 2)
            assert(
              Math.abs(
                row.labels[0].y +
                  row.labels[0].height / 2 -
                  row.labels[1].y -
                  row.labels[1].height / 2,
              ) < 2,
            );
        }
        assert(
          await page
            .locator('.tray-group-children')
            .evaluateAll((groups) =>
              groups.every((group) => parseFloat(getComputedStyle(group).borderLeftWidth) > 0),
            ),
        );
        assert.equal(await page.locator('.settings-categories > h2').count(), 0);
        const index = await page.locator('.settings-categories').evaluate((e) => {
          const search = e.querySelector('.settings-search'),
            list = e.querySelector('.sidebar-extensions'),
            r = e.getBoundingClientRect(),
            s = search.getBoundingClientRect(),
            l = list.getBoundingClientRect();
          return { above: s.y - r.y, below: l.y - s.bottom };
        });
        assert(Math.abs(index.above - index.below) <= 1, JSON.stringify(index));
        await page.screenshot({ path: path.join(profile, `${theme}-${width}.png`) });
      }
    }
    checks.push(
      'group dissolve preserves children, immediate ungrouping persists, two themes at three widths',
    );
    const expected = (await snapshot()).settings.value.trayMenu;
    await app.close();
    ({ app, page } = await launch());
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByTestId('settings-index').waitFor();
    await nav('タスクトレイ').click();
    assert.deepEqual((await snapshot()).settings.value.trayMenu, expected);
    await page.evaluate(() => window.dock.toggleExtension('a', false));
    await until(
      async () => (await snapshot()).extensions.find((e) => e.id === 'a').state === 'stopped',
      'disabled',
    );
    await until(
      async () => /現在利用できません/.test(await commandRow('a.run').textContent()),
      'disabled command rendered',
    );
    if (app.evaluate) {
      await choose('トレイクリックのコマンドを選択', 'a.run');
      await save();
      await app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().startsWith('appdock://host/'),
        );
        if (!main) throw Error('Host window not found');
        main.hide();
        globalThis.testTray.emit('click');
      });
      await until(async () => (await snapshot()).windowVisible, 'unavailable click opens host');
      assert(
        (await snapshot()).logs.some((entry) => entry.source === 'tray' && entry.level === 'error'),
      );
    }
    // Clear using the editor, including the former fixed pause item; it stays cleared across restart.
    while (await page.locator('[data-tray-item]').count()) {
      await page.locator('[data-tray-item] .tray-select').first().click();
      const selectedRow = page.locator('.tray-editor-row.selected');
      const dissolve = selectedRow.getByTitle('グループを解除', { exact: true });
      if (await dissolve.count()) await dissolve.click();
      else await selectedRow.getByTitle('メニューから外す', { exact: true }).click();
      await page.getByTestId('settings-dialog-confirm').click();
    }
    await save();
    assert.deepEqual((await snapshot()).settings.value.trayMenu, []);
    if (app.evaluate)
      assert.deepEqual(await app.evaluate(() => globalThis.testMenu.items.map((i) => i.label)), [
        '設定…',
        '終了',
      ]);
    await app.close();
    ({ app, page } = await launch());
    assert.deepEqual((await snapshot()).settings.value.trayMenu, []);
    checks.push(
      'restart persistence, disabled commands retained, empty layout persists and only fixed footer remains',
    );
    assert.deepEqual(errors, []);
    const result = {
      ok: true,
      profile,
      portable: !!portable,
      hash: portable ? hash(portable) : null,
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    const settingsPage = await require('./settings-host-helper.cjs')
      .settingsPage(page)
      .catch(() => page);
    await settingsPage.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

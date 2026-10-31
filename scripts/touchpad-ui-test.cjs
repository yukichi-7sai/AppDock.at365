const { chromium } = require('playwright'),
  { spawn } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'touchpad-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.notifications = false;
settings.host.hardwareAcceleration = false;
settings.gestures.enabled = false;
settings.keybindings = [
  {
    id: 'normal-f13',
    key: 'F13',
    command: 'appdock.open',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
  {
    id: 'normal-f18',
    key: 'F18',
    command: 'appdock.open',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
];
settings.notificationPreferences = {
  overrides: [
    {
      ownerKind: 'host',
      ownerId: 'errors',
      typeId: 'operation-failed',
      targets: ['banner'],
      durationSeconds: null,
    },
  ],
};
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const portable = !!process.argv[2],
  executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron'),
  hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let expectedHash;
if (portable) {
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  expectedHash = hash(executable);
  assert.equal(expectedHash, hash(path.resolve(process.argv[2])));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(label);
}
let browser,
  child,
  host,
  output = '';
const checks = [];
(async () => {
  try {
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise((r) => server.close(r));
    child = spawn(
      executable,
      [...(portable ? [] : [root]), `--test-profile=${profile}`, `--remote-debugging-port=${port}`],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    await until(async () => {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        return true;
      } catch {
        return false;
      }
    }, 'browser');
    await until(async () => {
      for (const p of browser.contexts()[0].pages())
        if (await p.evaluate(() => !!window.dock).catch(() => false)) {
          host = p;
          return true;
        }
      return false;
    }, 'host');
    await until(
      async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
      'startup',
    );
    await host.evaluate(() =>
      window.dock.executeCommand('appdock.settings.touchpad-gestures.open'),
    );
    const p = require('./settings-aware-page.cjs').settingsAwarePage(host);
    await p.getByTestId('touchpad-options').locator(':scope > summary').click();
    await p.getByRole('switch', { name: 'タッチパッドジェスチャーを使う', exact: true }).waitFor();
    const nav = await host
      .locator('.settings-categories [aria-label="本体の設定"] > button')
      .evaluateAll((rows) =>
        rows.map((row) => ({
          text: row.innerText.trim(),
          icon: !!row.querySelector('svg'),
          first: row.firstElementChild?.className,
        })),
      );
    const index = nav.findIndex((row) => row.text === 'マウスジェスチャー');
    assert.equal(nav[index + 1].text, 'タッチパッドジェスチャー');
    assert.ok(nav[index + 1].icon);
    assert.ok(nav.every((row) => row.first === 'settings-index-icon'));
    checks.push('navigation order and leading aligned icons');
    // Only toggle with no assignments: this test never writes Windows settings.
    await p.getByRole('switch', { name: 'タッチパッドジェスチャーを使う', exact: true }).click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.enabled,
      'ON',
    );
    await p.getByRole('switch', { name: 'タッチパッドジェスチャーを使う', exact: true }).click();
    await until(
      async () =>
        !(await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures
          .enabled,
      'OFF',
    );
    checks.push('device ON/OFF without assigned gestures');
    await p.getByRole('searchbox', { name: 'ジェスチャーのコマンドを検索' }).fill('appdock.open');
    await p.getByRole('searchbox', { name: 'ジェスチャーのコマンドを検索' }).press('Enter');
    const command = p.locator('[data-shortcut-command="appdock.open"]');
    await command.locator('.applet-shortcut-add').click();
    const dialog = p.getByRole('dialog');
    assert.equal(
      await dialog
        .getByRole('combobox', { name: 'ジェスチャーの操作', exact: true })
        .locator('option')
        .count(),
      10,
    );
    await dialog
      .getByRole('combobox', { name: 'ジェスチャーの操作', exact: true })
      .selectOption('four.tap');
    const beforeConflict = (await host.evaluate(() => window.dock.snapshot())).settings;
    await dialog.getByRole('button', { name: '追加', exact: true }).click();
    let errorSurface, errorItem;
    await until(async () => {
      for (const surface of browser
        .contexts()
        .flatMap((context) => context.pages())
        .filter((page) => page.url().endsWith('/shells/default/notifications.html'))) {
        const model = await surface.evaluate(() => window.appdockNotifications.connect());
        const matches = model.snapshot.items.filter(
          (item) => item.ownerId === 'errors' && item.body.includes('TOUCHPAD_KEY_CONFLICT'),
        );
        if (!matches.length) continue;
        assert.equal(matches.length, 1);
        errorSurface = surface;
        errorItem = matches[0];
        return true;
      }
      return false;
    }, 'conflict error banner');
    assert.match(errorItem.body, /「F18」/);
    assert.match(errorItem.body, /接続用キー設定/);
    await errorSurface
      .getByText('接続用キーの重複で設定を保存できませんでした', { exact: true })
      .waitFor();
    await errorSurface.screenshot({ path: path.join(profile, 'touchpad-key-conflict.png') });
    const rejected = (await host.evaluate(() => window.dock.snapshot())).settings;
    assert.equal(rejected.revision, beforeConflict.revision);
    assert.deepEqual(rejected.value, beforeConflict.value);
    await until(
      async () => (await command.innerText()).includes('未割り当て'),
      'rejected row restored without navigating',
    );
    assert.equal(await command.locator('[data-binding-id]').count(), 0);
    await host.screenshot({ path: path.join(profile, 'touchpad-rejected-unassigned.png') });
    await errorSurface.evaluate(
      (item) =>
        window.appdockNotifications.act({
          notificationId: item.id,
          revision: item.revision,
          requestId: crypto.randomUUID(),
          type: 'dismiss',
        }),
      errorItem,
    );
    const connections = p.getByTestId('touchpad-connection');
    assert.equal(await connections.getAttribute('open'), null);
    await connections.locator(':scope > summary').click();
    const options = p.getByTestId('touchpad-options');
    assert.equal(
      await connections.evaluate((e) => e.previousElementSibling?.dataset.testid),
      'touchpad-options',
    );
    assert.equal(
      await connections.locator('..').evaluate((e) => e.tagName),
      await options.locator('..').evaluate((e) => e.tagName),
    );
    assert.equal(
      await connections.getByTestId('touchpad-windows-settings').getByRole('button').count(),
      1,
    );
    const connectionKey = p.getByRole('combobox', {
      name: '4本指: タップの接続用キー',
      exact: true,
    });
    assert.equal(await connectionKey.locator('option').count(), 12);
    assert.equal(await connections.getByRole('checkbox').count(), 40);
    const beforeDuplicate = (await host.evaluate(() => window.dock.snapshot())).settings;
    await connectionKey.selectOption('F14');
    await p
      .locator('.settings-error-summary')
      .filter({ hasText: '別のタッチパッドジェスチャーと接続用キーが重複しています。' })
      .waitFor();
    assert.equal(await connectionKey.inputValue(), 'F18');
    assert.deepEqual((await host.evaluate(() => window.dock.snapshot())).settings, beforeDuplicate);
    await connectionKey.selectOption('F23');
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures
          .connections['four.tap'].key === 'F23',
      'corrected connection key',
    );
    await connections.locator('summary').click();
    // Correcting another setting must not silently save the rejected assignment.
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.bindings
        .length,
      0,
    );
    assert.match(await command.innerText(), /未割り当て/);
    await command.locator('.applet-shortcut-add').click();
    await dialog
      .getByRole('combobox', { name: 'ジェスチャーの操作', exact: true })
      .selectOption('four.tap');
    await dialog.getByRole('button', { name: '追加', exact: true }).click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.bindings
          .length === 1,
      'binding persisted',
    );
    assert.deepEqual(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.keybindings,
      beforeConflict.value.keybindings,
    );
    checks.push(
      'key collision displays common error banner, restores unassigned row immediately, and does not save rejected binding with later edits',
    );
    checks.push('shared row dialog ten gestures and immediate save');
    const beforeEditConflict = (await host.evaluate(() => window.dock.snapshot())).settings;
    await command.locator('.applet-shortcut-edit').click();
    await dialog
      .getByRole('combobox', { name: 'ジェスチャーの操作', exact: true })
      .selectOption('three.tap');
    // F13 is also occupied, so an edit must restore the previous four-finger row.
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await until(async () => {
      const m = await errorSurface.evaluate(() => window.appdockNotifications.connect());
      return m.snapshot.items.some(
        (item) => item.ownerId === 'errors' && item.body.includes('「F13」'),
      );
    }, 'edit conflict banner');
    await until(
      async () => (await command.locator('kbd').innerText()) === '4本指: タップ',
      'existing row restored after failed edit',
    );
    assert.deepEqual(
      (await host.evaluate(() => window.dock.snapshot())).settings,
      beforeEditConflict,
    );
    checks.push('failed edit keeps the previously saved assignment');
    await command.locator('.binding-order').click();
    await p.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push('touchpad order dialog');
    await connections.locator('summary').click();
    await connectionKey.selectOption('F24');
    await p.getByRole('checkbox', { name: '4本指: タップのCtrl', exact: true }).check();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures
          .connections['four.tap'].key === 'F24' &&
        (
          await host.evaluate(() => window.dock.snapshot())
        ).settings.value.touchpadGestures.connections['four.tap'].modifiers.includes('Ctrl'),
      'chord persisted',
    );
    for (const modifier of ['Alt', 'Shift', 'Win']) {
      const checkbox = p.getByRole('checkbox', { name: `4本指: タップの${modifier}`, exact: true });
      await checkbox.check();
      await until(
        async () =>
          (
            await host.evaluate(() => window.dock.snapshot())
          ).settings.value.touchpadGestures.connections['four.tap'].modifiers.includes(modifier),
        `${modifier} saved`,
      );
      await checkbox.uncheck();
      await until(
        async () =>
          !(
            await host.evaluate(() => window.dock.snapshot())
          ).settings.value.touchpadGestures.connections['four.tap'].modifiers.includes(modifier),
        `${modifier} cleared`,
      );
    }
    const inline = p.getByRole('group', { name: '4本指: タップの接続用キー設定', exact: true });
    const boxes = await inline.locator('select, label').evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y + r.height / 2, right: r.right };
      }),
    );
    assert.ok(
      boxes.every((box) => Math.abs(box.y - boxes[0].y) < 2),
      'key and labeled modifiers align horizontally',
    );
    assert.equal(await p.getByRole('dialog').count(), 0);
    checks.push(
      'top-level collapsed connection section, inline F13-F24 and four labeled checkboxes, immediate save',
    );
    await host.screenshot({ path: path.join(profile, 'touchpad-connections.png') });
    for (const [theme, width] of [
      ['light', 940],
      ['dark', 940],
      ['dark', 760],
    ]) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, theme);
      await host.setViewportSize({ width, height: 900 });
      await inline.scrollIntoViewIfNeeded();
      await wait(150);
      const layout = await inline.evaluate((element) => {
        const rows = Array.from(element.children).map((child) => child.getBoundingClientRect());
        const body = element.closest('.settings-body');
        return {
          centers: rows.map((r) => r.y + r.height / 2),
          overflow: body.scrollWidth - body.clientWidth,
        };
      });
      assert.ok(
        layout.centers.every((center) => Math.abs(center - layout.centers[0]) < 2),
        `inline controls at ${width}`,
      );
      assert.ok(layout.overflow <= 2);
      await host.screenshot({
        path: path.join(profile, `touchpad-connections-${theme}-${width}.png`),
      });
    }
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'light';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    checks.push('inline connection layout in light/dark at 940px and dark at 760px');
    await connections.locator('summary').click();
    await host.locator('.settings-body').evaluate((element) => {
      element.scrollTop = 0;
    });
    const iconLayout = await host
      .locator('.settings-index-icon')
      .first()
      .evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        grow: getComputedStyle(element).flexGrow,
      }));
    assert.equal(iconLayout.grow, '0');
    assert.ok(iconLayout.width <= 24);
    await host.screenshot({ path: path.join(profile, 'touchpad-light.png') });
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await wait(300);
    await host.screenshot({ path: path.join(profile, 'touchpad-dark.png') });
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.shortcuts.open'));
    const owned = p.locator('[data-binding-id^="touchpad:"]');
    await owned.waitFor();
    assert.equal(
      await owned.locator('.binding-delete,.applet-shortcut-edit,.binding-order').count(),
      0,
    );
    assert.match(await owned.innerText(), /Ctrl\+F24/);
    checks.push('owned shortcuts cannot edit delete or reorder');
    await host.evaluate(() =>
      window.dock.executeCommand('appdock.settings.touchpad-gestures.open'),
    );
    await p.getByRole('searchbox', { name: 'ジェスチャーのコマンドを検索' }).fill('appdock.open');
    await p.getByRole('searchbox', { name: 'ジェスチャーのコマンドを検索' }).press('Enter');
    await p.locator('[data-shortcut-command="appdock.open"] .binding-delete').click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.bindings
          .length === 0,
      'last removal',
    );
    checks.push('last assignment removes projection without Windows write');
    // Generic config import is read-only toward Windows, even when this PC is enabled.
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.touchpadGestures.enabled = true;
      s.settings.value.touchpadGestures.connections['three.tap'] = { key: 'F23', modifiers: [] };
      s.settings.value.touchpadGestures.bindings = ['three.tap', 'four.tap'].map((gesture, i) => ({
        id: 'warning-' + i,
        command: 'appdock.open',
        gesture,
        enabled: true,
        when: { scope: 'global', appletIds: [], processes: [] },
      }));
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await p
      .getByRole('button', { name: 'Windowsの設定を再設定する', exact: true })
      .first()
      .waitFor();
    await p
      .getByRole('group', { name: '3本指: タップ', exact: true })
      .getByRole('button', { name: 'AppDockでの制御をしない', exact: true })
      .click();
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.bindings
        .length,
      2,
    );
    await host.setViewportSize({ width: 940, height: 780 });
    await wait(400);
    await host.locator('.settings-body').evaluate((element) => {
      element.scrollTop = 0;
    });
    await host.screenshot({ path: path.join(profile, 'touchpad-narrow-warning.png') });
    const overflow = await host
      .locator('.settings-body')
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    assert.ok(overflow <= 2, 'settings body should not overflow horizontally');
    await p
      .getByRole('group', { name: '3本指: タップ', exact: true })
      .getByRole('button', { name: 'このジェスチャーの割り当てを全部解除する', exact: true })
      .click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.bindings
          .length === 1,
      'per gesture clear',
    );
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures
        .bindings[0].gesture,
      'four.tap',
    );
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.touchpadGestures.enabled = false;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    checks.push('unconnected warning, ignore and per-gesture clear; narrow layout');
    const snap = await host.evaluate(() => window.dock.snapshot());
    assert.equal(snap.settings.value.touchpadGestures.enabled, false);
    assert.equal(fs.existsSync(path.join(profile, 'touchpad-bridge-state.json')), false);
    if (portable) assert.equal(hash(executable), expectedHash);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          checks,
          version: snap.version,
          portableHash: expectedHash,
          noWindowsWrites: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (error) {
    if (host) {
      await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      fs.writeFileSync(
        path.join(profile, 'failure-dom.txt'),
        await host
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    throw error;
  } finally {
    if (host)
      await host
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'exit').catch(() => child.kill());
    await browser?.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'output.log'), output);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

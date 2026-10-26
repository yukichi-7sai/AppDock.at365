const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { newAiConnection } = require('../out/main/shared/ai');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-order-ui-${Date.now()}`);
const local = path.join(profile, 'local');
fs.mkdirSync(local, { recursive: true });
const initial = createDefaultSettings();
Object.assign(initial.host, {
  hardwareAcceleration: false,
  closeToTray: false,
  soundEnabled: false,
  notifications: false,
});
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
initial.keybindings = [];
initial.globalShortcutCommands = [];
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
const appletIds = ['fixture.order.a', 'fixture.order.b', 'fixture.order.c'];
for (const id of appletIds) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
    }),
  );
  fs.writeFileSync(path.join(folder, 'index.cjs'), 'exports.activate = async () => {};');
  initial.extensions[id] = { enabled: false, settings: {} };
}
initial.appletOrder = [...appletIds];
initial.ai.connections = Array.from({ length: 3 }, (_, i) => ({
  ...newAiConnection(`order-${i}`),
  name: `AI server ${i + 1}`,
  baseUrl: `http://127.0.0.1:1/order-${i}`,
}));
initial.ai.defaultConnectionId = initial.ai.connections[0].id;
initial.mcpServers = {
  version: 1,
  items: Array.from({ length: 18 }, (_, index) => ({
    id: randomUUID(),
    name: `MCP ${index + 1}`,
    description: '',
  })),
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = process.argv[2] && path.resolve(process.argv[2]);
const portable = source && path.join(profile, 'AppDock.at365.exe');
if (portable) {
  require('./copy-host.cjs').copyHost(source, portable);
  assert.equal(hash(portable), hash(source));
}
const checks = [],
  errors = [];
let application, browser, child, host;
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label);
}
async function start() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [`--test-profile=${profile}`, `--test-local-state=${local}`];
  if (portable) {
    const port = await freePort();
    child = spawn(portable, [...args, `--remote-debugging-port=${port}`], {
      cwd: profile,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
    await until(async () => {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      return browser;
    }, 'portable CDP');
  } else {
    application = await electron.launch({
      executablePath: require('electron'),
      args: [root, ...args],
      env,
    });
  }
  await until(() => {
    host = (browser ? browser.contexts().flatMap((c) => c.pages()) : application.windows()).find(
      (p) => p.url().startsWith('appdock://host/'),
    );
    return host;
  }, 'host window');
  host.setDefaultTimeout(15000);
  host.on('pageerror', (error) => errors.push(error.message));
  await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
  await host.setViewportSize({ width: 1000, height: 700 });
}
async function stop() {
  if (host)
    await host
      .evaluate(() => {
        void window.dock.executeCommand('appdock.quit');
      })
      .catch(() => {});
  if (application) {
    await application.close();
    application = undefined;
  }
  if (child) await until(() => child.exitCode !== null, 'portable shutdown');
  if (browser) {
    await browser.close();
    browser = undefined;
  }
  host = undefined;
}
const saved = async () => (await host.evaluate(() => window.dock.snapshot())).settings.value;
const cases = [
  {
    page: 'applets',
    button: 'Appletを並べ替え',
    ids: appletIds,
    values: (s) => s.appletOrder.filter((id) => appletIds.includes(id)),
  },
  {
    page: 'ai',
    button: 'AIサーバーを並べ替え',
    ids: initial.ai.connections.map((c) => c.id),
    values: (s) => s.ai.connections.map((c) => c.id),
  },
  {
    page: 'mcp-client',
    button: 'MCP接続先を並べ替え',
    ids: initial.mcpServers.items.map((c) => c.id),
    values: (s) => s.mcpServers.items.map((c) => c.id),
  },
];
async function open(target) {
  await host.evaluate(
    (page) => window.dock.executeCommand(`appdock.settings.${page}.open`),
    target.page,
  );
  await host.getByTestId(`settings-page:${target.page}`).waitFor();
  await host.getByRole('button', { name: target.button, exact: true }).click();
  await host.locator('.settings-order-dialog').waitFor();
}
(async () => {
  try {
    await start();
    for (const target of cases) {
      await open(target);
      const dialog = host.locator('.settings-order-dialog');
      const order = () =>
        dialog
          .locator('[data-order-id]')
          .evaluateAll((rows) => rows.map((row) => row.dataset.orderId));
      const handle = (id) => dialog.getByTestId(`settings-order-handle:${id}`);
      const first = target.ids[0],
        last = target.ids.at(-1);
      const before = await saved();
      assert.deepEqual(await order(), target.ids);
      assert.equal(await dialog.locator('.shortcut-order-moves').count(), 0);
      assert.equal(await dialog.locator('.shortcut-order-row button').count(), target.ids.length);
      assert.equal(await handle(first).getAttribute('aria-keyshortcuts'), 'ArrowUp ArrowDown');
      assert.match(await handle(first).getAttribute('title'), /フォーカスして↑↓キー/);
      await handle(first).press('ArrowUp');
      assert.deepEqual(await order(), target.ids);
      await handle(last).press('ArrowDown');
      assert.deepEqual(await order(), target.ids);
      for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
        await handle(first).dispatchEvent('keydown', { key: 'ArrowDown', [modifier]: true });
        assert.deepEqual(await order(), target.ids);
      }
      for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
        await handle(first).dispatchEvent('keydown', { key: 'ArrowDown', ...composition });
        assert.deepEqual(await order(), target.ids);
      }
      await handle(first).press('ArrowDown');
      const moved = [target.ids[1], first, ...target.ids.slice(2)];
      assert.deepEqual(await order(), moved);
      assert(await handle(first).evaluate((el) => el === document.activeElement));
      await host.keyboard.press('ArrowDown');
      assert.equal((await order())[2], first);
      await host.keyboard.press('ArrowUp');
      assert.deepEqual(await order(), moved);
      await dialog.getByTestId('settings-dialog-confirm').focus();
      await host.keyboard.press('ArrowDown');
      assert.deepEqual(await order(), moved, 'arrows outside a handle do not reorder');
      assert.deepEqual(target.values(await saved()), target.values(before));
      await dialog.getByTestId('settings-dialog-cancel').click();
      assert(
        await host
          .getByRole('button', { name: target.button, exact: true })
          .evaluate((el) => el === document.activeElement),
      );
      await open(target);
      assert.deepEqual(await order(), target.ids);
      await handle(first).press('ArrowDown');
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      await settleSettings(host);
      assert.deepEqual(target.values(await saved()), moved);
      await open(target);
      assert.deepEqual(await order(), moved);
      await handle(first).dragTo(dialog.locator(`[data-order-id="${target.ids[1]}"]`));
      assert.deepEqual(await order(), target.ids, 'dragging still works');
      await dialog.screenshot({ path: path.join(profile, `${target.page}-light.png`) });
      await dialog.getByTestId('settings-dialog-cancel').click();
      assert.deepEqual(target.values(await saved()), moved);
      checks.push(
        `${target.page}: button removal, plain arrows, retained focus, bounds/modifier/IME guards, drag, cancel, save and reopen`,
      );
    }
    await host.setViewportSize({ width: 480, height: 540 });
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await settleSettings(host);
    await open(cases[2]);
    const dialog = host.locator('.settings-order-dialog');
    const first = dialog.locator('.shortcut-order-handle').first();
    const movedId = await first.getAttribute('data-testid');
    await first.focus();
    for (let i = 0; i < 14; i++) await host.keyboard.press('ArrowDown');
    const handle = dialog.getByTestId(movedId);
    assert(await handle.evaluate((el) => el === document.activeElement));
    assert.equal(
      await dialog.locator('[data-order-id]').nth(14).getAttribute('data-order-id'),
      movedId.replace('settings-order-handle:', ''),
    );
    assert(
      await handle.evaluate((el) => {
        const rect = el.getBoundingClientRect(),
          body = el.closest('.shortcut-order-list').getBoundingClientRect();
        return (
          rect.top >= body.top + 3 && rect.bottom <= body.bottom - 3 && rect.bottom <= innerHeight
        );
      }),
      'moved handle remains visible in a long narrow list',
    );
    await dialog.screenshot({ path: path.join(profile, 'mcp-dark-narrow.png') });
    await dialog.getByTestId('settings-dialog-cancel').click();
    checks.push(
      'long list: 14 repeated moves retain focus and scroll into view at narrow dark layout',
    );
    const durable = await saved();
    assert.equal(durable.ai.defaultConnectionId, initial.ai.defaultConnectionId);
    assert.deepEqual(
      durable.ai.connections.map((c) => c.id).sort(),
      initial.ai.connections.map((c) => c.id).sort(),
    );
    await stop();
    await start();
    for (const target of cases) {
      assert.deepEqual(target.values(await saved()), target.values(durable));
      await open(target);
      assert.deepEqual(
        await host
          .locator('.settings-order-dialog [data-order-id]')
          .evaluateAll((rows) => rows.map((row) => row.dataset.orderId)),
        target.values(durable),
      );
      await host.getByTestId('settings-dialog-cancel').click();
    }
    checks.push('all three saved orders survive a real restart; AI default selection preserved');
    assert.deepEqual(errors, []);
    await stop();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success: true,
          checks,
          source: source || 'development',
          sha256: portable ? hash(portable) : null,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success: true, checks: checks.length, profile }));
  } catch (error) {
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success: false, checks, error: String(error.stack) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await stop();
  }
})();

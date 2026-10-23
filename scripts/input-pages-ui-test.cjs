const fs = require('node:fs'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `input-pages-ui-${Date.now()}`);
const fixture = path.join(profile, 'extensions/test.input-pages');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.input-pages',
    name: 'ページ検証',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['storage', 'pages'],
    commands: [
      ...['history', 'details'].map((id) => ({
        id: 'test.input-pages.open.' + id,
        title: 'Open ' + id,
        activateOnExecute: true,
      })),
      ...['all', 'picked'].map((id) => ({ id: 'test.input-pages.' + id, title: '記録 ' + id })),
    ],
    pages: [
      {
        id: 'history',
        title: '壁紙履歴',
        source: 'local',
        ui: 'history.html',
        openCommand: 'test.input-pages.open.history',
      },
      {
        id: 'details',
        title: '別ページ',
        source: 'local',
        ui: 'details.html',
        openCommand: 'test.input-pages.open.details',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async c=>{let calls=[];for(const id of ['history','details'])c.commands.register('test.input-pages.open.'+id,'Open '+id,()=>c.pages.open(id));for(const id of ['all','picked'])c.commands.register('test.input-pages.'+id,'記録 '+id,async()=>{calls.push(id);await c.storage.set('calls',calls);});};`,
);
for (const id of ['history', 'details'])
  fs.writeFileSync(path.join(fixture, id + '.html'), `<h1>${id}</h1><input aria-label="Text">`);
const background = path.join(profile, 'extensions/test.background');
fs.mkdirSync(background, { recursive: true });
fs.writeFileSync(
  path.join(background, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.background',
    name: '画面なし検証',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
  }),
);
fs.writeFileSync(path.join(background, 'index.cjs'), 'exports.activate=async()=>{};');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.globalShortcutCommands = [];
settings.extensions['test.input-pages'] = { enabled: true, settings: {} };
settings.extensions['test.background'] = { enabled: true, settings: {} };
const hostRoutes = ['image-library', 'settings', 'logs', 'notifications'];
const selected = [...hostRoutes.map((route) => 'host:' + route), 'page:test.input-pages:history'];
const binding = (id, command, scope, appletIds = []) => ({
  id,
  command: 'test.input-pages.' + command,
  key: 'Ctrl+F12',
  enabled: true,
  when: { scope, appletIds },
});
settings.keybindings = [
  binding('all', 'all', 'pages'),
  binding('picked', 'picked', 'applets', selected),
];
settings.gestures = {
  ...settings.gestures,
  enabled: true,
  indicatorPosition: 'none',
  bindings: settings.keybindings.map(({ key, ...row }) => ({
    ...row,
    id: 'gesture.' + row.id,
    gesture: 'move-left',
    when: { ...row.when, processes: [] },
  })),
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const portable = !!process.argv[2];
const executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), executablePath);
  assert.equal(hash(executablePath), hash(path.resolve(process.argv[2])));
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await wait(100);
  }
  throw Error(message);
}
const calls = () => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(profile, 'data/storage/test.input-pages/calls.json'), 'utf8'),
    );
  } catch {
    return [];
  }
};
let app, host, target, peer;
const checks = [];
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchTestHost({
    executablePath,
    portable,
    args: portable ? [`--test-profile=${profile}`] : [root, `--test-profile=${profile}`],
    env,
  });
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((page) => page.url().startsWith('appdock://host/')),
    'host page',
  );
  await host.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
  await until(
    async () =>
      (await host.evaluate(() => window.dock.snapshot())).extensions.find(
        (a) => a.id === 'test.input-pages',
      )?.state === 'running',
    'fixture running',
  );
}
async function focusTarget(suffix) {
  const handle = await until(
    () =>
      app.evaluate(({ BrowserWindow, webContents }, suffix) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith(suffix));
        const contains = (view) => view.webContents === wc || (view.children ?? []).some(contains);
        const w = BrowserWindow.getAllWindows().find(
          (w) => w.webContents === wc || contains(w.contentView),
        );
        if (!w) return undefined;
        w.show();
        w.focus();
        return w.getNativeWindowHandle().readBigUInt64LE().toString();
      }, suffix),
    'owning Window ' + suffix,
  );
  await peer.request('focusWindow', { window: handle });
  await until(async () => (await peer.request('snapshot')).foreground === handle, 'native focus');
  await wait(200);
  return handle;
}
async function send(suffix, gesture) {
  const handle = await focusTarget(suffix);
  if (gesture) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        path.join(root, 'tests/InputTests/bin/Release/net10.0-windows/AppDock.InputTests.exe'),
        ['--send', handle, 'move-left'],
        { windowsHide: true, stdio: 'pipe' },
      );
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(Error(output || 'input ' + code)),
      );
    });
  } else
    await app.evaluate(({ webContents }, suffix) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith(suffix));
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'F12', modifiers: ['control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'F12', modifiers: ['control'] });
    }, suffix);
}
async function expectCalls(suffix, expected) {
  for (const gesture of [false, true]) {
    const before = calls().length;
    await send(suffix, gesture);
    await until(
      () => calls().length >= before + expected.length,
      `calls ${suffix} gesture=${gesture}`,
    );
    await wait(120);
    assert.deepEqual(calls().slice(before), expected);
  }
}
(async () => {
  try {
    await launch();
    target = spawn(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
      ),
      [],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    target.stderr.resume();
    peer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    for (const route of hostRoutes) {
      await host.evaluate((route) => window.dock.navigate(route), route);
      await until(
        async () => (await host.evaluate(() => window.dock.snapshot())).navigation.route === route,
        'route ' + route,
      );
      await expectCalls('appdock://host/index.html', ['all', 'picked']);
      checks.push('shortcut and native gesture on host ' + route);
    }
    for (const id of ['history', 'details']) {
      await host.evaluate((id) => window.dock.executeCommand('test.input-pages.open.' + id), id);
      const suffix = '/test.input-pages/' + id + '.html';
      await until(
        () =>
          app
            .context()
            .pages()
            .some((page) => page.url().endsWith(suffix)),
        id + ' contents',
      );
      await expectCalls(suffix, id === 'history' ? ['all', 'picked'] : ['all']);
    }
    checks.push('two pages from one Applet have independent conditions');
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['test.input-pages'].pages = { history: { display: 'window' } };
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
      await window.dock.executeCommand('test.input-pages.open.history');
    });
    await expectCalls('/test.input-pages/history.html', ['all', 'picked']);
    checks.push('standalone Applet window retains page identity');
    await host.evaluate(() => window.dock.navigate('settings'));
    await focusTarget('appdock://host/index.html');
    const page = require('./settings-aware-page.cjs').settingsAwarePage(host);
    let candidates;
    for (const [category, rowId, panelClass] of [
      ['ショートカットキー', 'picked', '.applet-shortcut-dialog'],
      ['マウスジェスチャー', 'gesture.picked', '.gesture-binding-dialog'],
    ]) {
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.locator(`[data-binding-id="${rowId}"] .applet-shortcut-edit`).click();
      const panel = page.locator(panelClass);
      const condition = panel.getByLabel('割り当てのいつ・どこで');
      assert(
        (await condition.locator('option').allTextContents()).includes('AppDockのすべてのページ'),
      );
      assert(
        (await condition.locator('option').allTextContents()).includes('AppDockの指定したページ'),
      );
      await panel.locator('.keybinding-targets').click();
      const labels = await panel.locator('.keybinding-picker label').allTextContents();
      assert.deepEqual(labels, [
        '画像ライブラリー',
        '設定',
        'ログ',
        '通知センター',
        '壁紙履歴',
        '別ページ',
      ]);
      if (candidates) assert.deepEqual(labels, candidates);
      else candidates = labels;
      await panel.getByLabel('対象ページを検索').fill('壁紙');
      assert.equal(await panel.locator('.keybinding-picker label').count(), 1);
      await panel.getByLabel('対象ページを検索').fill('');
      await panel.getByRole('checkbox', { name: '別ページ', exact: true }).check();
      assert.equal(await panel.locator('.settings-error[data-error="true"]').count(), 0);
      await host.screenshot({ path: path.join(profile, rowId + '-picker.png') });
      await panel.getByRole('button', { name: '適用', exact: true }).click();
      await require('./settings-immediate-helper.cjs').settleSettings(page);
    }
    checks.push(
      'both pickers share page names, builtins, filtering, labels and selection; no background Applet',
    );
    const before = (await host.evaluate(() => window.dock.snapshot())).settings.value;
    await app.close();
    app = null;
    await launch();
    const after = (await host.evaluate(() => window.dock.snapshot())).settings.value;
    assert.deepEqual(after.keybindings, before.keybindings);
    assert.deepEqual(after.gestures.bindings, before.gestures.bindings);
    checks.push('page selections survive restart in both assignment types');
    const result = {
      ok: true,
      checks,
      portable,
      ...(portable ? { sha256: hash(executablePath) } : {}),
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ profile, ...result }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    peer?.close();
    target?.stdin.end();
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

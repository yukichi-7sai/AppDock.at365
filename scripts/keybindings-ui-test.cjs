const { settleSettings } = require('./settings-immediate-helper.cjs');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `keybindings-${Date.now()}`);
const fixture = path.join(profile, 'extensions', 'test.keys');
fs.mkdirSync(fixture, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.globalShortcutCommands = [];
settings.extensions['test.keys'] = { enabled: true, settings: {} };
settings.extensions['at365.gmail'] = { enabled: false, settings: { notifications: false } };
fs.cpSync(
  path.resolve(root, '../../40.ARTIFACT/Applet.Gmail.at365/Applet.Gmail.at365'),
  path.join(profile, 'extensions', 'Applet.Gmail.at365'),
  { recursive: true },
);
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.keys',
    name: 'Shortcut fixture',
    displayName: 'キー検証',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['pages', 'storage'],
    commands: [
      { id: 'test.keys.open', title: '検証ページを開く', activateOnExecute: true },
      ...['a', 'b', 'c', 'd'].map((x) => ({
        id: `test.keys.${x}`,
        title: `記録${x.toUpperCase()}`,
      })),
    ],
    pages: [
      {
        id: 'main',
        title: 'キー検証',
        source: 'local',
        ui: 'index.html',
        openCommand: 'test.keys.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  `exports.activate=async c=>{let calls=[];c.commands.register('test.keys.open','Open',()=>c.pages.open('main'));for(const x of ['a','b','c','d'])c.commands.register('test.keys.'+x,'Record '+x,async()=>{calls.push(x);await c.storage.set('calls'+String(calls.length).padStart(5,'0'),x);});};`,
);
fs.writeFileSync(path.join(fixture, 'index.html'), '<h1>Keys</h1><input aria-label="Text">');
const webId = 'fixture.web-settings.items.site',
  accountId = 'account.' + randomUUID();
let webItem;
const make = (id, command, scope, appletIds = [], key = 'Ctrl+F12') => ({
  id,
  command,
  key,
  enabled: true,
  when: { scope, appletIds },
});
settings.keybindings = [
  make('all', 'test.keys.a', 'app'),
  make('pages', 'test.keys.b', 'pages'),
  make('selected', 'test.keys.c', 'applets', ['test.keys', webId]),
  make('duplicate', 'test.keys.a', 'pages'),
  make('global', 'test.keys.d', 'global', [], 'Ctrl+Alt+F10'),
  make('local-global', 'test.keys.a', 'app', [], 'Ctrl+Alt+F10'),
  make('search', 'appdock.commands.search', 'app', [], 'Ctrl+P'),
];
const server = http.createServer((_, res) => res.end('<h1>Remote fixture</h1><input id="text">'));
const calls = () => {
  const d = path.join(profile, 'data/storage/test.keys');
  try {
    return fs
      .readdirSync(d)
      .filter((n) => /^calls[0-9]+[.]json$/.test(n))
      .sort()
      .map((n) => JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')));
  } catch {
    return [];
  }
};
const until = async (fn, label) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
let app, dock, target, targetPeer;
async function nativeFocus(suffix) {
  const handle = await until(
    () =>
      app.evaluate(({ webContents, BrowserWindow }, suffix) => {
        for (const wc of webContents
          .getAllWebContents()
          .filter((w) => w.getURL().endsWith(suffix))) {
          const contains = (view) =>
            view.webContents === wc || (view.children ?? []).some(contains);
          const window = BrowserWindow.getAllWindows().find(
            (w) => w.webContents === wc || contains(w.contentView),
          );
          if (window) {
            window.show();
            return window.getNativeWindowHandle().readBigUInt64LE().toString();
          }
        }
      }, suffix),
    'attached native Window for ' + suffix,
  );
  await targetPeer.request('focusWindow', { window: handle });
  await until(
    async () => (await targetPeer.request('snapshot')).foreground === handle,
    'native Window foreground',
  );
}
const checks = [];
const save = async (rows) =>
  dock.evaluate(async (keybindings) => {
    const s = await window.dock.snapshot();
    s.settings.value.keybindings = keybindings;
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  }, rows);
const send = async (suffix, key = 'F12', modifiers = ['control']) => {
  await nativeFocus(suffix);
  return app.evaluate(
    async ({ webContents, BrowserWindow }, { suffix, key, modifiers }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith(suffix));
      if (!wc) throw Error('Missing ' + suffix);
      const windows = BrowserWindow.getAllWindows();
      const contains = (view) => view.webContents === wc || (view.children ?? []).some(contains);
      const win = windows.find((w) => w.webContents === wc || contains(w.contentView));
      if (!win) throw Error('No owning window');
      win.show();
      win.focus();
      await new Promise((r) => setTimeout(r, 150));
      if (!win.isFocused()) throw Error('Focus denied');
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
    },
    { suffix, key, modifiers },
  );
};
const sendGlobal = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'scripts/send-test-hotkey.ps1'),
        '-VirtualKey',
        '121',
        '-Control',
        '-Alt',
        '-ScanCode',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(output || `SendInput helper exit ${code}`)),
    );
  });
const expectCalls = async (before, expected) => {
  await until(() => calls().length >= before + expected.length, 'Expected ' + expected);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(calls().slice(before), expected);
};
(async () => {
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    webItem = {
      id: 'site',
      name: 'Webキー検証',
      url: `http://127.0.0.1:${server.address().port}/`,
      accountId,
      enabled: true,
      display: 'page',
      navigation: 'none',
      allowedOrigins: [],
      icon: '',
    };
    const webOwner = require('./settings-web-fixture.cjs').installWebSettings(
      profile,
      settings,
      [webItem],
      [{ id: accountId, name: 'Test' }],
    );
    settings.extensions[webOwner].enabled = true;
    fs.writeFileSync(
      path.join(profile, 'extensions', webOwner, 'index.cjs'),
      'exports.activate=async()=>{};',
    );
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const portable = !!process.argv[2];
    const executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) fs.copyFileSync(path.resolve(process.argv[2]), executablePath);
    const portableHash = portable
      ? createHash('sha256').update(fs.readFileSync(executablePath)).digest('hex')
      : undefined;
    if (portable)
      assert.equal(
        portableHash,
        createHash('sha256')
          .update(fs.readFileSync(path.resolve(process.argv[2])))
          .digest('hex'),
      );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await launchTestHost({
      executablePath,
      portable,
      args: portable ? [`--test-profile=${profile}`] : [root, `--test-profile=${profile}`],
      env,
    });
    const host = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().startsWith('appdock://host/')),
      'Host page',
    );
    dock = require('./settings-aware-page.cjs').settingsAwarePage(host);
    target = spawn(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.InputTarget/bin/Release/net10.0-windows/AppDock.InputTarget.exe',
      ),
      [],
      { windowsHide: false, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    target.stderr.resume();
    targetPeer = new JsonLinePeer(target.stdout, target.stdin, async () => {});
    await dock.waitForFunction(() => !!window.dock);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).extensions.find(
          (e) => e.id === 'test.keys',
        )?.state === 'running',
      'Fixture ready',
    );
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.show();
      w.focus();
    });
    // Exercise native input separately, before Chromium synthetic key events.
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).globalHotKeys.some(
          (s) => s.shortcut === 'Ctrl+Alt+F10' && s.registered,
        ),
      'F10 Windows registration',
    );
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.isVisible() && w.webContents.getURL().startsWith('appdock:'),
      );
      w?.focus();
    });
    await new Promise((r) => setTimeout(r, 300));
    await nativeFocus('appdock://host/index.html');
    await new Promise((r) => setTimeout(r, 100));
    const globalBefore = calls().length;
    await sendGlobal();
    await expectCalls(globalBefore, ['d', 'a']);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.hide()),
    );
    const hiddenBefore = calls().length;
    await sendGlobal();
    await expectCalls(hiddenBefore, ['d']);
    checks.push('real Windows global key: local overlap once, hidden global only');
    let before = calls().length;
    await send('appdock://host/index.html');
    await expectCalls(before, ['a', 'b']);
    checks.push('all pages includes the host settings page');
    await dock.evaluate(() => window.dock.executeCommand('test.keys.open'));
    await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().endsWith('/test.keys/index.html')),
      'Local page',
    );
    await new Promise((r) => setTimeout(r, 500));
    before = calls().length;
    await send('/test.keys/index.html');
    await expectCalls(before, ['a', 'b', 'c']);
    checks.push('local page: ordered all-match and dedup');
    await save([...settings.keybindings, make('owner', 'test.keys.d', 'owner')]);
    before = calls().length;
    await send('/test.keys/index.html');
    await expectCalls(before, ['a', 'b', 'c', 'd']);
    // First action opens a different page: later commands still use captured matching rules.
    await save([make('switch', `${webId}.open`, 'pages'), ...settings.keybindings]);
    before = calls().length;
    await send('/test.keys/index.html');
    await expectCalls(before, ['a', 'b', 'c']);
    const remote = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url() === webItem.url),
      'Web page',
    );
    await new Promise((r) => setTimeout(r, 500));
    await save([...settings.keybindings, make('owner', 'test.keys.d', 'owner')]);
    before = calls().length;
    await send(webItem.url);
    await expectCalls(before, ['a', 'b', 'c']);
    await save(settings.keybindings);
    checks.push('owner scope runs only on the command provider page, not another Applet');
    checks.push(
      'WebApplet supports cross-Applet commands, multi-target conditions, captured context',
    );
    await remote.locator('#text').fill('入力保持');
    await send(webItem.url, 'A', []);
    assert.equal(await remote.locator('#text').inputValue(), '入力保持'); // sendInputEvent keyDown is not a char event
    await remote.locator('#text').press('b');
    assert.equal(await remote.locator('#text').inputValue(), '入力保持b');
    await dock.evaluate(async (id) => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['fixture.web-settings'].settings.items.find(
        (i) => i.id === 'site',
      ).display = 'window';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
      await window.dock.executeCommand(id + '.open');
    }, webId);
    before = calls().length;
    await send(webItem.url);
    await expectCalls(before, ['a', 'b', 'c']);
    checks.push('standalone page retains context and input');
    await app.evaluate(({ app }) =>
      app.on('session-created', (ses) => {
        if (ses.isPersistent())
          ses.protocol.handle(
            'https',
            () =>
              new Response(
                '<main role="main"><h1>Offline Gmail</h1><input aria-label="mail input"></main>',
                { headers: { 'content-type': 'text/html; charset=utf-8' } },
              ),
          );
      }),
    );
    await dock.evaluate(() => window.dock.executeCommand('at365.gmail.open'));
    const gmailUi = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().endsWith('/web/index.html')),
      'Gmail UI',
    );
    await gmailUi.evaluate(async () => {
      const state = await window.webAccounts.snapshot();
      if (!state.accounts.length) await window.webAccounts.add();
    });
    const gmail = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().startsWith('https://mail.google.com/')),
      'Gmail body',
    );
    await new Promise((r) => setTimeout(r, 600));
    before = calls().length;
    await send(gmailUi.url());
    await expectCalls(before, ['a', 'b']);
    const gmailRows = settings.keybindings.map((r) =>
      r.id === 'selected'
        ? { ...r, when: { ...r.when, appletIds: [...r.when.appletIds, 'at365.gmail'] } }
        : r,
    );
    await save(gmailRows);
    before = calls().length;
    await send(gmail.url());
    await expectCalls(before, ['a', 'b', 'c']);
    await save(settings.keybindings);
    await dock.evaluate((id) => window.dock.executeCommand(id + '.open'), webId);
    checks.push('Gmail local UI and offline remote body use shared scope resolver');
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await dock.getByRole('button', { name: 'ショートカットキー', exact: true }).click();
    await dock.getByLabel('ショートカットキーのコマンドを検索').fill('test.keys.c');
    const row = dock.locator('[data-binding-id="selected"]');
    const editDialog = dock.locator('.applet-shortcut-dialog');
    const keyRecorder = editDialog.getByRole('button', {
      name: 'ショートカットキーを入力',
      exact: true,
    });
    const openEdit = async (entry = row) => {
      await entry.locator('.applet-shortcut-edit').click();
      await editDialog.getByText('押して入力', { exact: true }).waitFor();
    };
    const applyEdit = () => editDialog.getByRole('button', { name: '適用', exact: true }).click();
    await openEdit();
    await editDialog.getByRole('button', { name: /キー検証/ }).click();
    assert.equal(
      await editDialog
        .getByRole('group', { name: /対象ページ$/ })
        .getByRole('checkbox', { checked: true })
        .count(),
      2,
    );
    await editDialog.getByRole('button', { name: '編集をキャンセル', exact: true }).click();
    await dock
      .locator('[data-shortcut-command="test.keys.c"]')
      .getByRole('button', { name: /に割り当てを追加/ })
      .click();
    await editDialog.getByText('押して入力', { exact: true }).waitFor();
    await keyRecorder.press('Control+F8');
    await editDialog.getByRole('button', { name: '追加', exact: true }).click();
    assert.equal(
      await dock.locator('[data-shortcut-command="test.keys.c"] [data-binding-id]').count(),
      2,
    );
    await settleSettings(dock);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.keybindings.filter(
          (r) => r.command === 'test.keys.c',
        ).length === 2,
      'Saved extra binding',
    );
    await openEdit();
    await until(
      async () =>
        !(await dock.evaluate(() => window.dock.snapshot())).globalHotKeys.some(
          (s) => s.registered,
        ),
      'Recorder suspends OS keys',
    );
    await keyRecorder.press('Control+Shift+F11');
    await applyEdit();
    await settleSettings(dock);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.keybindings.find(
          (r) => r.id === 'selected',
        ).key === 'Ctrl+Shift+F11',
      'Recorded key saved',
    );
    await row.getByRole('button', { name: /その他の操作/ }).click();
    assert.deepEqual(await dock.getByRole('menuitem').allTextContents(), [
      '編集',
      'このキーの実行順…',
      '削除',
    ]);
    await dock.keyboard.press('Escape');
    await openEdit();
    await editDialog.getByRole('switch', { name: 'この割り当てを有効にする' }).click();
    await applyEdit();
    await settleSettings(dock);
    await until(
      async () =>
        !(await dock.evaluate(() => window.dock.snapshot())).settings.value.keybindings.find(
          (r) => r.id === 'selected',
        ).enabled,
      'Disabled state saved',
    );
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
    assert.equal(saved.keybindings.find((r) => r.id === 'selected').enabled, false);
    assert.equal(saved.keybindings.find((r) => r.id === 'selected').key, 'Ctrl+Shift+F11');
    assert.equal(saved.keybindings.find((r) => r.id === 'selected').when.scope, 'applets');
    await openEdit();
    assert.deepEqual(
      await editDialog.locator('select[aria-label*="いつ・どこで"] option').allTextContents(),
      [
        'Webブラウザ',
        '指定したexe',
        'グローバル',
        'デスクトップ',
        'AppDock全体',
        'AppDockのすべてのページ',
        'キー検証',
        'AppDockの指定したページ',
      ],
    );
    await editDialog.getByLabel('割り当てのいつ・どこで').selectOption('owner');
    await applyEdit();
    await settleSettings(dock);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.keybindings.find(
          (r) => r.id === 'selected',
        ).when.scope === 'owner',
      'Owner scope saved',
    );
    const ownerSaved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
    assert.deepEqual(ownerSaved.keybindings.find((r) => r.id === 'selected').when, {
      scope: 'owner',
      appletIds: [],
    });
    await save([...ownerSaved.keybindings, make('gmail-owner', 'at365.gmail.open', 'owner')]);
    await dock.getByLabel('ショートカットキーのコマンドを検索').fill('at365.gmail.open');
    await openEdit(dock.locator('[data-binding-id="gmail-owner"]'));
    assert.equal(await editDialog.locator('option[value="owner"]').textContent(), 'Gmail');
    await keyRecorder.press('Escape');
    await dock.getByLabel('ショートカットキーのコマンドを検索').fill('appdock.commands.search');
    await openEdit(dock.locator('[data-binding-id="search"]'));
    assert.equal(await editDialog.locator('option[value="owner"]').count(), 0);
    await keyRecorder.press('Escape');
    checks.push(
      'scope options ordered with provider name only, host exclusion and owner persistence',
    );
    for (const [command, key, scope] of [
      ['test.keys.open', 'Control+Shift+F9', 'owner'],
      ['appdock.restart', 'Control+Shift+F8', 'app'],
    ]) {
      await dock.getByLabel('ショートカットキーのコマンドを検索').fill(command);
      const entry = dock.locator(`[data-shortcut-command="${command}"]`);
      assert.equal(await entry.locator('.command-id').textContent(), command);
      await entry.getByRole('button', { name: /に割り当てを追加/ }).click();
      await editDialog.getByText('押して入力', { exact: true }).waitFor();
      assert.equal(await editDialog.getByLabel('割り当てのいつ・どこで').inputValue(), scope);
      await keyRecorder.press(key);
      await editDialog.getByRole('button', { name: '追加', exact: true }).click();
      await settleSettings(dock);
      await until(
        async () =>
          (await dock.evaluate(() => window.dock.snapshot())).settings.value.keybindings.some(
            (r) => r.command === command && r.when.scope === scope,
          ),
        'Default scope saved',
      );
    }
    await dock.getByLabel('ショートカットキーのコマンドを検索').fill('test.keys.c');
    await dock.screenshot({ path: path.join(profile, 'shortcuts-dark.png') });
    await dock.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'light';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await new Promise((r) => setTimeout(r, 300));
    await dock.screenshot({ path: path.join(profile, 'shortcuts-light.png') });
    checks.push(
      'flat command list, multi-select, additional binding, recording suspension, disable, persistence and themes',
    );
    await dock.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.pinnedCommands = ['test.keys.a'];
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await dock.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    const palette = await require('./shell-overlay-helper.cjs').overlayPage(dock);
    await palette.getByPlaceholder('コマンドを入力…').fill('test.keys.a');
    assert.equal(
      await palette.locator('.palette-command .command-id').textContent(),
      'test.keys.a',
    );
    await palette.screenshot({ path: path.join(profile, 'command-ids.png') });
    await palette.getByPlaceholder('コマンドを入力…').fill('キー検証');
    assert.ok((await palette.locator('.palette-command').count()) >= 5);
    checks.push(
      'new Applet/host binding defaults, unchanged existing scopes and full searchable IDs in settings and palette',
    );
    await require('./shortcut-options-checks.cjs')({
      app,
      dock,
      profile,
      checks,
      until,
      calls,
      send,
      sendGlobal,
      expectCalls,
      nativeFocus,
      restart: async () => {
        await app.close();
        app = await launchTestHost({
          executablePath,
          portable,
          args: portable ? [`--test-profile=${profile}`] : [root, `--test-profile=${profile}`],
          env,
        });
        const host = await until(
          () =>
            app
              .context()
              .pages()
              .find((p) => p.url().startsWith('appdock://host/')),
          'restarted Host page',
        );
        dock = require('./settings-aware-page.cjs').settingsAwarePage(host);
        await until(
          async () => (await dock.evaluate(() => window.dock.snapshot())).startupReady,
          'restarted host ready',
        );
        return { app, dock };
      },
    });
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ checks, sha256: portableHash }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } finally {
    targetPeer?.close();
    target?.stdin.end();
    if (app) await app.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

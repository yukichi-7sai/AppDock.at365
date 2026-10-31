const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage, waitForHost } = require('./settings-host-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const { JsonLinePeer } = require('../out/main/main/core/rpc');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'modal-trigger-input-ui-' + Date.now());
const fixture = path.join(profile, 'extensions/fixture.modal');
fs.mkdirSync(fixture, { recursive: true });
const navigation = [
  [9, 'Tab'],
  [27, 'Escape'],
  [13, 'Enter'],
  [38, 'Up'],
  [40, 'Down'],
  [37, 'Left'],
  [39, 'Right'],
];
const ids = [
  ...navigation.map(([, key]) => key.toLowerCase()),
  'global',
  'local',
  'modified',
  'mouse',
  'choice',
];
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.modal',
    name: 'Modal input fixture',
    minimumHostVersion: '0.105.1',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['commands', 'settings'],
    commands: ids.map((id) => ({
      id: 'fixture.modal.' + id,
      title: id === 'choice' ? 'Palette choice' : 'Fixture ' + id,
    })),
    settings: [
      {
        key: 'rows',
        title: '入力一覧',
        type: 'object-list',
        itemTitle: '入力項目',
        default: [{ name: 'row' }],
        list: { columns: ['name'], titleKey: 'name' },
        fields: [{ key: 'name', title: '名前', type: 'string', default: '' }],
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `const fs=require('node:fs'),path=require('node:path');exports.activate=async c=>{for(const id of ${JSON.stringify(ids)})c.commands.register('fixture.modal.'+id,id==='choice'?'Palette choice':'Fixture '+id,()=>fs.appendFileSync(path.join(__dirname,'events.txt'),id+'\\n'));};`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  soundEnabled: false,
  closeToTray: false,
  checkUpdatesOnStartup: false,
});
settings.extensions['fixture.modal'] = { enabled: true, settings: {} };
settings.keybindings = [
  ...navigation.map(([, key]) => [key, key.toLowerCase(), 'global']),
  ['Ctrl+Shift+F8', 'global', 'global'],
  ['Ctrl+Shift+F9', 'local', 'app'],
  ['Ctrl+Enter', 'modified', 'global'],
].map(([key, id, scope]) => ({
  id,
  key,
  command: 'fixture.modal.' + id,
  enabled: true,
  blockOriginalInput: true,
  when: { scope, appletIds: [] },
}));
settings.gestures.bindings = [
  {
    id: 'mouse',
    gesture: 'wheel-up',
    command: 'fixture.modal.mouse',
    enabled: true,
    when: { scope: 'global', appletIds: [], processes: [] },
  },
];
settings.gestures.indicatorPosition = 'none';
settings.touchpadGestures.enabled = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const events = () =>
  fs.existsSync(path.join(fixture, 'events.txt'))
    ? fs.readFileSync(path.join(fixture, 'events.txt'), 'utf8').trim().split('\n').filter(Boolean)
    : [];
const count = (id) => events().filter((value) => value === id).length;
const until = async (read, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await read()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(label);
};
const checks = [];
let app, dock, helper, peer, handle;
async function focus() {
  await peer.request('focusWindow', { window: handle });
  await until(
    async () => (await peer.request('snapshot')).foreground === handle,
    'host foreground',
  );
}
const key = (code, modifiers = []) => peer.request('chord', { key: code, modifiers });
async function expectCommand(id, code, modifiers) {
  const before = count(id);
  await key(code, modifiers);
  await until(() => count(id) === before + 1, id + ' trigger');
}
function mouse() {
  const result = spawnSync(
    path.join(root, '.artifacts/input-tests/AppDock.InputTests.exe'),
    ['--send', handle, 'wheel-up'],
    { cwd: root, windowsHide: true, encoding: 'utf8' },
  );
  fs.appendFileSync(path.join(profile, 'mouse.log'), (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, 'mouse gesture helper');
}
async function openDialog() {
  await dock.getByRole('button', { name: '入力項目を追加', exact: true }).click();
  const dialog = dock.getByTestId('settings-dialog');
  await dialog.waitFor();
  await focus();
  return dialog;
}
async function palette() {
  await dock.evaluate((requestId) => {
    void window.dock.openCommandPalette({
      requestId,
      mode: 'execute',
      initialCommandId: 'fixture.modal.choice',
    });
  }, randomUUID());
  const page = await overlayPage(dock);
  await focus();
  return page;
}
(async () => {
  try {
    const build = spawnSync(
      'dotnet',
      [
        'publish',
        'tests/fixtures/dotnet/AppDock.InputTarget/AppDock.InputTarget.csproj',
        '-c',
        'Release',
        '-o',
        '.artifacts/modal-input-target',
      ],
      { cwd: root, windowsHide: true, encoding: 'utf8' },
    );
    fs.writeFileSync(
      path.join(profile, 'helper-build.log'),
      (build.stdout ?? '') + (build.stderr ?? ''),
    );
    assert.equal(build.status, 0, 'input target build');
    helper = spawn(path.join(root, '.artifacts/modal-input-target/AppDock.InputTarget.exe'), [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    helper.stderr.on('data', (data) => fs.appendFileSync(path.join(profile, 'helper.log'), data));
    peer = new JsonLinePeer(helper.stdout, helper.stdin, async () => {});
    await peer.request('snapshot');
    const portable = !!process.argv[2];
    let executable = require('electron');
    if (portable) {
      executable = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
      const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await launchTestHost({
      executablePath: executable,
      portable,
      env,
      args: [
        ...(portable ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
      ],
    });
    await until(
      async () => {
        dock = app
          .context()
          .pages()
          .find((p) => p.url() === 'appdock://host/index.html');
        return (
          dock && (await dock.evaluate(async () => (await window.dock.snapshot()).startupReady))
        );
      },
      'startup ready',
      60000,
    );
    dock.setDefaultTimeout(15000);
    handle = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.show();
      w.focus();
      return w.getNativeWindowHandle().readBigUInt64LE().toString();
    });
    await waitForHost(
      dock,
      async () =>
        (await window.dock.snapshot()).globalHotKeys.length === 9 &&
        (await window.dock.snapshot()).globalHotKeys.every((s) => s.registered),
    );
    const initialSettings = await dock.evaluate(
      async () => (await window.dock.snapshot()).settings.value,
    );
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(dock);
    await dock.getByTestId('settings-nav:applet:fixture.modal').click();
    await dock.getByRole('heading', { name: 'Modal input fixture', exact: true }).waitFor();
    let dialog = await openDialog();
    const input = dialog.getByRole('textbox').first();
    await input.fill('abcd');
    await input.focus();
    const beforeCursor = await input.evaluate((el) => el.selectionStart);
    await key(37);
    assert.equal(await input.evaluate((el) => el.selectionStart), beforeCursor - 1);
    await key(39);
    await key(38);
    await key(40);
    await input.focus();
    await key(9);
    assert.equal(await input.evaluate((el) => document.activeElement === el), false);
    await expectCommand('global', 0x77, [0x11, 0x10]);
    await expectCommand('local', 0x78, [0x11, 0x10]);
    await expectCommand('modified', 13, [0x11]);
    const beforeMouse = count('mouse');
    mouse();
    await until(() => count('mouse') === beforeMouse + 1, 'mouse during dialog');
    assert.equal(
      events().filter((id) => navigation.some(([, key]) => key.toLowerCase() === id)).length,
      0,
    );
    checks.push(
      'dialog arrows and Tab reach controls; other global/local/modified keys and mouse gesture continue',
    );
    await peer.request('focus');
    await until(async () => (await peer.request('snapshot')).focused, 'external target foreground');
    for (const [code, name] of navigation) await expectCommand(name.toLowerCase(), code, []);
    assert.equal(await dialog.count(), 1);
    checks.push(
      'all seven navigation triggers run normally in another foreground app while the dialog remains open',
    );
    await focus();
    await key(27);
    await dialog.waitFor({ state: 'hidden' });
    dialog = await openDialog();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).focus();
    await key(13);
    await dialog.waitFor({ state: 'hidden' });
    for (const [, name] of navigation) assert.equal(count(name.toLowerCase()), 1);
    checks.push(
      'Escape dismisses and Enter activates the focused dialog button without firing either trigger',
    );
    let p = await palette();
    const combo = p.getByRole('combobox');
    await combo.fill('Fixture');
    await until(async () => (await p.getByRole('option').count()) > 2, 'palette results');
    const selected = await combo.getAttribute('aria-activedescendant');
    await key(40);
    assert.notEqual(await combo.getAttribute('aria-activedescendant'), selected);
    await key(38);
    await key(37);
    await key(39);
    await key(9);
    assert.equal(await combo.evaluate((el) => document.activeElement === el), false);
    await expectCommand('global', 0x77, [0x11, 0x10]);
    await expectCommand('local', 0x78, [0x11, 0x10]);
    await expectCommand('modified', 13, [0x11]);
    const paletteMouse = count('mouse');
    mouse();
    await until(() => count('mouse') === paletteMouse + 1, 'mouse during palette');
    await key(27);
    await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
    p = await palette();
    await p.getByRole('combobox').fill('Palette choice');
    await until(async () => (await p.getByRole('option').count()) === 1, 'single palette choice');
    await key(13);
    await until(() => count('choice') === 1, 'palette Enter executes selected command');
    await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
    for (const [, name] of navigation) assert.equal(count(name.toLowerCase()), 1);
    checks.push(
      'palette navigation, Tab, Escape and Enter work; other global/local/modified keys and mouse gesture continue',
    );
    await dock.evaluate(() => {
      window.__nativePickerClosed = false;
      void window.dock.chooseDirectory().then(() => {
        window.__nativePickerClosed = true;
      });
    });
    await until(
      async () => (await peer.request('snapshot')).foregroundClass === '#32770',
      'native folder dialog foreground',
    );
    await key(9);
    await key(27);
    await waitForHost(dock, () => window.__nativePickerClosed);
    assert.equal(count('tab'), 1);
    assert.equal(count('escape'), 1);
    checks.push(
      'AppDock native folder dialog also receives Tab and Escape without triggering assigned commands',
    );
    await dock.evaluate(() => window.dock.executeCommand('appdock.settings.command-triggers.open'));
    await dock
      .getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true })
      .fill('Fixture global');
    await dock.locator('[data-shortcut-command="fixture.modal.global"] .command-title').hover();
    await dock.getByTestId('binding-add:fixture.modal.global:shortcuts').click();
    dialog = dock.getByTestId('settings-dialog');
    const recorder = dialog.locator('.shortcut-capture');
    await recorder.click();
    await focus();
    await waitForHost(dock, async () => (await window.dock.snapshot()).globalHotKeys.length === 0);
    const keyCount = count('global');
    await key(0x77, [0x11, 0x10]);
    await until(async () => (await recorder.innerText()).includes('F8'), 'real key recording');
    assert.equal(count('global'), keyCount);
    const recordingMouse = count('mouse');
    mouse();
    await until(() => count('mouse') === recordingMouse + 1, 'mouse during key recording');
    await dialog.getByTestId('binding-cancel').focus();
    await waitForHost(dock, async () => (await window.dock.snapshot()).globalHotKeys.length === 9);
    await expectCommand('global', 0x77, [0x11, 0x10]);
    await key(27);
    await dialog.waitFor({ state: 'hidden' });
    checks.push(
      'only actual key recording suspends keyboard triggers; mouse works and keyboard resumes after leaving the recorder',
    );
    const snapshot = await dock.evaluate(() => window.dock.snapshot());
    for (const name of ['keybindings', 'triggerStacks', 'commandStacks'])
      assert.deepEqual(snapshot.settings.value[name], initialSettings[name]);
    assert.deepEqual(snapshot.settings.value.gestures.bindings, initialSettings.gestures.bindings);
    checks.push('opening, dismissing and recording without applying retain saved trigger bindings');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, portable, checks, events: events() }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }, null, 2));
  } catch (error) {
    if (dock)
      fs.writeFileSync(
        path.join(profile, 'snapshot.json'),
        JSON.stringify(
          await dock.evaluate(() => window.dock.snapshot()).catch(() => null),
          null,
          2,
        ),
      );
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack ?? error));
    await dock?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    peer?.close();
    helper?.kill();
    await app?.close();
  }
})();

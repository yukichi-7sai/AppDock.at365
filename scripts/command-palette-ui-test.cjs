const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `command-palette-ui-${Date.now()}`);
const fixture = path.join(profile, 'extensions', 'fixture.palette');
fs.mkdirSync(fixture, { recursive: true });
const target = 'fixture.palette.long';
const title = '長いコマンド名でもアイコンと操作を揃えて表示する';
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.palette',
    name: 'Palette fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    commands: [
      {
        id: target,
        title,
        description: '長い説明も折り返して読み取れることを確認するための説明文です。'.repeat(3),
      },
      { id: 'fixture.palette.short', title: '短い名前' },
    ],
  }),
);
fs.writeFileSync(path.join(fixture, 'worker.cjs'), 'exports.activate=async()=>{};');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.soundEnabled = false;
settings.host.theme = 'dark';
settings.host.closeToTray = false;
settings.host.checkUpdatesOnStartup = false;
settings.extensions['fixture.palette'] = { enabled: false, settings: {} };
settings.globalShortcutCommands = [];
settings.pinnedCommands = [target, 'appdock.logs.open', 'fixture.palette.short'];
const row = {
  command: target,
  enabled: true,
  when: { scope: 'app', appletIds: [], processes: [] },
};
settings.keybindings = [
  { ...row, id: 'key-one', key: 'Ctrl+Shift+F8' },
  { ...row, id: 'key-two', key: 'Ctrl+Alt+F9' },
  { ...row, id: 'key-off', key: 'Ctrl+F10', enabled: false },
];
settings.gestures.enabled = true;
settings.gestures.bindings = [
  { ...row, id: 'mouse-down', gesture: 'move-down' },
  { ...row, id: 'mouse-up', gesture: 'move-up' },
  { ...row, id: 'mouse-off', gesture: 'move-left', enabled: false },
];
// The real bridge stays OFF until its native boundary is stubbed below.
settings.touchpadGestures.enabled = false;
settings.touchpadGestures.bindings = [
  { ...row, id: 'touch-four', gesture: 'four.right' },
  { ...row, id: 'touch-three', gesture: 'three.tap' },
  { ...row, id: 'touch-off', gesture: 'four.tap', enabled: false },
];
require('../out/main/shared/settings-schema').parseSettings(settings);
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const portable = !!process.argv[2];
let executable = require('electron');
if (portable) {
  executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
let app, dock, palette;
const checks = [];
const layoutMeasurements = {};
async function open(initialCommandId) {
  await dock.evaluate((id) => {
    void window.dock.openCommandPalette({
      requestId: crypto.randomUUID(),
      mode: 'execute',
      ...(id ? { initialCommandId: id } : {}),
    });
  }, initialCommandId);
  palette = await overlayPage(dock);
  palette.setDefaultTimeout(15000);
  return palette;
}
async function close() {
  await palette.getByRole('combobox').press('Escape');
  await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
}
async function enable(key, enabled) {
  await dock.evaluate(
    async ({ key, enabled }) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, [key]: { ...s.settings.value[key], enabled } },
        s.settings.revision,
      );
    },
    { key, enabled },
  );
}
async function marks(expected) {
  await palette.waitForFunction(
    ({ target, expected }) => {
      const marks = [
        ...document.querySelectorAll(`[data-command-id="${target}"] [data-trigger-kind]`),
      ];
      return JSON.stringify(marks.map((e) => e.dataset.triggerKind)) === JSON.stringify(expected);
    },
    { target, expected },
  );
}
async function jump(id) {
  const option = palette.locator(`[role=option][data-command-id="${id}"]`);
  const button = option.getByRole('button', { name: /のコマンドトリガー/ });
  await button.focus();
  await button.press('Enter');
  await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
  await settingsPage(dock);
  await dock.locator(`[data-shortcut-command="${id}"]`).first().waitFor();
  await dock
    .getByTestId('command-provider-filter')
    .filter({ hasText: id === target ? title : '短い名前' })
    .waitFor();
  assert.equal(
    await dock
      .locator('.command-binding-table [data-shortcut-command]')
      .evaluateAll((rows) => new Set(rows.map((row) => row.dataset.shortcutCommand)).size),
    1,
  );
}
(async () => {
  try {
    app = await launchTestHost({
      executablePath: executable,
      portable,
      args: [...(portable ? [] : [root]), `--test-profile=${profile}`],
      env,
    });
    const deadline = Date.now() + 30000;
    while (!dock && Date.now() < deadline) {
      dock = app
        .context()
        .pages()
        .find((p) => p.url() === 'appdock://host/index.html');
      if (!dock) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(dock);
    dock.setDefaultTimeout(15000);
    await waitForHost(dock, async () => (await window.dock.snapshot()).startupReady);
    const baseline = (await dock.evaluate(() => window.dock.snapshot())).settings.value;
    await app.evaluate(({ app, BrowserWindow, nativeTheme }) => {
      const read = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { InputCaptureManager } = read('./out/main/main/core/gestures.js');
      InputCaptureManager.prototype.touchpadRequest = async () => {
        throw Error('UI fixture: native touchpad boundary disabled');
      };
      nativeTheme.themeSource = 'dark';
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.setSize(1000, 800);
      w.show();
      w.focus();
    });
    await enable('touchpadGestures', true);
    await open();
    await palette.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await palette.getByRole('combobox').fill('no-command-matches-this-query');
    assert.equal(await palette.getByRole('option').count(), 0);
    assert.equal(await palette.getByRole('alert').count(), 0);
    await palette.getByRole('combobox').fill('fixture.palette');
    await marks([
      'shortcuts',
      'shortcuts',
      'gestures',
      'gestures',
      'touchpad-gestures',
      'touchpad-gestures',
    ]);
    const inputs = await palette
      .locator(`[data-command-id="${target}"] [data-trigger-kind]`)
      .allTextContents();
    assert(inputs[0].includes('Ctrl+Shift+F8'));
    assert(inputs[1].includes('Ctrl+Alt+F9'));
    const pinnedRow = palette.locator(`[data-command-id="${target}"]`);
    const up = pinnedRow.getByRole('button', { name: `${title}を上に移動`, exact: true });
    const down = pinnedRow.getByRole('button', { name: `${title}を下に移動`, exact: true });
    assert(await up.isDisabled());
    assert(await down.isEnabled());
    await down.click();
    await waitForHost(dock, async () => {
      const pins = (await window.dock.snapshot()).settings.value.pinnedCommands;
      return (
        JSON.stringify(pins) ===
        JSON.stringify(['fixture.palette.short', 'appdock.logs.open', 'fixture.palette.long'])
      );
    });
    await palette.waitForFunction((id) => {
      const row = document.querySelector(`[data-command-id="${id}"]`);
      return row && !row.querySelector('.palette-pin-order button').disabled;
    }, target);
    await up.focus();
    await up.press('Enter');
    await waitForHost(dock, async () => {
      const pins = (await window.dock.snapshot()).settings.value.pinnedCommands;
      return (
        JSON.stringify(pins) ===
        JSON.stringify(['fixture.palette.long', 'appdock.logs.open', 'fixture.palette.short'])
      );
    });
    checks.push(
      'rightmost move controls reorder visible pins by mouse and Enter while retaining hidden pins',
    );
    await palette.getByRole('combobox').fill(target);
    layoutMeasurements.wideWidth = await palette
      .locator('.command-palette')
      .evaluate((el) => el.getBoundingClientRect().width);
    await palette.screenshot({ path: path.join(profile, 'wide-dark.png') });
    checks.push(
      'ordinary empty search has no alert; all six enabled marks in list order; wide command layout',
    );
    for (const [setting, kind] of [
      ['keybindingOptions', 'shortcuts'],
      ['gestures', 'gestures'],
      ['touchpadGestures', 'touchpad-gestures'],
    ]) {
      await enable(setting, false);
      await marks(
        [
          'shortcuts',
          'shortcuts',
          'gestures',
          'gestures',
          'touchpad-gestures',
          'touchpad-gestures',
        ].filter((k) => k !== kind),
      );
      await enable(setting, true);
      await marks([
        'shortcuts',
        'shortcuts',
        'gestures',
        'gestures',
        'touchpad-gestures',
        'touchpad-gestures',
      ]);
    }
    await close();
    await open(target);
    await palette.getByRole('combobox').fill('no-match-from-command-link');
    assert.equal(await palette.getByRole('alert').count(), 0);
    await palette.getByRole('combobox').fill(target);
    await jump(target);
    const listInputs = await dock
      .locator(`[data-shortcut-command="${target}"] [data-trigger-kind]`)
      .allTextContents();
    assert(inputs.every((input) => listInputs.includes(input)));
    await dock.getByTestId('command-provider-filter-clear').click();
    await dock.getByTestId('command-provider-filter').waitFor({ state: 'hidden' });
    checks.push(
      'method OFF/ON updates open palette; targeted zero results has no alert; keyboard bolt opens exact command list; filter clears',
    );
    await open('fixture.palette.short');
    await jump('fixture.palette.short');
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).extensions.find(
        (e) => e.id === 'fixture.palette',
      ).enabled,
      false,
    );
    checks.push(
      'unassigned stopped command opens settings without starting or executing it; repeated navigation changes target',
    );
    await dock.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme: 'light' } },
        s.settings.revision,
      );
    });
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      w.setMinimumSize(400, 500);
      w.setSize(440, 700);
    });
    await open(target);
    await palette.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await palette.waitForFunction(
      () => document.querySelector('.command-palette').getBoundingClientRect().width < 440,
    );
    await palette.locator('.palette-trigger-settings').focus();
    layoutMeasurements.narrow = await palette.locator('.command-palette').evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      textLeft: el.querySelector('.palette-command-text').getBoundingClientRect().left,
      triggersLeft: el.querySelector('.palette-triggers').getBoundingClientRect().left,
    }));
    await palette.screenshot({ path: path.join(profile, 'narrow-light.png') });
    const layout = await palette.locator('.command-palette').evaluate((el) => {
      const root = el.getBoundingClientRect();
      return [
        ...el.querySelectorAll(
          '[data-trigger-kind], .palette-trigger-settings, .pin-toggle, .palette-pin-order button',
        ),
      ].every((node) => {
        const r = node.getBoundingClientRect();
        return r.left >= root.left && r.right <= root.right;
      });
    });
    assert(layout, 'All marks and buttons stay within the narrow palette');
    await close();
    checks.push(
      'narrow light layout retains readable trigger marks and keyboard-accessible actions',
    );
    const saved = (await dock.evaluate(() => window.dock.snapshot())).settings.value;
    assert.deepEqual(saved.keybindings, baseline.keybindings);
    assert.deepEqual(saved.gestures.bindings, baseline.gestures.bindings);
    assert.deepEqual(saved.touchpadGestures.bindings, baseline.touchpadGestures.bindings);
    await app.close();
    app = null;
    fs.writeFileSync(
      path.join(profile, 'checks.json'),
      JSON.stringify(
        {
          success: true,
          checks,
          layoutMeasurements,
          hostHash: hash(executable),
          limitations: [
            'Touchpad native boundary stubbed; no F13-F24 registration, physical input, or Windows touchpad configuration',
          ],
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack);
    await palette?.screenshot({ path: path.join(profile, 'failure-palette.png') }).catch(() => {});
    await dock?.screenshot({ path: path.join(profile, 'failure-host.png') }).catch(() => {});
    await app?.close().catch(() => {});
    console.error(error);
    process.exitCode = 1;
  }
})();

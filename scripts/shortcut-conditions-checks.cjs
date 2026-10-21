const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (context) => {
  let { host, page } = context;
  const { peer, chord, calls, until, profile, checks, focusHost, openShortcuts, hostProcessName } =
    context;
  const snapshot = () => host.evaluate(() => window.dock.snapshot());
  const original = (await snapshot()).settings.value;
  const make = (id, key, scope, command = 'a', extra = {}, block = true) => ({
    id,
    key,
    command: 'test.hook.' + command,
    enabled: true,
    blockOriginalInput: block,
    when: { scope, appletIds: [], ...extra },
  });
  const settings = structuredClone(original);
  settings.keybindingOptions = {
    ...settings.keybindingOptions,
    browsers: ['AppDock.InputTarget', hostProcessName],
    requireChromiumWindowClass: false,
    executionMode: 'all',
  };
  settings.keybindings.push(
    make('condition-miss', 'Ctrl+Alt+F19', 'exe', 'b', { processes: ['no-such-target'] }, true),
    make(
      'condition-exe',
      'Ctrl+Alt+F19',
      'exe',
      'a',
      { processes: ['APPDOCK.INPUTTARGET.EXE'] },
      false,
    ),
    make(
      'condition-second',
      'Ctrl+Alt+F19',
      'exe',
      'b',
      { processes: ['AppDock.InputTarget'] },
      false,
    ),
    make(
      'condition-duplicate',
      'Ctrl+Alt+F19',
      'exe',
      'a',
      { processes: ['AppDock.InputTarget'] },
      false,
    ),
    make('condition-local', 'Ctrl+Alt+F19', 'app', 'b', {}, false),
    make('condition-browser', 'Ctrl+Alt+F20', 'browser'),
    make('condition-desktop', 'Ctrl+Alt+F21', 'desktop'),
    make('condition-exclusion', 'Ctrl+Alt+F22', 'global', 'a', { excludeDesktop: true }),
  );
  const store = async (value) => {
    await host.evaluate(async (value) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(value, s.settings.revision);
    }, value);
    await until(async () => {
      const s = await snapshot();
      return (
        s.globalHotKeys.some((k) => k.shortcut === 'Ctrl+Alt+F19') &&
        s.globalHotKeys.every((k) => k.registered)
      );
    }, 'conditional capture applied');
    await sleep(120);
  };
  const press = async (key, expected, { target = true, originalKey } = {}) => {
    if (target) await peer.request('focus');
    await peer.request('clear');
    const start = calls().length;
    await chord(key, [0x11, 0x12]);
    if (expected.length)
      await until(
        () => calls().length >= start + expected.length,
        'conditional commands ' + expected,
      );
    await sleep(200);
    assert.deepEqual(
      calls()
        .slice(start)
        .map((c) => c.key),
      expected,
    );
    if (originalKey !== undefined) {
      const events = (await peer.request('snapshot')).events;
      assert.equal(
        events.some((e) => e.includes('F' + (key - 0x70 + 1))),
        originalKey,
        'original key disposition',
      );
    }
  };
  await store(settings);
  await press(0x82, ['a', 'b'], { originalKey: true });
  settings.keybindings.find((r) => r.id === 'condition-second').blockOriginalInput = true;
  settings.keybindingOptions.executionMode = 'first';
  await store(settings);
  await press(0x82, ['a'], { originalKey: false });
  settings.keybindingOptions.executionMode = 'all';
  await store(settings);
  await focusHost();
  await press(0x82, ['b'], { target: false });
  checks.push(
    'exe condition uses foreground target, matching-only OR blocking, first/all, dedup and host-local fallback',
  );
  await press(0x83, ['a'], { originalKey: false });
  settings.keybindingOptions.requireChromiumWindowClass = true;
  await store(settings);
  await press(0x83, [], { originalKey: true });
  await focusHost();
  await press(0x83, ['a'], { target: false });
  settings.keybindingOptions.requireChromiumWindowClass = false;
  settings.keybindingOptions.browsers = [];
  await store(settings);
  await press(0x83, [], { originalKey: true });
  settings.keybindingOptions.browsers = ['AppDock.InputTarget', hostProcessName];
  await store(settings);
  checks.push(
    'browser list and Chromium class independently control real Windows input without swallowing mismatches',
  );
  await press(0x84, [], { originalKey: true });
  await peer.request('desktop');
  assert.match((await peer.request('snapshot')).foregroundClass, /^(Progman|WorkerW)$/);
  await press(0x84, ['a'], { target: false });
  await press(0x85, [], { target: false });
  await press(0x85, ['a'], { originalKey: false });
  checks.push('actual desktop shortcut and global desktop exclusion, ordinary-window passthrough');

  await openShortcuts();
  await page.getByLabel('ショートカットキーのコマンドを検索').fill('test.hook.a');
  const dialog = () => page.locator('.applet-shortcut-dialog');
  const edit = async () => {
    await page.locator('[data-binding-id="condition-exe"] .applet-shortcut-edit').click();
    await dialog().getByText('押して入力', { exact: true }).waitFor();
  };
  await edit();
  const scope = () =>
    dialog().getByRole('combobox', { name: '割り当てのいつ・どこで', exact: true });
  assert.deepEqual(
    await scope()
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => o.value)),
    ['browser', 'exe', 'global', 'desktop', 'app', 'pages', 'owner', 'applets'],
  );
  await dialog()
    .getByRole('textbox', { name: '対象のexe名', exact: true })
    .fill('APPDOCK.INPUTTARGET.EXE, other.exe');
  await dialog().getByRole('textbox', { name: '対象のexe名', exact: true }).press('Enter');
  await dialog().getByRole('checkbox', { name: 'デスクトップを除外', exact: true }).check();
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 900, 700]) {
      await host.setViewportSize({ width, height: 900 });
      await host.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await dialog().scrollIntoViewIfNeeded();
      const rect = await dialog().boundingBox();
      assert(rect.width <= width && rect.height < 900);
      await host.screenshot({
        path: path.join(profile, `external-condition-${theme}-${width}.png`),
      });
    }
  await dialog().getByRole('button', { name: '適用', exact: true }).click();
  await settleSettings(host);
  const when = (await snapshot()).settings.value.keybindings.find(
    (r) => r.id === 'condition-exe',
  ).when;
  assert.deepEqual(when.processes, ['appdock.inputtarget', 'other']);
  assert.equal(when.excludeDesktop, true);
  await edit();
  assert.equal(await scope().inputValue(), 'exe');
  await dialog().getByRole('textbox', { name: '対象のexe名', exact: true }).fill('C:\\bad.exe');
  await dialog().getByRole('textbox', { name: '対象のexe名', exact: true }).press('Enter');
  assert.equal(
    await dialog().getByRole('button', { name: '適用', exact: true }).isEnabled(),
    false,
  );
  await dialog().getByRole('button', { name: '編集をキャンセル', exact: true }).click();
  const options = page.locator('[data-setting-item="shortcuts/options"]');
  if (!(await options.evaluate((e) => e.open))) await options.locator('summary').click();
  await page
    .getByRole('textbox', { name: 'Webブラウザのexe', exact: true })
    .fill('FIREFOX.EXE, AppDock.InputTarget');
  await page.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).press('Enter');
  await settleSettings(host);
  assert.deepEqual((await snapshot()).settings.value.keybindingOptions.browsers, [
    'firefox',
    'appdock.inputtarget',
  ]);
  assert.deepEqual((await snapshot()).settings.value.gestures.browsers, original.gestures.browsers);
  checks.push(
    'same condition controls, normalized exe editing, invalid draft cancellation and independent browser settings in both themes/three widths',
  );
  ({ host, page } = await context.restart());
  assert.deepEqual(
    (await snapshot()).settings.value.keybindings.find((r) => r.id === 'condition-exe').when,
    when,
  );
  assert.deepEqual((await snapshot()).settings.value.keybindingOptions.browsers, [
    'firefox',
    'appdock.inputtarget',
  ]);
  await press(0x82, ['a', 'b'], { originalKey: false });
  checks.push(
    'external conditions, desktop exclusion, browser settings and original-input policy survive full host restart',
  );
  await host.evaluate(async (value) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(value, s.settings.revision);
  }, original);
  fs.writeFileSync(
    path.join(profile, 'external-conditions.json'),
    JSON.stringify({ when, checks: checks.slice(-5) }, null, 2),
  );
};

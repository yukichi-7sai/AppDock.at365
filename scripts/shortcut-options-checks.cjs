const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');

module.exports = async function shortcutOptionsChecks(context) {
  let { app, dock } = context;
  const { profile, checks, until, calls, send, sendGlobal, expectCalls, nativeFocus } = context;
  const snapshot = () => dock.evaluate(() => window.dock.snapshot());
  const original = (await snapshot()).settings.value;
  const store = async (value) => {
    await dock.evaluate(async (value) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(value, s.settings.revision);
    }, value);
    await settleSettings(dock);
  };
  const open = async (id = 'shortcuts') => {
    await dock.evaluate((id) => window.dock.executeCommand(`appdock.settings.${id}.open`), id);
    await dock
      .getByRole('heading', {
        level: 1,
        name: id === 'shortcuts' ? 'ショートカットキー' : 'マウスジェスチャー',
        exact: true,
      })
      .waitFor();
  };
  const options = (id = 'shortcuts') => dock.locator(`[data-setting-item="${id}/options"]`);
  const field = () =>
    dock.getByRole('combobox', { name: '条件に一致したコマンドの実行方法', exact: true });
  const expand = async (id = 'shortcuts') => {
    if (!(await options(id).evaluate((e) => e.open))) await options(id).locator('summary').click();
  };
  const mode = async (value) => {
    await field().selectOption(value);
    await settleSettings(dock);
    assert.equal((await snapshot()).settings.value.keybindingOptions.executionMode, value);
  };
  const key = (id, command, scope, key = 'F18', appletIds = []) => ({
    id,
    command: `test.keys.${command}`,
    key,
    enabled: true,
    when: { scope, appletIds },
  });
  const setup = structuredClone(original);
  setup.keybindingOptions = { executionMode: 'all' };
  setup.keybindings = [
    key('miss', 'd', 'applets', 'F18', ['host:logs']),
    key('a', 'a', 'app'),
    key('duplicate', 'a', 'pages'),
    key('b', 'b', 'pages'),
    key('global', 'd', 'global', 'Ctrl+Alt+F10'),
    key('overlap', 'a', 'app', 'Ctrl+Alt+F10'),
  ];
  await store(setup);
  await open();
  assert.equal(await options().evaluate((e) => e.open), false);
  assert.equal(
    await dock
      .locator('.settings-categories')
      .getByRole('button', { name: 'ショートカットキー', exact: true })
      .count(),
    1,
  );
  await dock.getByRole('heading', { name: 'ショートカットキー割り当て', exact: true }).waitFor();
  await expand();
  assert.equal(await field().inputValue(), 'all');
  assert.deepEqual(await field().locator('option').allTextContents(), ['最初の1つ', 'すべて']);
  const hint = await dock
    .locator('[data-setting-item="shortcuts/executionMode"] .settings-hint-tooltip')
    .textContent();
  assert.equal(hint, '操作と「いつ・どこで」の条件に一致したコマンドを、登録順に選びます。');
  checks.push(
    'shortcut key titles, initially collapsed behavior settings and shared first/all choices',
  );

  await until(
    async () =>
      (await snapshot()).globalHotKeys.some((s) => s.shortcut === 'Ctrl+Alt+F10' && s.registered),
    'options global key registration',
  );
  for (const value of ['first', 'all']) {
    await open();
    await expand();
    await mode(value);
    assert.equal(
      (await snapshot()).settings.value.gestures.executionMode,
      original.gestures.executionMode,
    );
    const saved = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'));
    assert.equal(saved.keybindingOptions?.executionMode ?? 'all', value);
    await nativeFocus('appdock://host/index.html');
    let before = calls().length;
    await sendGlobal();
    await expectCalls(before, value === 'first' ? ['d'] : ['d', 'a']);
    before = calls().length;
    await send('appdock://host/index.html', 'F18', []);
    await expectCalls(before, value === 'first' ? ['a'] : ['a', 'b']);
    await dock.evaluate(() => window.dock.executeCommand('test.keys.open'));
    await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().endsWith('/test.keys/index.html')),
      'options local page',
    );
    before = calls().length;
    await send('/test.keys/index.html', 'F18', []);
    await expectCalls(before, value === 'first' ? ['a'] : ['a', 'b']);
  }
  checks.push(
    'first/all from real Windows global keys and Chromium host/PageHost input, condition filtering and dedup',
  );
  await open('gestures');
  await expand('gestures');
  assert.equal(
    await dock
      .locator('[data-setting-item="gestures/executionMode"] .settings-hint-tooltip')
      .textContent(),
    hint,
  );
  assert.deepEqual(await field().locator('option').allTextContents(), ['最初の1つ', 'すべて']);
  await field().selectOption(original.gestures.executionMode === 'first' ? 'all' : 'first');
  await settleSettings(dock);
  assert.equal((await snapshot()).settings.value.keybindingOptions.executionMode, 'all');
  const independentGesture = (await snapshot()).settings.value.gestures.executionMode;
  await open();
  await dock.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = dock.getByRole('textbox', { name: '設定JSON', exact: true });
  const projected = JSON.parse(await json.inputValue());
  projected.keybindingOptions = { executionMode: 'first' };
  await json.fill(JSON.stringify(projected, null, 2));
  await json.press('Enter');
  await settleSettings(dock);
  assert.equal((await snapshot()).settings.value.keybindingOptions.executionMode, 'first');
  await dock.getByRole('button', { name: 'フォーム', exact: true }).click();
  await expand();
  assert.equal(await field().inputValue(), 'first');
  const external = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'));
  external.keybindingOptions = { executionMode: 'all' };
  fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(external));
  await until(
    async () => (await snapshot()).settings.value.keybindingOptions.executionMode === 'all',
    'external mode reload',
  );
  await until(async () => (await field().inputValue()) === 'all', 'external mode UI');
  await mode('first');
  ({ app, dock } = await context.restart());
  await open();
  await expand();
  assert.equal(await field().inputValue(), 'first');
  assert.equal((await snapshot()).settings.value.gestures.executionMode, independentGesture);
  checks.push(
    'independent gesture option, scoped JSON editing, external file reload and restart persistence',
  );
  await dock.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  await dock.getByRole('dialog').getByRole('button', { name: '既定値に戻す', exact: true }).click();
  await settleSettings(dock);
  await expand();
  assert.equal(await field().inputValue(), 'all');
  assert.equal((await snapshot()).settings.value.gestures.executionMode, independentGesture);
  checks.push('page reset restores shortcut all without changing gesture behavior');

  const geometry = [];
  for (const theme of ['light', 'dark']) {
    const value = (await snapshot()).settings.value;
    value.host.theme = theme;
    await store(value);
    for (const width of [1280, 900, 700]) {
      const page = await settingsPage(dock);
      await app.evaluate(
        ({ BrowserWindow, webContents }, { url, width }) => {
          const wc = webContents.getAllWebContents().find((w) => w.getURL() === url);
          const contains = (v) => v.webContents === wc || (v.children ?? []).some(contains);
          const window = BrowserWindow.getAllWindows().find(
            (w) => w.webContents === wc || contains(w.contentView),
          );
          window.setMinimumSize(0, 0);
          window.setSize(width, 900);
        },
        { url: page.url(), width },
      );
      await field().scrollIntoViewIfNeeded();
      const sectionGap = await page.locator('.settings-form').evaluate((e) => {
        const options = e.querySelector('[data-setting-item="shortcuts/options"]');
        const assignments = e.querySelector('[data-setting-item="shortcuts/keybindings"]');
        return assignments.getBoundingClientRect().top - options.getBoundingClientRect().bottom;
      });
      assert(sectionGap >= 19 && sectionGap <= 21, 'shared section gap: ' + sectionGap);
      const measured = await field().evaluate((e) => ({
        left: e.getBoundingClientRect().left,
        right: e.getBoundingClientRect().right,
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(measured.width <= width, 'requested test width must not be clamped by Window minimum');
      assert(
        measured.left >= 0 &&
          measured.right <= measured.width + 1 &&
          measured.scroll <= measured.width + 1,
        JSON.stringify(measured),
      );
      geometry.push({ theme, requestedWidth: width, sectionGap, ...measured });
      await page.screenshot({ path: path.join(profile, `shortcut-options-${theme}-${width}.png`) });
    }
  }
  fs.writeFileSync(
    path.join(profile, 'shortcut-options-geometry.json'),
    JSON.stringify(geometry, null, 2),
  );
  await store(original);
  checks.push('shared behavior field in light/dark themes at 1280, 900 and 700 pixels');
};

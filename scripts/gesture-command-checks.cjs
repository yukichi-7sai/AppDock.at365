const { settleSettings } = require('./settings-immediate-helper.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async ({ page, host, profile, checks, calls, send, until }) => {
  const snapshot = () => host.evaluate(() => window.dock.snapshot());
  const options = page.locator('.gesture-settings-section');
  assert(
    await options.evaluate(
      (el) =>
        el === el.parentElement.firstElementChild &&
        el.nextElementSibling?.matches('.gestures-editor') &&
        !el.closest('.gestures-editor') &&
        getComputedStyle(el.closest('.settings-panel')).borderTopWidth === '0px',
    ),
    'behavior settings are first and outside the command list frame',
  );
  assert.equal(await options.getAttribute('open'), null, 'behavior settings start collapsed');
  const filter = page.getByLabel('ジェスチャーのコマンドを検索');
  const status = page.getByLabel('ジェスチャーの絞り込み');
  const bindingStyles = async () => {
    await page.mouse.move(0, 0);
    await filter.focus();
    const styles = await page.locator('.shortcut-command-list').evaluate((root) => {
      const add = root.querySelector('.applet-shortcut-add');
      const edit = root.querySelector('.applet-shortcut-edit');
      const menu = root.querySelector('.gesture-menu-trigger');
      return {
        addWidth: add.getBoundingClientRect().width,
        addHeight: add.getBoundingClientRect().height,
        addPadding: getComputedStyle(add).padding,
        editBackground: getComputedStyle(edit).backgroundColor,
        editBorder: getComputedStyle(edit).borderLeftWidth,
        editPaddingLeft: getComputedStyle(edit).paddingLeft,
        menuBackground: getComputedStyle(menu).backgroundColor,
        menuFontSize: getComputedStyle(menu).fontSize,
      };
    });
    assert.deepEqual(
      styles,
      {
        addWidth: 30,
        addHeight: 30,
        addPadding: '0px',
        editBackground: 'rgba(0, 0, 0, 0)',
        editBorder: '0px',
        editPaddingLeft: '0px',
        menuBackground: 'rgba(0, 0, 0, 0)',
        menuFontSize: '22px',
      },
      'assignment controls retain their dedicated styles inside the section',
    );
  };
  await bindingStyles();
  const row = (id) => page.locator(`[data-shortcut-command="${id}"]`);
  const panel = page.locator('.gesture-binding-dialog');
  const orderPanel = page.locator('.shortcut-order-dialog');
  const orderIds = () =>
    orderPanel
      .locator('[data-order-binding]')
      .evaluateAll((items) => items.map((el) => el.dataset.orderBinding));
  const saved = () => snapshot().then((s) => s.settings.value.gestures.bindings);
  const save = async () => {
    await settleSettings(page);
  };
  const add = async (id) => {
    await filter.fill(id);
    await row(id)
      .getByRole('button', { name: /に割り当てを追加/ })
      .click();
    await panel.waitFor();
  };
  const apply = async (adding = false) => {
    await panel.getByRole('button', { name: adding ? '追加' : '適用', exact: true }).click();
    await panel.waitFor({ state: 'hidden' });
  };
  const choose = async (family, input) => {
    await panel
      .getByRole('group', { name: 'ジェスチャーの種類', exact: true })
      .getByRole('button', { name: family, exact: true })
      .click();
    if (input)
      await panel
        .getByRole('group', { name: 'ジェスチャーの操作', exact: true })
        .getByRole('button', { name: input, exact: true })
        .click();
  };
  const menu = async (binding) => {
    await page
      .locator(`[data-binding-id="${binding}"]`)
      .getByRole('button', { name: /その他の操作/ })
      .click();
  };
  const before = await saved();
  const keysBefore = (await snapshot()).settings.value.keybindings;
  const callsBefore = calls().length;
  await filter.fill('test.gestures');
  assert.deepEqual(
    (
      await page
        .locator('[data-shortcut-command]')
        .evaluateAll((rows) => rows.map((row) => row.dataset.shortcutCommand))
    ).sort(),
    [
      'test.gestures.open',
      'test.gestures.a',
      'test.gestures.b',
      'test.gestures.c',
      ...['enable', 'disable', 'restart'].map(
        (action) => `appdock.applets.test.gestures.${action}`,
      ),
    ].sort(),
  );
  assert.match(await row('test.gestures.c').innerText(), /未割り当て/);
  await add('test.gestures.b');
  assert.equal(await panel.getByLabel('割り当てのいつ・どこで').inputValue(), 'owner');
  if (send) {
    await send('key:Ctrl+A');
    assert.equal(calls().length, callsBefore, 'gesture commands are suspended throughout editor');
  }
  await panel.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert(
    await row('test.gestures.b')
      .locator('.applet-shortcut-add')
      .evaluate((el) => el === document.activeElement),
  );
  assert.deepEqual(await saved(), before);
  assert.equal(
    await page.getByRole('button', { name: '変更をすべて保存', exact: true }).count(),
    0,
  );
  await add('test.gestures.b');
  await choose('移動', '左');
  await panel.getByLabel('割り当てのいつ・どこで').selectOption('browser');
  await apply(true);
  await save();
  assert.equal((await saved()).length, before.length + 1, 'panel saves immediately');
  assert.equal(await filter.inputValue(), 'test.gestures.b');
  await add('test.gestures.a');
  await choose('移動', '左');
  await panel.getByLabel('割り当てのいつ・どこで').selectOption('exe');
  assert(await panel.getByRole('button', { name: '追加', exact: true }).isDisabled());
  await panel.getByLabel('対象のexe名').fill('C:\\Windows\\notepad.exe');
  assert(await panel.getByRole('button', { name: '追加', exact: true }).isDisabled());
  await panel.getByLabel('対象のexe名').fill('NOTEPAD.exe, explorer');
  await apply(true);
  await save();
  let rows = await saved();
  const a = rows.find((r) => r.command === 'test.gestures.a' && r.gesture === 'move-left').id;
  const b = rows.find((r) => r.command === 'test.gestures.b').id;
  assert.deepEqual(rows.find((r) => r.id === a).when.processes, ['notepad', 'explorer']);
  assert.equal(calls().length, callsBefore);
  checks.push(
    'flat full catalog / unassigned / cancel and focus / direct addition to saved settings / browser and validated exe conditions / no command execution',
  );

  await filter.fill('test.gestures.b');
  await menu(b);
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
    '編集',
    'このジェスチャーの実行順…',
    '削除',
  ]);
  await page.getByRole('menuitem', { name: 'このジェスチャーの実行順…', exact: true }).click();
  assert.deepEqual(await orderIds(), [b, a], 'full gesture group despite filtered command list');
  await orderPanel
    .locator(`[data-order-binding="${a}"] .shortcut-order-handle`)
    .dragTo(orderPanel.locator(`[data-order-binding="${b}"]`));
  assert.deepEqual(await orderIds(), [a, b]);
  await orderPanel.screenshot({ path: path.join(profile, 'gesture-order.png') });
  await orderPanel.getByLabel('実行順を変更するジェスチャー').selectOption('key:Ctrl+A');
  assert.equal((await orderIds()).length, 1);
  await orderPanel.getByLabel('実行順を変更するジェスチャー').selectOption('move-left');
  assert.deepEqual(await orderIds(), [a, b]);
  await orderPanel
    .locator(`[data-order-binding="${a}"] .shortcut-order-handle`)
    .press('Alt+ArrowDown');
  assert.deepEqual(await orderIds(), [b, a]);
  await orderPanel
    .locator(`[data-order-binding="${a}"]`)
    .getByRole('button', { name: /を上へ/ })
    .click();
  await orderPanel.getByRole('button', { name: '適用', exact: true }).click();
  await save();
  rows = await saved();
  assert.deepEqual(
    rows.map((r) => r.id),
    ['key', a, b],
  );
  assert.deepEqual((await snapshot()).settings.value.keybindings, keysBefore);
  checks.push(
    'separate order panel / full gesture group / drag, arrows and Alt+arrows / key selection retains pending order / unrelated shortcut bindings unchanged',
  );
  await page
    .locator('.command-shortcut-summary')
    .screenshot({ path: path.join(profile, 'gesture-order-button.png') });
  await page.getByRole('button', { name: '実行順…', exact: true }).click();
  await orderPanel.getByRole('heading', { name: 'ジェスチャーの実行順', exact: true }).waitFor();
  await orderPanel.getByRole('button', { name: 'キャンセル', exact: true }).click();

  await filter.fill('test.gestures.a');
  await page.locator(`[data-binding-id="${a}"] .applet-shortcut-edit`).click();
  await panel.getByRole('switch').click();
  await apply();
  await save();
  assert.deepEqual(
    (await saved()).map((r) => r.id),
    ['key', a, b],
  );
  assert.equal((await saved()).find((r) => r.id === a).enabled, false);
  await menu(a);
  await page.getByRole('menuitem', { name: '削除', exact: true }).click();
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await page.locator(`[data-binding-id="${a}"]`).count(), 0);
  await save();
  await filter.fill('test.gestures.b');
  await page.locator(`[data-binding-id="${b}"] .applet-shortcut-edit`).click();
  await choose('ホイール', 'ホイール下');
  await choose('クリック', '中クリック');
  await choose('キーボード');
  assert(await panel.getByRole('button', { name: '適用', exact: true }).isDisabled());
  await panel.getByLabel('ジェスチャーのキーを入力').press('Control+K');
  await panel.getByRole('button', { name: /特殊キーから選ぶ/ }).click();
  const modifiers = panel.getByRole('group', { name: '特殊キーの修飾キー' });
  if (
    !(
      (await modifiers
        .getByRole('button', { name: 'Ctrl', exact: true })
        .getAttribute('aria-pressed')) === 'true'
    )
  )
    await modifiers.getByRole('button', { name: 'Ctrl', exact: true }).click();
  await panel.getByRole('button', { name: 'Tab', exact: true }).click();
  await panel.getByLabel('割り当てのいつ・どこで').selectOption('applets');
  assert(await panel.getByRole('button', { name: '適用', exact: true }).isDisabled());
  await panel.getByRole('checkbox', { name: 'ジェスチャー検証', exact: true }).check();
  await apply();
  await save();
  assert.equal((await saved()).find((r) => r.id === b).gesture, 'key:Ctrl+Tab');
  assert.deepEqual((await saved()).find((r) => r.id === b).when.appletIds, ['test.gestures']);
  checks.push(
    'condition-only edit retains order / immediate deletion / all input families / modified special key / required target Applet',
  );

  // An external writer must not be overwritten by either editing panel.
  await page.locator(`[data-binding-id="${b}"] .applet-shortcut-edit`).click();
  await host.evaluate(async (id) => {
    const s = await window.dock.snapshot();
    s.settings.value.gestures.bindings.find((r) => r.id === id).enabled = false;
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  }, b);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-binding-id="${id}"]`)?.textContent.includes('無効'),
    b,
  );
  await panel.getByRole('button', { name: '適用', exact: true }).click();
  assert.match(await panel.getByRole('alert').innerText(), /変更されました/);
  await panel.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push('editing refuses concurrent changes to the same assignment');

  await add('appdock.settings.open');
  assert.equal(await panel.getByLabel('割り当てのいつ・どこで').inputValue(), 'app');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 760 });
      await choose('移動', '右');
      assert(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth));
      const bounds = await panel.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 720);
      await page.screenshot({ path: path.join(profile, `${theme}-${width}-gesture-editor.png`) });
    }
  }
  await panel.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await filter.fill('');
  await status.selectOption('unassigned');
  assert.match(await row('test.gestures.c').innerText(), /未割り当て/);
  await status.selectOption('assigned');
  assert.equal(await row('test.gestures.c').count(), 0);
  await status.selectOption('all');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 760 });
      assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
      const search = await filter.boundingBox(),
        select = await status.boundingBox();
      assert(Math.abs(search.y - select.y) < 1);
      await bindingStyles();
      await page.screenshot({ path: path.join(profile, `${theme}-${width}-gestures.png`) });
      await row('test.gestures.b').screenshot({
        path: path.join(profile, `${theme}-${width}-gesture-assigned-row.png`),
      });
    }
  }
  checks.push(
    'host defaults / assignment filters / both themes at 1280, 900, 700 / bounded editor and matching toolbar / dedicated assignment button styles',
  );
  await page.locator('summary').filter({ hasText: '動作設定' }).click();
  assert.deepEqual(await options.locator('.settings-field-label > strong').allTextContents(), [
    'マウスジェスチャーを有効にする',
    '条件に一致したコマンドの実行方法',
    '操作感',
    '待機表示',
    'Webブラウザ',
    '除外',
  ]);
  assert.equal(await page.getByLabel('条件に一致したコマンドの実行方法').inputValue(), 'all');
  const bindingsBeforeOptions = await saved();
  const enabled = page.getByRole('switch', { name: 'マウスジェスチャーを有効にする', exact: true });
  await enabled.click();
  await save();
  assert.equal((await snapshot()).settings.value.gestures.enabled, false);
  assert.deepEqual(await saved(), bindingsBeforeOptions);
  await enabled.click();
  await page.getByLabel('条件に一致したコマンドの実行方法').selectOption('first');
  const opacity = page.getByLabel('不透明度', { exact: true });
  await opacity.fill('0.65');
  await page.getByLabel('表示位置', { exact: true }).selectOption('none');
  assert(await opacity.isDisabled());
  await save();
  assert.equal((await snapshot()).settings.value.gestures.indicatorOpacity, 0.65);
  await page.getByLabel('表示位置', { exact: true }).selectOption('window-center');
  assert(await opacity.isEnabled());
  assert.equal(await opacity.inputValue(), '0.65');
  await page.getByLabel('表示位置', { exact: true }).selectOption('none');
  await page.getByLabel('Webブラウザのexe', { exact: true }).fill('firefox.exe, msedge.exe');
  await page.getByLabel('移動距離（px）').fill('70');
  await save();
  const state = (await snapshot()).settings.value;
  assert.equal(state.gestures.distance, 70);
  assert.deepEqual(state.gestures.browsers, ['firefox', 'msedge']);
  assert.equal(state.gestures.executionMode, 'first');
  assert.equal(state.gestures.indicatorPosition, 'none');
  assert.equal(state.gestures.enabled, true);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await options.evaluate((el) => el.scrollWidth <= el.clientWidth));
      assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
      await options.locator('summary').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({
        path: path.join(profile, `${theme}-${width}-gesture-options.png`),
        fullPage: true,
      });
    }
  }
  checks.push(
    'top collapsed behavior settings / grouped layout / enabled move / first-all mode / hidden display and retained opacity / both themes at three widths',
  );
  await page.locator('summary').filter({ hasText: '動作設定' }).click();
  const persisted = structuredClone(state.gestures);
  await host.reload();
  await host.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
  assert.deepEqual((await snapshot()).settings.value.gestures, persisted);
  checks.push('global tuning and all assignments persist across renderer reload');
};

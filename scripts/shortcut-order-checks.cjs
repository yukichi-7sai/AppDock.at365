const { settleSettings } = require('./settings-immediate-helper.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async ({ page, snapshot, save, profile, checks }) => {
  const original = structuredClone((await snapshot()).settings.value.keybindings);
  const panel = page.locator('.shortcut-order-dialog');
  const filter = page.getByLabel('ショートカットのコマンドを検索');
  const openTop = () => page.getByRole('button', { name: '実行順…', exact: true }).click();
  await page
    .locator('.command-shortcut-summary')
    .screenshot({ path: path.join(profile, 'shortcut-order-button.png') });
  const order = () =>
    panel
      .locator('[data-order-binding]')
      .evaluateAll((items) => items.map((item) => item.dataset.orderBinding));
  const item = (id) => panel.locator(`[data-order-binding="${id}"]`);
  const cancel = () => panel.getByRole('button', { name: 'キャンセル', exact: true }).click();
  const apply = () => panel.getByRole('button', { name: '適用', exact: true }).click();
  const choose = (key) => panel.getByLabel('実行順を変更するキー').selectOption(key);
  const write = async (rows) => {
    await page.evaluate(async (rows) => {
      const s = await window.dock.snapshot();
      s.settings.value.keybindings = rows;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, rows);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const ready = await page.locator('.shortcuts-editor').evaluate((root, rows) => {
        const rendered = Array.from(root.querySelectorAll('[data-binding-id]'));
        return (
          rendered.length === rows.length &&
          rows.every((row) => {
            const el = rendered.find((el) => el.dataset.bindingId === row.id);
            return el && el.textContent.includes('無効') === !row.enabled;
          })
        );
      }, rows);
      if (ready) return;
      await page.waitForTimeout(50);
    }
    throw Error('Shortcut model did not reflect external write');
  };
  const fromMenu = async (id) => {
    await page
      .locator(`[data-binding-id="${id}"]`)
      .getByRole('button', { name: /その他の操作/ })
      .click();
    await page.getByRole('menuitem', { name: 'このキーの実行順…', exact: true }).click();
    await panel.waitFor();
  };
  await filter.fill('test.a.second');
  await fromMenu('a2');
  assert.deepEqual(await order(), ['b1', 'a2']);
  assert.match(await item('b1').innerText(), /UI B/);
  assert(
    await item('b1')
      .getByRole('button', { name: /を上へ/ })
      .isDisabled(),
  );
  await item('a2').locator('.shortcut-order-handle').dragTo(item('b1'));
  assert.deepEqual(await order(), ['a2', 'b1']);
  await panel.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert.deepEqual((await snapshot()).settings.value.keybindings, original);
  assert.equal(await filter.inputValue(), 'test.a.second');
  assert(
    await page
      .locator('[data-binding-id="a2"] .gesture-menu-trigger')
      .evaluate((el) => el === document.activeElement),
  );
  assert.equal(
    await page.getByRole('button', { name: '変更をすべて保存', exact: true }).count(),
    0,
  );
  await openTop();
  await item('a2')
    .getByRole('button', { name: /を上へ/ })
    .click();
  await choose('Ctrl+Alt+F10');
  assert.deepEqual(await order(), ['a1']);
  assert(
    await item('a1')
      .getByRole('button', { name: /を下へ/ })
      .isDisabled(),
  );
  await choose('Ctrl+F8');
  assert.deepEqual(await order(), ['a2', 'b1']);
  await apply();
  await save();
  await save();
  assert.deepEqual(
    (await snapshot()).settings.value.keybindings.map((r) => r.id),
    ['a1', 'a2', 'b1'],
  );
  // The Applet entry must include other providers, not just this Applet's catalog.
  await page.getByRole('button', { name: 'Applet管理', exact: true }).click();
  await page
    .locator('[data-applet-id="test.a"]')
    .getByRole('button', { name: 'UI Aのショートカットを開く', exact: true })
    .click();
  await fromMenu('a2');
  assert.match(await item('b1').innerText(), /B first[\s\S]*UI B/);
  await item('a2').locator('.shortcut-order-handle').press('Alt+ArrowDown');
  await apply();
  await save();
  assert.deepEqual((await snapshot()).settings.value.keybindings, original);
  await page.getByRole('button', { name: 'UI Aの絞り込みを解除', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page
    .locator('.settings-categories')
    .getByRole('button', { name: 'ショートカット', exact: true })
    .click();
  await filter.fill('');
  const extra = [
    ...original,
    { ...original[1], id: 'order.disabled', enabled: false, command: 'missing.command' },
    { ...original[1], id: 'order.other', key: 'F2' },
    { ...original[2], id: 'order.other2', key: 'F2' },
  ];
  await write(extra);
  await page.locator('[data-binding-id="order.disabled"]').waitFor();
  await openTop();
  await choose('Ctrl+F8');
  assert.match(await item('order.disabled').innerText(), /未確認のコマンド[\s\S]*無効/);
  await item('a2')
    .getByRole('button', { name: /を上へ/ })
    .click();
  await choose('F2');
  await item('order.other2')
    .getByRole('button', { name: /を上へ/ })
    .click();
  await choose('Ctrl+F8');
  const external = structuredClone(extra);
  external.find((r) => r.id === 'a1').enabled = false;
  await write(external);
  await apply();
  await save();
  const merged = (await snapshot()).settings.value.keybindings;
  assert.deepEqual(
    merged.map((r) => r.id),
    ['a1', 'a2', 'b1', 'order.disabled', 'order.other2', 'order.other'],
  );
  assert.equal(merged[0].enabled, false);
  await openTop();
  await choose('Ctrl+F8');
  await item('b1')
    .getByRole('button', { name: /を上へ/ })
    .click();
  const conflict = structuredClone(merged);
  conflict.find((r) => r.id === 'b1').enabled = false;
  await write(conflict);
  await apply();
  await panel.getByRole('alert').filter({ hasText: '割り当てが変更されました' }).waitFor();
  await cancel();
  assert.deepEqual((await snapshot()).settings.value.keybindings, conflict);
  await write(original);
  await openTop();
  await choose('Ctrl+F8');
  const setTheme = async (theme) => {
    await page.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.host.theme = theme;
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    }, theme);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (
        await panel.evaluate(
          (el, theme) => el.ownerDocument.documentElement.dataset.theme === theme,
          theme,
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Order dialog theme did not update');
  };
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 760 });
      const bounds = await panel.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 760);
      assert(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await panel.screenshot({ path: path.join(profile, `${theme}-${width}-shortcut-order.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await setTheme('dark');
  await cancel();
  await write([
    ...original,
    ...Array.from({ length: 20 }, (_, index) => ({ ...original[1], id: `order.long.${index}` })),
  ]);
  await openTop();
  await choose('Ctrl+F8');
  await page.setViewportSize({ width: 700, height: 540 });
  assert(
    await panel.locator('.shortcut-order-list').evaluate((el) => el.scrollHeight > el.clientHeight),
  );
  const footer = await panel.locator('footer').boundingBox();
  assert(footer.y + footer.height <= 540, 'long groups keep apply/cancel visible');
  await panel.screenshot({ path: path.join(profile, 'shortcut-order-long.png') });
  await cancel();
  await page.setViewportSize({ width: 1280, height: 840 });
  await write([]);
  await openTop();
  assert(await panel.getByLabel('実行順を変更するキー').isDisabled());
  assert(await panel.getByRole('button', { name: '適用', exact: true }).isDisabled());
  await cancel();
  await write(original);
  checks.push(
    'order dialog: full same-key group from filtered settings and Applet / drag, arrows and keyboard / cancel and focus / multi-key draft apply / other-key merge and stale-group rejection / empty and single groups / both themes and three widths',
  );
};

const assert = require('node:assert/strict');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
exports.fixture = [
  { id: 'accessibility', name: 'Lucide: Accessibility' },
  { id: 'test-a', name: 'Test: TestA' },
  { id: 'animals', name: 'Lucide: Animals' },
  { id: 'other', name: '別のグループ' },
  { id: 'test-b', name: 'Test: TestB' },
];
exports.check = async ({ host, saved, checks, profile }) => {
  const results = [];
  for (const media of ['image', 'sound', 'text']) {
    await host.setViewportSize({ width: 1720, height: 1000 });
    await host.evaluate(
      async (theme) => {
        const s = await window.dock.snapshot();
        s.settings.value.host.theme = theme;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      },
      media === 'image' ? 'light' : 'dark',
    );
    await settleSettings(host);
    const property = media + 'Library',
      before = (await saved())[property].groups;
    const dialog = host.locator('.settings-order-dialog');
    const button = (name) => dialog.getByRole('button', { name, exact: true });
    const group = (name) =>
      dialog
        .locator('[data-order-group]')
        .filter({ has: host.getByRole('button', { name, exact: true }) });
    const handle = (id) => dialog.getByTestId('settings-order-handle:' + id);
    const order = () =>
      dialog.locator('[data-order-id]').evaluateAll((es) => es.map((e) => e.dataset.orderId));
    const open = async () => {
      await host.evaluate(async (route) => {
        if ((await window.dock.snapshot()).navigation.route !== route)
          await window.dock.navigate(route);
      }, media + '-library');
      await host
        .locator(`.library-page[data-media="${media}"]`)
        .getByRole('button', { name: '並べ替え', exact: true })
        .click();
      await dialog.waitFor();
      assert.equal(await button('Lucide').getAttribute('aria-expanded'), 'false');
      assert.equal(await button('Test').getAttribute('aria-expanded'), 'false');
    };
    const cancel = () => dialog.getByTestId('settings-dialog-cancel').click();
    const apply = async () => {
      await dialog.getByTestId('settings-dialog-confirm').click();
      await dialog.waitFor({ state: 'hidden' });
      await settleSettings(host);
    };
    await open();
    assert.deepEqual(await order(), ['accessibility', 'animals', 'test-a', 'test-b', 'other']);
    assert.equal(await dialog.locator('[data-order-id]:visible').count(), 1);
    await button('すべて展開').click();
    assert.equal(await dialog.locator('[data-order-id]:visible').count(), 5);
    await button('すべて折りたたむ').click();
    assert.equal(await dialog.locator('[data-order-id]:visible').count(), 1);
    await apply();
    assert.deepEqual(
      (await saved())[property].groups,
      before,
      'fold-only OK preserves stored interleaving',
    );
    await open();
    await button('Testグループ全体を上へ').click();
    assert.deepEqual(await order(), ['test-a', 'test-b', 'accessibility', 'animals', 'other']);
    assert.equal(await button('Test').getAttribute('aria-expanded'), 'false');
    assert.match(
      await dialog.locator('.settings-status-area .settings-error-summary').innerText(),
      /Test.*2項目.*まとめて移動/,
    );
    assert(
      await dialog
        .getByTestId('settings-order-group-handle:Test')
        .evaluate((el) => el === document.activeElement),
    );
    assert.deepEqual((await saved())[property].groups, before);
    await cancel();
    assert.deepEqual((await saved())[property].groups, before);
    await open();
    await button('Testグループ全体を上へ').click();
    await button('Testグループ全体を下へ').click();
    await apply();
    assert.deepEqual((await saved())[property].groups, before, 'restoring visual order is a no-op');
    await open();
    await dialog
      .getByTestId('settings-order-group-handle:Test')
      .dragTo(group('Lucide').locator('.settings-order-group-heading'), {
        targetPosition: { x: 100, y: 3 },
      });
    assert.deepEqual(await order(), ['test-a', 'test-b', 'accessibility', 'animals', 'other']);
    await button('すべて展開').click();
    await handle('test-b').dragTo(dialog.locator('[data-order-id="animals"]'), {
      targetPosition: { x: 80, y: 3 },
    });
    assert.deepEqual(
      await order(),
      ['test-a', 'test-b', 'accessibility', 'animals', 'other'],
      'reject reparenting',
    );
    await handle('test-b').dragTo(dialog.locator('[data-order-id="test-a"]'), {
      targetPosition: { x: 80, y: 3 },
    });
    await handle('animals').press('ArrowUp');
    await handle('animals').press('ArrowUp');
    const expected = ['test-b', 'test-a', 'animals', 'accessibility', 'other'];
    assert.deepEqual(await order(), expected, 'inner moves stay within their parent');
    await button('操作メッセージの詳細').hover();
    await dialog.locator('.settings-error-tooltip:popover-open').waitFor();
    await host.keyboard.press('Escape');
    await handle('animals').focus();
    await button('操作メッセージの詳細').focus();
    await dialog.locator('.settings-error-tooltip:popover-open').waitFor();
    await host.keyboard.press('Escape');
    await button('操作メッセージの詳細').click();
    await dialog.locator('.settings-error-tooltip:popover-open').waitFor();
    await host.keyboard.press('Escape');
    assert(await dialog.isVisible(), 'Escape closes message details first');
    if (media === 'image')
      await dialog.screenshot({ path: path.join(profile, 'grouped-order-expanded.png') });
    await apply();
    const after = (await saved())[property].groups;
    assert.deepEqual(
      after.map((g) => g.id),
      expected,
    );
    for (const row of before)
      assert.deepEqual(
        after.find((g) => g.id === row.id),
        row,
      );
    await open();
    assert.deepEqual(await order(), expected);
    await button('Lucideグループ全体を上へ').click();
    const rename = (name) =>
      host.evaluate(
        async ({ property, name }) => {
          const s = await window.dock.snapshot();
          s.settings.value[property].groups.find((g) => g.id === 'animals').name = name;
          await window.dock.saveSettings(s.settings.value, s.settings.revision);
        },
        { property, name },
      );
    await rename('Renamed: Animals');
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.locator('.settings-error[data-error="true"]').waitFor();
    assert.deepEqual(
      (await saved())[property].groups.map((g) => g.id),
      expected,
    );
    assert.equal(
      (await saved())[property].groups.find((g) => g.id === 'animals').name,
      'Renamed: Animals',
    );
    assert.equal(await dialog.locator('.settings-error[data-message="true"]').count(), 0);
    if (media === 'text') await host.setViewportSize({ width: 900, height: 620 });
    await dialog.screenshot({ path: path.join(profile, `grouped-order-conflict-${media}.png`) });
    await cancel();
    await rename('Lucide: Animals');
    await settleSettings(host);
    await open();
    assert(await button('すべて展開').isVisible());
    await host.setViewportSize({ width: 900, height: 620 });
    assert(await dialog.getByTestId('settings-dialog-confirm').isVisible());
    assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    if (media === 'text')
      await dialog.screenshot({ path: path.join(profile, 'grouped-order-collapsed-narrow.png') });
    await cancel();
    results.push({ property, ids: expected });
    checks.push(
      media +
        ': initially collapsed/reopen, first occurrence, no-op/fold/cancel, block/child drag, fixed membership, keys, message icon hover/focus/click, rename conflict, save/reopen',
    );
  }
  return results;
};

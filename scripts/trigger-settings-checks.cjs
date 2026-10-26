const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ host, saved, save, checks, profile, row }) => {
  const panel = host.getByTestId('settings-dialog');
  const mode = panel.getByTestId('binding-execution-mode');
  const item = (id) => panel.locator(`[data-order-binding="${id}"]`);
  const handle = (id) => item(id).locator('.shortcut-order-handle');
  const order = () =>
    panel
      .locator('[data-order-binding]')
      .evaluateAll((elements) => elements.map((element) => element.dataset.orderBinding));
  const alignedHint = async () => {
    const heading = await panel.locator('header h2').boundingBox();
    const hint = await panel.locator('header .settings-hint-trigger svg').boundingBox();
    assert(Math.abs(heading.y + heading.height / 2 - hint.y - hint.height / 2) < 1);
  };
  const stableModeHeight = async () => {
    const initial = await mode.inputValue();
    await mode.selectOption('inherit');
    const inherited = await panel.getByTestId('binding-execution-field').boundingBox();
    for (const value of ['first', 'all', 'inherit']) {
      await mode.selectOption(value);
      const bounds = await panel.getByTestId('binding-execution-field').boundingBox();
      assert.equal(bounds.height, inherited.height);
      assert.equal(bounds.y, inherited.y);
      assert.equal(
        await panel.locator('.gesture-settings-inherited-mode').isVisible(),
        value === 'inherit',
      );
    }
    await mode.selectOption(initial);
  };
  const apply = async () => {
    await panel.getByTestId('settings-dialog-confirm').click();
    await save();
  };
  const cancel = () => panel.getByTestId('settings-dialog-cancel').click();
  const open = async (kind) => {
    await row(kind, 'same-id').locator('.binding-condition-cell').hover();
    await row(kind, 'same-id').locator('.binding-order').click();
    await panel.getByRole('heading', { name: 'トリガーの設定', exact: true }).waitFor();
  };
  const original = await saved();
  for (const [kind, store, input] of [
    ['shortcuts', 'keybindingOptions', 'Ctrl+F8'],
    ['gestures', 'gestures', 'move-up'],
    ['touchpad-gestures', 'touchpadGestures', 'four.right'],
  ]) {
    await open(kind);
    assert.equal(await mode.inputValue(), 'inherit');
    assert.deepEqual(await mode.locator('option').allTextContents(), [
      'ジェスチャーの設定を使用する',
      '最初の1つ',
      'すべて',
    ]);
    assert.match(await panel.innerText(), /ジェスチャーの現在の設定: すべて/);
    assert.match(
      await panel.innerText(),
      /このトリガーに割り当てられたコマンドの実行方法と順番を設定します。/,
    );
    assert.equal(await panel.locator('.shortcut-order-moves').count(), 0);
    await alignedHint();
    await stableModeHeight();
    const originalOrder = await order();
    await handle('same-id').press('ArrowUp');
    assert.deepEqual(await order(), originalOrder, 'first item cannot move above the boundary');
    for (const modifier of ['altKey', 'ctrlKey', 'shiftKey', 'metaKey']) {
      await handle('same-id').dispatchEvent('keydown', { key: 'ArrowDown', [modifier]: true });
      assert.deepEqual(await order(), originalOrder, 'only plain arrows reorder');
    }
    await handle('same-id').dispatchEvent('keydown', { key: 'ArrowDown', isComposing: true });
    assert.deepEqual(await order(), originalOrder, 'composition does not reorder');
    await handle('same-id').press('ArrowDown');
    assert.deepEqual(await order(), [...originalOrder].reverse());
    assert(await handle('same-id').evaluate((element) => element === document.activeElement));
    await host.keyboard.press('ArrowDown');
    assert.deepEqual(
      await order(),
      [...originalOrder].reverse(),
      'last item stays at the boundary',
    );
    await host.keyboard.press('ArrowUp');
    assert.deepEqual(await order(), originalOrder, 'focus follows the moved item for the next key');
    await handle('same-id').dragTo(item(originalOrder[1]));
    assert.deepEqual(await order(), [...originalOrder].reverse(), 'drag still reorders');
    await mode.selectOption('first');
    assert.deepEqual((await saved())[store].inputExecutionModes, {});
    await cancel();
    await open(kind);
    assert.deepEqual(await order(), originalOrder, 'cancel restores the original order');
    assert.equal(await mode.inputValue(), 'inherit');
    await mode.selectOption('first');
    await handle('same-id').press('ArrowDown');
    await apply();
    assert.deepEqual((await saved())[store].inputExecutionModes, { [input]: 'first' });
    await open(kind);
    assert.equal(await mode.inputValue(), 'first');
    await mode.selectOption('all');
    await apply();
    await open(kind);
    assert.equal(await mode.inputValue(), 'all');
    await mode.selectOption('inherit');
    await apply();
    assert.deepEqual((await saved())[store].inputExecutionModes, {});
    await open(kind);
    await mode.selectOption('first');
    await apply();
    checks.push(
      `${kind}: plain arrows/drag, focus and boundaries, modifier/IME guard, cancel, inherit/first/all and reopening`,
    );
  }
  assert.deepEqual(
    (await saved()).keybindings.filter((row) => row.key === 'Ctrl+F8').map((row) => row.id),
    ['second-key', 'same-id'],
  );
  for (const store of ['gestures', 'touchpadGestures'])
    assert.deepEqual(
      (await saved())[store].bindings
        .filter((row) => ['same-id', 'second-input'].includes(row.id))
        .map((row) => row.id),
      ['second-input', 'same-id'],
    );
  assert.deepEqual(
    (await saved()).touchpadGestures.connections,
    original.touchpadGestures.connections,
  );
  for (const store of ['keybindingOptions', 'gestures', 'touchpadGestures'])
    assert.equal((await saved())[store].executionMode, 'all');
  await open('touchpad-gestures');
  const choose = panel.getByLabel('設定するジェスチャー', { exact: true });
  await choose.selectOption('three.tap');
  await mode.selectOption('all');
  await choose.selectOption('four.right');
  assert.equal(await mode.inputValue(), 'first');
  await choose.selectOption('three.tap');
  assert.equal(await mode.inputValue(), 'all');
  await apply();
  assert.deepEqual((await saved()).touchpadGestures.inputExecutionModes, {
    'four.right': 'first',
    'three.tap': 'all',
  });
  checks.push(
    'switching inputs retains each draft; other inputs and feature defaults stay independent',
  );
  for (const [theme, width] of [
    ['light', 1280],
    ['dark', 760],
    ['light', 480],
  ]) {
    await host.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
        snapshot.settings.revision,
      );
    }, theme);
    await save();
    await host.setViewportSize({ width, height: 800 });
    await open('shortcuts');
    await stableModeHeight();
    await alignedHint();
    await panel.screenshot({ path: path.join(profile, `trigger-settings-${theme}-${width}.png`) });
    await mode.selectOption('all');
    await panel.getByTestId('settings-dialog-confirm').scrollIntoViewIfNeeded();
    await cancel();
  }
  checks.push('light/dark and wide/narrow dialog controls and footer remain reachable');
  await host.setViewportSize({ width: 700, height: 540 });
  await open('shortcuts');
  await panel.getByLabel('設定するキー', { exact: true }).selectOption('Ctrl+Shift+F8');
  assert(
    await panel
      .locator('.order-dialog-body')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  );
  const footer = await panel.getByTestId('settings-dialog-confirm').boundingBox();
  assert(footer && footer.y + footer.height <= 540);
  await handle('long-0').focus();
  for (let index = 0; index < 14; index++) await host.keyboard.press('ArrowDown');
  assert.equal((await order()).indexOf('long-0'), 14);
  assert(await handle('long-0').evaluate((element) => element === document.activeElement));
  const moved = await handle('long-0').boundingBox();
  const body = await panel.locator('.order-dialog-body').boundingBox();
  assert(moved.y >= body.y && moved.y + moved.height <= body.y + body.height + 1);
  await cancel();
  assert.deepEqual(
    (await saved()).keybindings.filter((row) => row.key === 'Ctrl+Shift+F8'),
    original.keybindings.filter((row) => row.key === 'Ctrl+Shift+F8'),
  );
  checks.push(
    'long group scrolls inside body with fixed footer; cancelling restores original order',
  );
};

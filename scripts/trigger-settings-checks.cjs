const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ host, saved, save, checks, profile, row }) => {
  const panel = host.getByTestId('settings-dialog');
  const mode = panel.getByTestId('binding-execution-mode');
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
    await stableModeHeight();
    await mode.selectOption('first');
    assert.deepEqual((await saved())[store].inputExecutionModes, {});
    await cancel();
    await open(kind);
    assert.equal(await mode.inputValue(), 'inherit');
    await mode.selectOption('first');
    if (kind === 'shortcuts') await panel.getByTestId('binding-order-down:same-id').click();
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
      `${kind}: inherit/first/all, cancel, mode-only apply, clear override, and reopening`,
    );
  }
  assert.deepEqual(
    (await saved()).keybindings.filter((row) => row.key === 'Ctrl+F8').map((row) => row.id),
    ['second-key', 'same-id'],
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
  await panel.getByTestId('binding-order-down:long-0').click();
  await cancel();
  assert.deepEqual(
    (await saved()).keybindings.filter((row) => row.key === 'Ctrl+Shift+F8'),
    original.keybindings.filter((row) => row.key === 'Ctrl+Shift+F8'),
  );
  checks.push(
    'long group scrolls inside body with fixed footer; cancelling restores original order',
  );
};

const assert = require('node:assert/strict');
const path = require('node:path');

exports.check = async ({
  host,
  page,
  dialog,
  save,
  snapshot,
  calls,
  checks,
  focusHost,
  sendKey,
  profile,
}) => {
  const mode = dialog.getByTestId('stack-execution-mode');
  const count = dialog.getByTestId('stack-execution-count');
  const confirm = dialog.getByTestId('settings-dialog-confirm');
  const cancel = async () => {
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const editNamed = () =>
    page.getByRole('button', { name: 'Count stackを編集', exact: true }).click();
  const waitCalls = async (expected) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && calls().length !== expected)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls().length, expected);
  };
  await editNamed();
  assert.equal(await mode.locator('option[value=inherit]').count(), 0);
  await mode.selectOption('count');
  assert.equal(await count.inputValue(), '3');
  for (const invalid of ['0', '-1', '1.5', '', '9007199254740992']) {
    await count.fill(invalid);
    assert(await confirm.isDisabled(), 'invalid execution count blocks saving: ' + invalid);
    assert.equal(await count.inputValue(), invalid, 'invalid draft is retained');
  }
  await count.press('Escape');
  assert.equal(await count.inputValue(), '3');
  await count.fill('2');
  await mode.selectOption('all');
  assert.equal(await count.count(), 0);
  await mode.selectOption('count');
  assert.equal(await count.inputValue(), '2');
  await count.fill('3');
  await count.press('Enter');
  for (const [name, viewport] of [
    ['wide', { width: 1320, height: 900 }],
    ['narrow', { width: 620, height: 640 }],
  ]) {
    await page.setViewportSize(viewport);
    assert(await confirm.isVisible());
    await dialog.screenshot({ path: path.join(profile, 'count-' + name + '.png') });
  }
  await save();
  await page.setViewportSize({ width: 1320, height: 900 });
  const named = (await snapshot()).settings.value.customCommands.items.find(
    (item) => item.title === 'Count stack',
  );
  assert.deepEqual(named.config.executionMode, { mode: 'count', count: 3 });
  checks.push(
    'named count validates positive integers, preserves invalid drafts and Escape, retains count across mode changes, and saves in wide/narrow layouts',
  );
  await focusHost();
  await host.evaluate((id) => window.dock.executeCommand(id), 'appdock.custom.' + named.id);
  await waitCalls(3);
  assert.deepEqual(calls(), ['a', 'a', 'host']);
  checks.push(
    'named count filters ineligible rows, counts duplicates and expands a nested stack as one selected row',
  );
  await editNamed();
  await count.fill('2');
  await cancel();
  assert.deepEqual(
    (await snapshot()).settings.value.customCommands.items.find((item) => item.id === named.id)
      .config.executionMode,
    named.config.executionMode,
  );
  checks.push('cancel discards an edited execution count');

  await page.getByTestId('settings-nav:command-triggers').click();
  for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
    await page.getByTestId('command-trigger-tab:' + kind).click();
    const table = page.getByTestId('trigger-stack-table');
    await table
      .getByRole('button', { name: /を編集$/ })
      .first()
      .click();
    assert.equal(await mode.locator('option[value=inherit]').count(), 1);
    await mode.selectOption('count');
    await count.fill('3');
    await save();
    assert.match(await table.innerText(), /最初の3つ/);
    const filter = page.getByRole('combobox', { name: 'トリガーの実行方法で絞り込み' });
    await filter.selectOption('count');
    assert.equal(await table.locator('tbody tr').count(), 1);
    await filter.selectOption('first');
    assert.equal(await table.getByRole('button', { name: /を編集$/ }).count(), 0);
    assert.match(await table.innerText(), /条件に一致するトリガーはありません/);
    await filter.selectOption('');
  }
  checks.push(
    'all trigger kinds save per-input counts, display the number and filter count selections',
  );
  for (const [kind, optionsId] of [
    ['shortcuts', 'key-gesture-options'],
    ['gestures', 'mouse-gesture-enablement'],
    ['touchpad-gestures', 'touchpad-gesture-enablement'],
  ]) {
    await page.getByTestId('settings-nav:' + kind).click();
    const form = page.getByRole('button', { name: 'フォーム', exact: true });
    if (await form.count()) await form.click();
    const globalMode = page.getByTestId(optionsId).getByRole('combobox').first();
    await globalMode.waitFor();
    assert.deepEqual(
      await globalMode
        .locator('option')
        .evaluateAll((options) => options.map((option) => option.value)),
      ['first', 'all'],
    );
    await globalMode.selectOption('first');
    await host.waitForFunction(
      async (key) => (await window.dock.snapshot()).settings.value[key].executionMode === 'first',
      kind === 'shortcuts'
        ? 'keybindingOptions'
        : kind === 'gestures'
          ? 'gestures'
          : 'touchpadGestures',
    );
  }
  await focusHost();
  await sendKey();
  await waitCalls(6);
  assert.deepEqual(calls().slice(3), ['a', 'a', 'host']);
  checks.push(
    'gesture defaults remain first/all and a per-key count overrides the new first default',
  );
  await page.getByTestId('settings-nav:command-triggers').click();
  await page.getByTestId('command-trigger-tab:shortcuts').click();
  await page
    .getByTestId('trigger-stack-table')
    .getByRole('button', { name: /を編集$/ })
    .first()
    .click();
  await mode.selectOption('inherit');
  await save();
  await focusHost();
  await sendKey();
  await waitCalls(7);
  checks.push(
    'returning a trigger to inheritance removes its count and follows the current global default',
  );
  await page
    .getByTestId('trigger-stack-table')
    .getByRole('button', { name: /を編集$/ })
    .first()
    .click();
  await mode.selectOption('count');
  await count.fill('3');
  await save();
};

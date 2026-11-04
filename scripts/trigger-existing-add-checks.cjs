const assert = require('node:assert/strict');
const path = require('node:path');
const { triggerStacks } = require('../out/main/shared/trigger-stacks');
const { chooseCommand } = require('./command-selection-helper.cjs');

module.exports = async ({ host, open, saved, save, checks, profile, until }) => {
  const dialog = host.getByTestId('settings-dialog');
  const confirm = dialog.getByTestId('settings-dialog-confirm');
  const table = host.getByTestId('trigger-stack-table');
  const back = dialog.getByTestId('settings-dialog-reset');
  const entries = dialog.getByTestId('stack-entry');
  const order = () => entries.evaluateAll((rows) => rows.map((row) => row.dataset.stackEntry));
  const select = async (kind, input) => {
    if (kind === 'shortcuts') {
      const trigger = dialog.locator('.shortcut-special-trigger');
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
      const picker = dialog.locator('.shortcut-special-picker');
      for (const modifier of ['Ctrl', 'Alt', 'Shift', 'Win']) {
        const button = picker.getByRole('button', { name: modifier, exact: true });
        if (
          ((await button.getAttribute('aria-pressed')) === 'true') !==
          input.split('+').includes(modifier)
        )
          await button.click();
      }
      await picker.getByRole('button', { name: input.split('+').at(-1), exact: true }).click();
    } else if (kind === 'gestures') {
      await dialog.getByTestId('gesture-family:move').click();
      await dialog.getByTestId('gesture-direction:1:' + input.slice(5)).click();
    } else await dialog.getByTestId('touchpad-action:' + input).click();
  };
  const begin = async (kind, input) => {
    await table.getByRole('button', { name: /追加/ }).press('Enter');
    await dialog.getByRole('heading', { name: 'トリガーを追加', exact: true }).waitFor();
    if (kind === 'shortcuts') assert(await confirm.isDisabled(), 'empty input cannot advance');
    await select(kind, input);
    await until(() => confirm.isEnabled(), 'selected input can advance');
    assert.equal(await dialog.getByRole('alert').count(), 0);
    assert.equal(await confirm.innerText(), '次へ');
    await confirm.click();
    await dialog.getByTestId('stack-command-step').waitFor();
  };
  const cancel = async () => {
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const accept = async () => {
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
  };
  for (const [kind, input, occupied, unused, cancellation] of [
    ['shortcuts', 'Ctrl+F8', 'Ctrl+F9', 'Ctrl+F10', 'button'],
    ['gestures', 'move-up', 'move-right', 'move-left', 'escape'],
    ['touchpad-gestures', 'four.right', 'three.tap', 'four.down', 'close'],
  ]) {
    await open(kind === 'gestures' ? kind : 'command-triggers');
    await host
      .getByTestId(
        kind === 'gestures' ? 'gesture-settings-tab:triggers' : 'command-trigger-tab:' + kind,
      )
      .press('Enter');
    await save();
    const baseline = await saved();
    const original = triggerStacks(baseline, kind).find((stack) => stack.input === input);
    await begin(kind, input);
    await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
    assert.equal(await confirm.innerText(), 'OK');
    assert.deepEqual(
      await order(),
      original.entries.map((entry) => entry.id),
    );
    assert.equal(await dialog.getByTestId('stack-execution-mode').inputValue(), 'count');
    assert.equal(await dialog.getByTestId('stack-execution-count').inputValue(), '2');
    await entries.nth(1).locator('.stack-entry-select').click();
    assert.equal(
      await dialog.getByRole('checkbox', { name: '有効', exact: true }).isChecked(),
      false,
    );
    assert.equal(
      await dialog
        .getByRole('textbox', { name: '対象のexe名', exact: true })
        .filter({ visible: true })
        .inputValue(),
      'editor',
    );
    assert.deepEqual(await saved(), baseline, 'Next loads without saving');
    if (kind === 'shortcuts')
      await dialog.screenshot({ path: path.join(profile, 'existing-trigger-loaded.png') });
    await dialog.getByTestId('stack-execution-mode').selectOption('all');
    if (cancellation === 'button') await cancel();
    else {
      if (cancellation === 'escape') await dialog.press('Escape');
      else await dialog.getByRole('button', { name: 'ダイアログを閉じる', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(await saved(), baseline);
    checks.push(
      `${kind}: addition loads the complete existing stack, Next does not save, ${cancellation} cancels`,
    );

    await begin(kind, input);
    await back.click();
    await select(kind, occupied);
    assert(await confirm.isDisabled(), 'editing cannot switch to another occupied trigger');
    await select(kind, input);
    await confirm.click();
    await dialog.getByTestId('stack-command-step').waitFor();
    await entries.first().locator('.stack-drag').press('ArrowDown');
    await dialog.getByTestId('stack-execution-mode').selectOption('all');
    await accept();
    const edited = { ...original, entries: [...original.entries].reverse(), executionMode: 'all' };
    const after = await saved();
    assert.deepEqual(
      triggerStacks(after, kind).find((stack) => stack.input === input),
      edited,
    );
    assert.deepEqual(
      triggerStacks(after).filter((stack) => stack.kind !== kind || stack.input !== input),
      triggerStacks(baseline).filter((stack) => stack.kind !== kind || stack.input !== input),
    );
    checks.push(
      `${kind}: OK updates only the selected stack with stable IDs and conditions; reselection rejects occupied targets`,
    );

    await begin(kind, unused);
    assert.equal(await confirm.innerText(), '追加');
    assert(await confirm.isDisabled(), 'new empty stack cannot be saved');
    await dialog.getByTestId('stack-add-command').click();
    await chooseCommand(host, 'fixture.triggers.new');
    await accept();
    const added = triggerStacks(await saved(), kind).find((stack) => stack.input === unused);
    assert.equal(added.entries.length, 1);
    assert.equal(added.entries[0].command, 'fixture.triggers.new');
    assert.deepEqual(
      triggerStacks(await saved(), kind).find((stack) => stack.input === input),
      edited,
    );
    checks.push(`${kind}: unused input still adds a new stack without modifying the existing one`);
  }

  await host.getByTestId('command-trigger-tab:gestures').press('Enter');
  await save();
  const baseline = await saved();
  const original = triggerStacks(baseline, 'gestures').find((stack) => stack.input === 'move-up');
  await begin('gestures', 'move-down');
  await dialog.getByTestId('stack-add-command').click();
  await chooseCommand(host, 'fixture.triggers.new');
  await dialog.getByTestId('binding-scope:exe').filter({ visible: true }).click();
  await dialog
    .getByRole('textbox', { name: '対象のexe名', exact: true })
    .filter({ visible: true })
    .fill('C:\\invalid.exe');
  await until(() => confirm.isDisabled(), 'invalid new draft cannot save');
  await back.click();
  await select('gestures', 'move-up');
  await confirm.click();
  await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
  await until(() => confirm.isEnabled(), 'existing stack does not inherit invalid draft state');
  assert.deepEqual(
    await order(),
    original.entries.map((entry) => entry.id),
  );
  assert.equal(await dialog.getByTestId('stack-execution-mode').inputValue(), 'all');
  assert.equal(
    await dialog
      .getByRole('textbox', { name: '対象のexe名', exact: true })
      .filter({ visible: true })
      .inputValue(),
    'editor',
  );
  await accept();
  const reloaded = await saved();
  const stackMap = (settings) =>
    new Map(
      triggerStacks(settings).map((stack) => [JSON.stringify([stack.kind, stack.input]), stack]),
    );
  assert.deepEqual(stackMap(reloaded), stackMap(baseline));
  assert.deepEqual(
    { ...reloaded, gestures: { ...reloaded.gestures, bindings: baseline.gestures.bindings } },
    baseline,
  );
  checks.push(
    'switching a new invalid draft to an existing stack loads only that stack and resets transient editor state',
  );

  await begin('gestures', 'move-up');
  await dialog.getByTestId('stack-execution-mode').selectOption('first');
  await host.evaluate(async () => {
    const snapshot = await window.dock.snapshot();
    const settings = structuredClone(snapshot.settings.value);
    settings.gestures.bindings.find((row) => row.gesture === 'move-up').enabled = true;
    await window.dock.saveSettings(settings, snapshot.settings.revision);
  });
  await until(
    async () =>
      !(await table.getByTestId('trigger-stacks:gestures:list:row:move-up').innerText()).includes(
        '無効',
      ),
    'external source update reaches the settings view',
  );
  const external = await saved();
  await confirm.click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /別の場所で変更/);
  assert.deepEqual(await saved(), external);
  await cancel();
  checks.push(
    'an existing stack opened from Add rejects external changes and preserves the newer settings',
  );

  await begin('gestures', 'move-up');
  while (await entries.count())
    await entries.first().getByRole('button', { name: 'このコマンドを削除', exact: true }).click();
  await dialog.getByText('OKでこのトリガーを削除します。', { exact: true }).waitFor();
  assert.deepEqual(await saved(), external);
  await accept();
  assert.deepEqual(
    triggerStacks(await saved()),
    triggerStacks(external).filter(
      (stack) => stack.kind !== 'gestures' || stack.input !== 'move-up',
    ),
  );
  checks.push('an existing stack opened from Add retains empty-edit deletion on OK');
};

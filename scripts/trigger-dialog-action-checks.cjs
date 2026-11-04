const assert = require('node:assert/strict');
const path = require('node:path');
const { triggerStacks } = require('../out/main/shared/trigger-stacks');
const { gestureTitle } = require('../out/main/shared/gestures');
const { touchpadTitle } = require('../out/main/shared/touchpad-gestures');

module.exports = async ({ host, open, saved, save, checks, profile, row, until, app }) => {
  const dialog = host.getByTestId('settings-dialog');
  const confirm = dialog.getByTestId('settings-dialog-confirm');
  const add = dialog.getByTestId('binding-apply');
  const addAndEdit = dialog.getByTestId('binding-apply-and-edit');
  const title = (kind, input) =>
    kind === 'shortcuts' ? input : kind === 'gestures' ? gestureTitle(input) : touchpadTitle(input);
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
  const empty = async () => {
    while (await dialog.getByTestId('stack-entry').count())
      await dialog
        .getByTestId('stack-entry')
        .first()
        .getByRole('button', { name: 'このコマンドを削除', exact: true })
        .click();
    await dialog.getByText('OKでこのトリガーを削除します。', { exact: true }).waitFor();
    await until(() => confirm.isEnabled(), 'empty existing stack can be confirmed');
  };
  const cancelEdit = async () => {
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const confirmEdit = async () => {
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
  };
  await open();
  for (const [kind, input, replacement, cancel] of [
    ['shortcuts', 'Ctrl+F8', 'Ctrl+F10', 'button'],
    ['gestures', 'move-up', 'move-left', 'escape'],
    ['touchpad-gestures', 'four.right', 'four.down', 'close'],
  ]) {
    if (kind === 'touchpad-gestures') await open(kind);
    await host
      .getByTestId(
        kind === 'touchpad-gestures'
          ? 'gesture-settings-tab:triggers'
          : 'command-trigger-tab:' + (kind === 'shortcuts' ? 'commands' : kind),
      )
      .press('Enter');
    const edit = async () => {
      if (kind === 'shortcuts') await row(kind, 'same-id').locator('.binding-order').press('Enter');
      else
        await host
          .getByTestId('trigger-stack-table')
          .getByRole('button', { name: title(kind, input) + 'を編集', exact: true })
          .click();
      await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
    };
    const baseline = await saved();
    await edit();
    await empty();
    assert.deepEqual(await saved(), baseline, 'removing draft entries does not save');
    if (cancel === 'button') await cancelEdit();
    else if (cancel === 'escape') await dialog.press('Escape');
    else await dialog.getByRole('button', { name: 'ダイアログを閉じる', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await saved(), baseline);
    await edit();
    await dialog.getByTestId('settings-dialog-reset').click();
    await select(kind, replacement);
    await confirm.click();
    await dialog.getByTestId('stack-command-step').waitFor();
    await dialog.getByTestId('stack-execution-count').fill('0');
    await empty();
    await confirmEdit();
    assert.deepEqual(
      triggerStacks(await saved()),
      triggerStacks(baseline).filter((stack) => stack.kind !== kind || stack.input !== input),
    );
    checks.push(
      `${kind}: empty edits delete the original stack and its mode only on OK, even after reselection and invalid count; ${cancel} cancels`,
    );
  }

  await open();
  await host.getByTestId('command-trigger-tab:commands').press('Enter');
  await row('gestures', 'occupied').locator('.binding-order').press('Enter');
  await empty();
  await host.evaluate(async () => {
    const snapshot = await window.dock.snapshot();
    const value = structuredClone(snapshot.settings.value);
    value.gestures.bindings.find((row) => row.id === 'occupied').enabled = false;
    await window.dock.saveSettings(value, snapshot.settings.revision);
  });
  await row('gestures', 'occupied').getByText('無効', { exact: true }).waitFor();
  const external = await saved();
  await confirm.click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /別の場所で変更/);
  assert.deepEqual(await saved(), external);
  await cancelEdit();
  checks.push(
    'empty edit rejects an externally changed original without losing the empty draft or newer settings',
  );

  await host.getByTestId('command-trigger-tab:gestures').press('Enter');
  await host.getByTestId('trigger-stack-table').getByRole('button', { name: /追加/ }).click();
  await select('gestures', 'move-up');
  await confirm.click();
  assert(await confirm.isDisabled(), 'a new empty trigger cannot be saved');
  assert.equal(
    await dialog.getByText('OKでこのトリガーを削除します。', { exact: true }).count(),
    0,
  );
  await cancelEdit();
  checks.push('new triggers still require a command and do not show a deletion message');

  await host.getByTestId('command-trigger-tab:commands').press('Enter');
  const beginAdd = async (kind, command, input) => {
    await host.getByTestId(`binding-add:fixture.triggers.${command}:${kind}`).press('Enter');
    if (kind === 'shortcuts') {
      assert(await add.isDisabled());
      assert(await addAndEdit.isDisabled());
    }
    await select(kind, input);
    await dialog.getByTestId('binding-scope:app').click();
    await until(() => addAndEdit.isEnabled(), 'addition ready');
  };
  const openedStack = async (kind, input, command, count) => {
    await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
    const stack = triggerStacks(await saved(), kind).find((stack) => stack.input === input);
    assert(stack, 'the trigger is already saved when its editor opens');
    assert.equal(stack.entries.length, count);
    const entry = stack.entries.find((entry) => entry.command === `fixture.triggers.${command}`);
    assert.equal(
      await dialog.locator(`[data-stack-entry="${entry.id}"]`).getAttribute('data-selected'),
      'true',
    );
    await until(
      () => dialog.evaluate((element) => element.contains(document.activeElement)),
      'focus is in the follow-up editor',
    );
    assert.equal(await dialog.count(), 1);
    return stack;
  };
  for (const [kind, input, normal] of [
    ['shortcuts', 'F8', 'F10'],
    ['gestures', 'move-up', 'move-down'],
    ['touchpad-gestures', 'four.right', 'four.down'],
  ]) {
    await beginAdd(kind, 'new', input);
    await dialog.getByTestId('binding-scope:exe').click();
    await dialog.getByRole('textbox', { name: '対象のexe名', exact: true }).fill('C:\\invalid.exe');
    assert(await add.isDisabled());
    assert(await addAndEdit.isDisabled());
    await dialog.getByTestId('binding-scope:app').click();
    if (kind === 'shortcuts') {
      for (const width of [1720, 900]) {
        await host.setViewportSize({ width, height: width === 900 ? 620 : 1000 });
        await addAndEdit.scrollIntoViewIfNeeded();
        await dialog.screenshot({ path: path.join(profile, `add-and-edit-${width}.png`) });
        const [secondary, primary] = await Promise.all([
          addAndEdit.boundingBox(),
          add.boundingBox(),
        ]);
        assert(
          secondary && primary && secondary.x + secondary.width <= primary.x + 1,
          'new action is left of Add and does not overlap',
        );
      }
      await host.setViewportSize({ width: 1280, height: 840 });
    }
    await addAndEdit.evaluate((button) => {
      button.click();
      button.click();
    });
    const first = await openedStack(kind, input, 'new', 1);
    const added = await saved();
    await dialog.getByTestId('stack-execution-mode').selectOption('all');
    await cancelEdit();
    assert.deepEqual(await saved(), added, 'cancel only discards the follow-up draft');
    await beginAdd(kind, 'two', input);
    await addAndEdit.click();
    const combined = await openedStack(kind, input, 'two', 2);
    assert.deepEqual(combined.entries[0], first.entries[0]);
    await dialog.getByTestId('stack-execution-mode').selectOption('all');
    await confirmEdit();
    assert.equal(
      triggerStacks(await saved(), kind).find((stack) => stack.input === input).executionMode,
      'all',
    );
    await beginAdd(kind, 'one', normal);
    if (kind === 'shortcuts') await dialog.getByTestId('binding-scope:app').press('Control+Enter');
    else await add.click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
    assert.equal(
      triggerStacks(await saved(), kind).find((stack) => stack.input === normal).entries.length,
      1,
    );
    checks.push(
      `${kind}: add-and-edit validates, saves once on repeated clicks, selects the new row in the full stack, preserves additions on cancel; normal Add/Ctrl+Enter stays unchanged`,
    );
  }

  if (app) {
    const failSaves = () =>
      app.evaluate(() => {
        const { SettingsStore } = process
          .getBuiltinModule('module')
          .createRequire(process.cwd() + '/package.json')('./out/main/main/core/settings');
        globalThis.triggerDialogSaveFixture = {
          prototype: SettingsStore.prototype,
          original: SettingsStore.prototype.save,
        };
        SettingsStore.prototype.save = function () {
          throw Error('synthetic trigger save failure');
        };
      });
    const restoreSaves = () =>
      app.evaluate(() => {
        const fixture = globalThis.triggerDialogSaveFixture;
        if (fixture) fixture.prototype.save = fixture.original;
        delete globalThis.triggerDialogSaveFixture;
      });
    const baseline = await saved();
    await beginAdd('gestures', 'new', 'move-left');
    try {
      await failSaves();
      await addAndEdit.click();
      await dialog.getByRole('alert').waitFor();
      assert(await addAndEdit.isVisible());
      assert.deepEqual(await saved(), baseline);
      assert.equal(
        await dialog.getByTestId('gesture-direction:1:left').getAttribute('aria-pressed'),
        'true',
      );
    } finally {
      await restoreSaves();
    }
    await addAndEdit.click();
    await openedStack('gestures', 'move-left', 'new', 1);
    const added = await saved();
    await empty();
    try {
      await failSaves();
      await confirm.click();
      await dialog.getByRole('alert').waitFor();
      assert.equal(await dialog.getByTestId('stack-entry').count(), 0);
      assert.deepEqual(await saved(), added);
    } finally {
      await restoreSaves();
    }
    await confirmEdit();
    assert.deepEqual(await saved(), baseline);
    checks.push(
      'source save-failure fixture: addition and empty deletion retain drafts and durable values, and explicit retries succeed without duplicate rows',
    );
  }
};

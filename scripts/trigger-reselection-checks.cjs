const assert = require('node:assert/strict');
const path = require('node:path');
const { triggerStacks } = require('../out/main/shared/trigger-stacks');
const { gestureTitle } = require('../out/main/shared/gestures');
const { touchpadTitle } = require('../out/main/shared/touchpad-gestures');
const { chooseCommand } = require('./command-selection-helper.cjs');

module.exports = async ({ host, open, saved, save, checks, profile, row, until }) => {
  const dialog = host.getByTestId('settings-dialog');
  const confirm = dialog.getByTestId('settings-dialog-confirm');
  const back = dialog.getByRole('button', { name: 'トリガーを選び直す', exact: true });
  const title = (kind, input) =>
    kind === 'shortcuts' ? input : kind === 'gestures' ? gestureTitle(input) : touchpadTitle(input);
  const cancel = async () => {
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const next = async () => {
    assert.equal(await confirm.innerText(), '次へ');
    assert(await confirm.isEnabled());
    await confirm.click();
    await dialog.getByTestId('stack-command-step').waitFor();
  };
  const select = async (kind, input) => {
    if (kind === 'shortcuts') {
      const trigger = dialog.locator('.shortcut-special-trigger');
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
      await dialog
        .locator('.shortcut-special-picker')
        .getByRole('button', { name: input.split('+').at(-1), exact: true })
        .click();
    } else if (kind === 'gestures') {
      await dialog.getByTestId('gesture-family:move').click();
      await dialog.getByTestId('gesture-direction:1:' + input.slice(5)).click();
    } else await dialog.getByTestId('touchpad-action:' + input).click();
  };
  const assertSelected = async (kind, input) => {
    if (kind === 'shortcuts')
      assert.equal(
        await dialog
          .locator('.shortcut-capture kbd')
          .allTextContents()
          .then((p) => p.join('+')),
        input,
      );
    else
      assert.equal(
        await dialog
          .getByTestId(
            kind === 'gestures'
              ? 'gesture-direction:1:' + input.slice(5)
              : 'touchpad-action:' + input,
          )
          .getAttribute('aria-pressed'),
        'true',
      );
  };
  for (const [kind, input, occupied, replacement] of [
    ['shortcuts', 'Ctrl+F8', 'Ctrl+F9', 'Ctrl+F10'],
    ['gestures', 'move-up', 'move-right', 'move-down'],
    ['touchpad-gestures', 'four.right', 'three.tap', 'four.down'],
  ]) {
    await open(kind === 'touchpad-gestures' ? kind : 'command-triggers');
    await host
      .getByTestId(
        kind === 'touchpad-gestures'
          ? 'gesture-settings-tab:triggers'
          : 'command-trigger-tab:' + (kind === 'shortcuts' ? 'commands' : kind),
      )
      .click();
    const edit = async () => {
      if (kind === 'shortcuts') {
        await row(kind, 'same-id').locator('.binding-order').click();
      } else {
        await host
          .getByTestId('trigger-stack-table')
          .getByRole('button', { name: title(kind, input) + 'を編集', exact: true })
          .click();
      }
      await dialog.getByRole('heading', { name: 'トリガーの編集', exact: true }).waitFor();
      try {
        await until(() => back.isEnabled(), 'reselection action ready');
      } catch (error) {
        await host.screenshot({ path: path.join(profile, 'reselection-not-ready.png') });
        throw error;
      }
    };
    const baseline = await saved();
    const original = triggerStacks(baseline, kind).find((stack) => stack.input === input);
    await edit();
    assert.equal(await dialog.getByTestId('stack-execution-mode').inputValue(), 'count');
    await dialog.getByTestId('stack-execution-mode').selectOption('all');
    await dialog.getByTestId('stack-entry').first().locator('.stack-drag').press('ArrowDown');
    const draftOrder = await dialog
      .getByTestId('stack-entry')
      .evaluateAll((elements) => elements.map((e) => e.dataset.stackEntry));
    await dialog.getByTestId('binding-scope:exe').filter({ visible: true }).click();
    const processes = dialog
      .getByRole('textbox', { name: '対象のexe名', exact: true })
      .filter({ visible: true });
    await processes.fill('C:\\invalid.exe');
    await until(() => confirm.isDisabled(), 'invalid condition blocks saving');
    await back.click();
    await assertSelected(kind, input);
    await next();
    assert.equal(await processes.inputValue(), 'C:\\invalid.exe');
    assert(await confirm.isDisabled());
    assert.equal(await dialog.getByTestId('stack-execution-mode').inputValue(), 'all');
    assert.deepEqual(
      await dialog
        .getByTestId('stack-entry')
        .evaluateAll((elements) => elements.map((e) => e.dataset.stackEntry)),
      draftOrder,
    );
    await back.click();
    await select(kind, occupied);
    assert(await confirm.isDisabled(), 'occupied target blocks next');
    await select(kind, replacement);
    await next();
    assert.equal(
      await dialog.getByTestId('stack-trigger-readonly').innerText(),
      title(kind, replacement),
    );
    assert.equal(await processes.inputValue(), 'C:\\invalid.exe');
    assert(await confirm.isDisabled(), 'invalid draft survives a changed input');
    assert.deepEqual(await saved(), baseline, 'selection never saves the draft');
    await cancel();
    assert.deepEqual(await saved(), baseline, 'editor cancellation preserves all settings');
    await edit();
    await back.click();
    await select(kind, replacement);
    await cancel();
    assert.deepEqual(await saved(), baseline, 'selection cancellation preserves all settings');
    checks.push(
      `${kind}: current selection, duplicate rejection, invalid condition and reordered draft retention, cancellation in both steps`,
    );

    await edit();
    await back.click();
    await select(kind, replacement);
    await next();
    assert.equal(await confirm.innerText(), 'OK');
    if (kind === 'shortcuts') {
      for (const width of [1720, 900]) {
        await host.setViewportSize({ width, height: width === 900 ? 620 : 1000 });
        await back.scrollIntoViewIfNeeded();
        await dialog.screenshot({ path: path.join(profile, `trigger-reselection-${width}.png`) });
      }
      await host.setViewportSize({ width: 1280, height: 840 });
    }
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
    const actual = triggerStacks(await saved());
    assert(!actual.some((stack) => stack.kind === kind && stack.input === input));
    assert.deepEqual(
      actual.find((stack) => stack.kind === kind && stack.input === replacement),
      { ...original, input: replacement },
    );
    assert.deepEqual(
      actual.filter((stack) => stack.kind !== kind || stack.input !== replacement),
      triggerStacks(baseline).filter((stack) => stack.kind !== kind || stack.input !== input),
    );
    checks.push(
      `${kind}: OK replaces the whole stack, preserving IDs, order, disabled rows, conditions, execution count and other stacks`,
    );
  }

  await open();
  await host.getByTestId('command-trigger-tab:gestures').click();
  const table = host.getByTestId('trigger-stack-table');
  const baseline = await saved();
  await table.getByRole('button', { name: /追加/ }).click();
  await select('gestures', 'move-down');
  assert(await confirm.isDisabled());
  await select('gestures', 'move-left');
  await next();
  await dialog.getByTestId('stack-add-command').click();
  await chooseCommand(host, 'fixture.triggers.new');
  await back.click();
  await next();
  assert.equal(await dialog.getByTestId('stack-entry').count(), 1);
  await cancel();
  assert.deepEqual(await saved(), baseline);
  checks.push(
    'addition still rejects occupied inputs and retains new commands across reselection without saving on cancel',
  );

  const editMouse = async () => {
    await table
      .getByRole('button', { name: gestureTitle('move-down') + 'を編集', exact: true })
      .click();
    await back.click();
    await select('gestures', 'move-left');
    await next();
  };
  await editMouse();
  await host.evaluate(async () => {
    const snapshot = await window.dock.snapshot();
    const settings = structuredClone(snapshot.settings.value);
    settings.gestures.bindings.push({
      ...settings.gestures.bindings[0],
      id: 'late-target',
      gesture: 'move-left',
    });
    await window.dock.saveSettings(settings, snapshot.settings.revision);
  });
  await until(() => confirm.isDisabled(), 'late destination collision blocks saving');
  const external = await saved();
  await cancel();
  assert.deepEqual(await saved(), external);
  await table
    .getByRole('button', { name: gestureTitle('move-down') + 'を編集', exact: true })
    .click();
  await back.click();
  await select('gestures', 'move-up');
  await next();
  await host.evaluate(async () => {
    const snapshot = await window.dock.snapshot();
    const settings = structuredClone(snapshot.settings.value);
    settings.gestures.bindings.find((row) => row.gesture === 'move-down').enabled = false;
    await window.dock.saveSettings(settings, snapshot.settings.revision);
  });
  const changedOriginal = await saved();
  await until(async () => {
    const text = await table
      .locator('tbody tr')
      .filter({ hasText: gestureTitle('move-down') })
      .innerText();
    return (text.match(/無効/g) ?? []).length === 2;
  }, 'external source change reaches the open settings view');
  await confirm.click();
  try {
    await dialog.getByRole('alert').waitFor();
  } catch (error) {
    await host.screenshot({ path: path.join(profile, 'reselection-conflict.png') });
    console.error(await host.locator('body').innerText());
    throw error;
  }
  assert.match(await dialog.getByRole('alert').textContent(), /別の場所で変更/);
  assert(await dialog.isVisible());
  assert.deepEqual(
    await saved(),
    changedOriginal,
    'stale source cannot replace the external change',
  );
  await cancel();
  checks.push('external destination collision and source changes cannot overwrite newer settings');
};

const assert = require('node:assert/strict');
const kinds = ['shortcuts', 'gestures', 'touchpad-gestures'];
const option = (host) => host.getByTestId('stack-execution-mode').locator('option[value=inherit]');
const dialog = (host) => host.getByTestId('settings-dialog');
const cancel = async (host) => {
  await dialog(host).getByTestId('settings-dialog-cancel').click();
  await dialog(host).waitFor({ state: 'hidden' });
};
async function edit(host, kind) {
  await host.getByTestId('command-trigger-tab:' + kind).click();
  await host
    .getByTestId('trigger-stack-table')
    .getByRole('button', { name: /を編集$/ })
    .first()
    .click();
  await host.getByTestId('stack-execution-mode').waitFor();
}
async function waitForMode(host, mode) {
  const expected = mode === 'first' ? '最初の1つ' : 'すべて';
  await host.waitForFunction(
    (expected) => {
      const option = document.querySelector(
        '[data-testid="stack-execution-mode"] option[value=inherit]',
      );
      return option?.textContent.includes(expected);
    },
    expected,
    { timeout: 5000 },
  );
}
exports.verify = async ({ host, checks }) => {
  for (const kind of kinds) {
    await edit(host, kind);
    assert.match(
      await option(host).innerText(),
      /最初の1つ/,
      kind + ' must show the configured inherited mode',
    );
    assert.equal(await host.getByTestId('stack-execution-mode').inputValue(), 'inherit');
    await cancel(host);
  }
  checks.push('all three trigger tabs display the configured inherited first mode');
};
exports.check = async ({ host, saved, save, open, row, checks }) => {
  const before = await saved();
  await exports.verify({ host, checks });
  await host.getByTestId('command-trigger-tab:commands').click();
  for (const kind of kinds) {
    await row(kind, 'same-id').locator('.binding-order').press('Enter');
    assert.match(await option(host).innerText(), /最初の1つ/);
    await cancel(host);
  }
  checks.push('reverse lookup dialogs use the same actual inherited modes as trigger tabs');
  const setGlobal = async (kind, executionMode) => {
    const key =
      kind === 'shortcuts'
        ? 'keybindingOptions'
        : kind === 'gestures'
          ? 'gestures'
          : 'touchpadGestures';
    await host.evaluate(
      async ({ key, executionMode }) => {
        const snapshot = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...snapshot.settings.value, [key]: { ...snapshot.settings.value[key], executionMode } },
          snapshot.settings.revision,
        );
      },
      { key, executionMode },
    );
    await save();
  };
  for (const kind of kinds) {
    await edit(host, kind);
    await setGlobal(kind, 'all');
    await waitForMode(host, 'all');
    assert.equal(await host.getByTestId('stack-execution-mode').inputValue(), 'inherit');
    await setGlobal(kind, 'first');
    await waitForMode(host, 'first');
    await cancel(host);
  }
  checks.push(
    'open dialogs follow external global mode changes without replacing inherited selection',
  );
  await edit(host, 'gestures');
  await host.getByTestId('stack-execution-mode').selectOption('all');
  await dialog(host).getByTestId('settings-dialog-confirm').click();
  await save();
  await edit(host, 'gestures');
  assert.equal(await host.getByTestId('stack-execution-mode').inputValue(), 'all');
  assert.match(await option(host).innerText(), /最初の1つ/);
  await host.getByTestId('stack-execution-mode').selectOption('inherit');
  await dialog(host).getByTestId('settings-dialog-confirm').click();
  await save();
  checks.push('explicit per-trigger override stays independent of the inherited global label');
  assert.deepEqual(await saved(), before);
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  const projection = JSON.parse(await host.locator('.settings-panel-json textarea').inputValue());
  for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures'])
    assert.equal(projection[key]?.executionMode, undefined);
  await host.getByRole('button', { name: 'フォーム', exact: true }).click();
  checks.push(
    'display metadata does not add global execution modes to page JSON or alter saved settings',
  );
  for (const kind of kinds) {
    await open(kind);
    await host
      .getByTestId('trigger-stack-table')
      .getByRole('button', { name: /を編集$/ })
      .first()
      .click();
    assert.match(await option(host).innerText(), /最初の1つ/);
    await cancel(host);
  }
  checks.push('gesture feature pages retain their correct inherited modes');
  await open();
};

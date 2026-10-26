const assert = require('node:assert/strict');

module.exports = async ({ host, saved, save, checks, row, until }) => {
  const dialog = host.getByTestId('settings-dialog');
  const cases = [
    { key: 'CapsLock', command: 'one', block: true },
    { key: 'ScrollLock', command: 'two', block: false },
    { key: 'Ctrl+ScrollLock', command: 'one', block: true },
    { key: 'Alphanumeric', command: 'one', block: true },
    { key: 'KanaMode', command: 'two', block: true },
    { key: 'Ctrl+KanaMode', command: 'one', block: false },
    { key: 'Shift+KanaMode', command: 'two', block: true },
    { key: 'Convert', command: 'one', block: false },
    { key: 'NonConvert', command: 'two', block: true },
    { key: 'Ctrl+NonConvert', command: 'two', block: true },
    { key: 'Ctrl+Alt+NonConvert', command: 'one', block: true },
  ];
  for (const { key, command, block } of cases) {
    const commandId = 'fixture.triggers.' + command;
    await host.locator(`[data-shortcut-command="${commandId}"] .command-title`).hover();
    await host.getByTestId(`binding-add:${commandId}:shortcuts`).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: /特殊キーから選ぶ/ }).click();
    assert(await dialog.getByRole('button', { name: 'CapsLock', exact: true }).isVisible());
    assert(await dialog.getByRole('button', { name: 'ScrollLock', exact: true }).isVisible());
    for (const modifier of key.split('+').slice(0, -1))
      await dialog
        .getByRole('group', { name: '特殊キーの修飾キー' })
        .getByRole('button', { name: modifier, exact: true })
        .click();
    await dialog.getByRole('button', { name: key.split('+').at(-1), exact: true }).click();
    await dialog.getByTestId('binding-scope:global').click();
    const blocking = dialog.getByRole('switch', {
      name: '元のキー入力をブロックする',
      exact: true,
    });
    assert.equal(await blocking.isChecked(), true);
    if (!block) await blocking.click();
    await dialog.getByTestId('binding-apply').click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
    const binding = (await saved()).keybindings.find((value) => value.key === key);
    assert(binding && binding.command === commandId && binding.when.scope === 'global');
    assert.equal(binding.blockOriginalInput !== false, block);
    await until(async () => {
      const state = await host.evaluate(() => window.dock.snapshot());
      return state.globalHotKeys.some(
        (status) =>
          status.shortcut === key &&
          status.registered &&
          status.effectiveBlockOriginalInput === block,
      );
    }, key + ' native registration and blocking policy');
    checks.push(key + ' selects, saves and registers with block=' + block);
    await row('shortcuts', binding.id).locator('.binding-condition-cell').hover();
    await row('shortcuts', binding.id).locator('.applet-shortcut-edit').click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: /特殊キーから選ぶ/ }).click();
    assert.equal(
      await dialog
        .getByRole('button', { name: key.split('+').at(-1), exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await blocking.isChecked(), block);
    await dialog.getByTestId('binding-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  }
  checks.push('reopening and cancelling preserve canonical keys, modifiers and blocking choices');
};

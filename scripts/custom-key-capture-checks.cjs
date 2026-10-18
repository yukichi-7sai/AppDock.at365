const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ page, item, call, profile, until }) => {
  const dialog = page.getByRole('dialog');
  const capture = () => dialog.getByRole('button', { name: '送信キーを入力', exact: true });
  const editButton = page.getByRole('button', { name: item.title + 'を編集', exact: true });
  const keys = () => capture().locator('kbd').allTextContents();
  const edit = async () => {
    await editButton.click();
    await dialog.getByText('押して入力', { exact: true }).waitFor();
  };
  const saved = async () =>
    (await page.evaluate(() => window.dock.snapshot())).settings.value.customCommands.items.find(
      (i) => i.id === item.id,
    );
  const apply = async (expected) => {
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await until(async () => (await saved()).config.keys === expected, 'captured key saved');
    assert.equal(
      (await call('appdock_list_custom_commands')).items.find((i) => i.id === item.id).commandId,
      item.commandId,
    );
    assert.equal((await saved()).description, item.description);
  };
  await page.evaluate(() => window.dock.executeCommand('appdock.open'));
  await edit();
  await capture().press('Enter');
  assert.deepEqual(await keys(), ['Enter']);
  assert(await dialog.isVisible(), 'Enter records without applying');
  await capture().dispatchEvent('keydown', { key: 'b', code: 'KeyB', repeat: true });
  await capture().dispatchEvent('keydown', { key: 'x', code: 'KeyX', isComposing: true });
  await capture().dispatchEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 229 });
  assert.deepEqual(await keys(), ['Enter'], 'repeat/composition do not change the recorded key');
  await capture().press('Pause');
  await dialog.getByRole('alert').waitFor();
  assert.deepEqual(await keys(), ['Enter'], 'unsupported input retains the previous value');
  await capture().press('Alt+ArrowLeft');
  assert.deepEqual(await keys(), ['Alt', 'Left']);
  assert.equal(await dialog.getByRole('alert').count(), 0);
  await capture().press('Tab');
  assert.equal(
    await capture().evaluate((e) => document.activeElement === e),
    false,
    'Tab moves focus',
  );
  await capture().press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await saved()).config.keys, 'Ctrl+Shift+T', 'cancel preserves saved command');

  await edit();
  await dialog.getByRole('button', { name: '特殊キーから選ぶ' }).click();
  const modifiers = dialog.getByRole('group', { name: '特殊キーの修飾キー' });
  for (const modifier of ['Ctrl', 'Shift'])
    await modifiers.getByRole('button', { name: modifier, exact: true }).click();
  await modifiers.getByRole('button', { name: 'Win', exact: true }).click();
  assert.equal(
    await dialog
      .locator('.shortcut-special-group')
      .getByRole('button', { name: 'Pause', exact: true })
      .count(),
    0,
  );
  assert.equal(
    await dialog
      .locator('.shortcut-special-group')
      .getByRole('button', { name: 'Plus', exact: true })
      .count(),
    0,
  );
  await dialog
    .locator('.shortcut-special-group')
    .getByRole('button', { name: 'Tab', exact: true })
    .click();
  assert.deepEqual(await keys(), ['Win', 'Tab']);
  await apply('Win+Tab');

  await edit();
  await dialog.getByLabel('設定をJSONで編集').check();
  await dialog.getByLabel('固定設定（JSON）').fill('{"keys":"Bogus+Enter"}');
  await dialog.getByLabel('設定をJSONで編集').uncheck();
  await dialog.getByRole('button', { name: '特殊キーから選ぶ' }).click();
  await dialog
    .locator('.shortcut-special-group')
    .getByRole('button', { name: 'Escape', exact: true })
    .click();
  assert.deepEqual(await keys(), ['Escape'], 'invalid JSON draft can be corrected by the picker');
  await apply('Escape');

  await edit();
  await capture().press('Meta+e');
  assert.deepEqual(await keys(), ['Win', 'E']);
  await dialog.getByLabel('設定をJSONで編集').check();
  assert.equal(JSON.parse(await dialog.getByLabel('固定設定（JSON）').inputValue()).keys, 'Win+E');
  await dialog.getByLabel('設定をJSONで編集').uncheck();
  await capture().press('Control+Shift+T');
  await apply('Ctrl+Shift+T');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = theme;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, theme);
    for (const width of [1280, 740]) {
      await page.setViewportSize({ width, height: 850 });
      await edit();
      await dialog.getByRole('button', { name: '特殊キーから選ぶ' }).click();
      const layout = await dialog.evaluate((e) => ({
        width: e.clientWidth,
        scroll: e.scrollWidth,
      }));
      assert(layout.scroll <= layout.width + 2, 'capture dialog has no horizontal overflow');
      await dialog.screenshot({ path: path.join(profile, `key-capture-${theme}-${width}.png`) });
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal((await saved()).config.keys, 'Ctrl+Shift+T');
};

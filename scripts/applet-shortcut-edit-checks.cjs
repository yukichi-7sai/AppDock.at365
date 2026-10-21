const { settleSettings } = require('./settings-immediate-helper.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ page, snapshot, save, until, profile, checks }) => {
  const dialog = page.locator('.applet-shortcut-dialog');
  const add = page.getByRole('button', { name: 'A secondに割り当てを追加', exact: true });
  const recorder = () =>
    dialog.getByRole('button', { name: 'ショートカットキーを入力', exact: true });
  const ready = async () => {
    await dialog.waitFor();
    await dialog.getByText('押して入力', { exact: true }).waitFor();
    assert.equal(await recorder().evaluate((el) => el === document.activeElement), true);
    await until(
      async () => !(await snapshot()).globalHotKeys.length,
      'dialog pauses global registration',
    );
  };
  const original = (await snapshot()).settings.value.keybindings;
  const emptyLeft = (
    await page.locator('[data-shortcut-command="test.a.second"] td > .muted').boundingBox()
  ).x;
  const keyLeft = (await page.locator('[data-binding-id="overview.extra"] kbd').boundingBox()).x;
  assert(Math.abs(emptyLeft - keyLeft) < 1, 'unassigned and assigned keys share a left edge');
  await add.click();
  await ready();
  assert(await dialog.getByRole('button', { name: '追加', exact: true }).isDisabled());
  await recorder().press('Control+F8');
  assert.match(await recorder().innerText(), /Ctrl[\s\S]*F8/);
  await recorder().press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await add.evaluate((el) => el === document.activeElement));
  assert.deepEqual((await snapshot()).settings.value.keybindings, original);
  assert.equal(
    await page.getByRole('button', { name: '変更をすべて保存', exact: true }).count(),
    0,
  );
  await until(
    async () => (await snapshot()).globalHotKeys.some((status) => status.registered),
    'global registration resumes after cancel',
  );

  // A clean shared session can receive changes while the local input panel is open.
  const conflict = page.locator('[data-binding-id="overview.extra"]');
  await conflict.locator('.applet-shortcut-edit').click();
  await ready();
  await page.evaluate(async () => {
    const state = await window.dock.snapshot();
    state.settings.value.keybindings.find((row) => row.id === 'overview.extra').enabled = true;
    await window.dock.saveSettings(state.settings.value, state.settings.revision);
  });
  await until(
    async () => !(await conflict.innerText()).includes('無効'),
    'external edit reaches saved settings',
  );
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '編集中に割り当てが変更されました' }).waitFor();
  await dialog.getByRole('button', { name: '編集をキャンセル', exact: true }).click();
  await page.evaluate(async (rows) => {
    const state = await window.dock.snapshot();
    state.settings.value.keybindings = rows;
    await window.dock.saveSettings(state.settings.value, state.settings.revision);
  }, original);
  await until(async () => (await conflict.innerText()).includes('無効'), 'external state restored');

  await add.click();
  await ready();
  await recorder().press('Enter');
  assert.equal(await recorder().innerText(), 'Enter');
  assert(await dialog.isVisible(), 'Enter records instead of applying');
  await recorder().press('Tab');
  assert(!(await recorder().evaluate((el) => el === document.activeElement)));
  await dialog.getByRole('button', { name: '特殊キーから選ぶ' }).click();
  await dialog.getByRole('button', { name: 'Ctrl', exact: true }).click();
  await page.screenshot({ path: path.join(profile, 'applet-shortcut-special.png') });
  await dialog.getByRole('button', { name: 'Escape', exact: true }).click();
  assert.match(await recorder().innerText(), /Ctrl[\s\S]*Escape/);
  await dialog.getByLabel('割り当てのいつ・どこで', { exact: true }).selectOption('applets');
  assert(await dialog.getByRole('button', { name: '追加', exact: true }).isDisabled());
  await dialog.getByRole('checkbox', { name: 'ホーム', exact: true }).check();
  await dialog.getByRole('switch', { name: 'この割り当てを有効にする', exact: true }).click();
  await page.screenshot({ path: path.join(profile, 'applet-shortcut-targets.png') });
  const position = await page.locator('.settings-body').evaluate((el) => el.scrollTop);
  await dialog.getByRole('button', { name: '追加', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.settings-body').evaluate((el) => el.scrollTop), position);
  assert(await add.evaluate((el) => el === document.activeElement));
  await save();
  const assigned = page.locator('[data-shortcut-command="test.a.second"] [data-binding-id]');
  const id = await assigned.getAttribute('data-binding-id');
  await save();
  const saved = (await snapshot()).settings.value.keybindings.find((row) => row.id === id);
  assert.equal(saved.key, 'Ctrl+Escape');
  assert.equal(saved.enabled, false);
  assert.deepEqual(saved.when, { scope: 'applets', appletIds: ['host:home'] });

  await assigned.locator('.applet-shortcut-edit').click();
  await ready();
  await recorder().press('Control+F8');
  await dialog.getByLabel('割り当てのいつ・どこで', { exact: true }).selectOption('owner');
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await save();
  const updated = (await snapshot()).settings.value.keybindings;
  assert.equal(updated.filter((row) => row.key === 'Ctrl+F8').at(-1).id, id);
  assert.deepEqual(
    updated.filter((row) => row.id !== id),
    original,
  );

  // Deletion immediately updates the saved settings and can be discarded before saving.
  await assigned.getByRole('button', { name: /その他の操作/ }).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
    '編集',
    'このキーの実行順…',
    '削除',
  ]);
  await page.getByRole('menuitem', { name: '削除', exact: true }).click();
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await assigned.count(), 0);
  await save();
  assert.equal(
    (await snapshot()).settings.value.keybindings.some((row) => row.id === id),
    false,
  );

  // Repeated additions restore focus and viewport, and default to this Applet.
  for (let i = 0; i < 2; i++) {
    const top = await page.locator('.settings-body').evaluate((el) => el.scrollTop);
    await add.click();
    await ready();
    assert.equal(
      await dialog.getByLabel('割り当てのいつ・どこで', { exact: true }).inputValue(),
      'owner',
    );
    await recorder().press('Shift+F12');
    await dialog.getByRole('button', { name: '追加', exact: true }).click();
    assert.equal(await page.locator('.settings-body').evaluate((el) => el.scrollTop), top);
    assert(await add.evaluate((el) => el === document.activeElement));
  }
  const extras = assigned.filter({ hasText: 'Shift+F12' });
  for (let i = 0; i < 2; i++) {
    await extras
      .first()
      .getByRole('button', { name: /その他の操作/ })
      .click();
    await page.getByRole('menuitem', { name: '削除', exact: true }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
  }
  await save();
  assert.equal(await assigned.count(), 0);
  checks.push(
    'Applet dialog / cancel and focus / Enter and special modifier keys / target validation / enabled state / saved settings and save / same-key tail insertion / immediate deletion persists / repeated addition without scrolling / left-aligned assignments',
  );

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 760 });
      await page.locator('[data-binding-id="overview.extra"] .applet-shortcut-edit').click();
      await ready();
      const bounds = await dialog.boundingBox();
      assert(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y + bounds.height <= 760,
      );
      assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: path.join(profile, `${theme}-${width}-applet-editor.png`) });
      await dialog.getByRole('button', { name: '編集をキャンセル', exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1280, height: 760 });
  checks.push('Applet editor dark/light at 1280, 900, 700px / bounded dialog and keyboard focus');
};

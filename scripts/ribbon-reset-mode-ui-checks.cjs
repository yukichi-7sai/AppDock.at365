const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function resetModeChecks(context) {
  let { host, rail, app } = context;
  const { until, saved, openRibbonSettings, restart, checks, profile } = context;
  let page = await openRibbonSettings();
  const layout = async () =>
    (await host.evaluate(() => window.dock.snapshot())).settings.value.ribbon;
  const item = async (id) =>
    (await rail.evaluate(() => window.appdockShell.get())).items.find((item) => item.id === id);
  const edit = async (id) => {
    await page
      .locator(`[data-ribbon-setting="${id}"]`)
      .getByRole('button', { name: /を編集$/ })
      .click();
    return host.getByRole('dialog').last();
  };
  const source = async (scope, name) =>
    scope
      .locator('.ribbon-icon-modes label')
      .filter({ hasText: new RegExp(`^${name}$`) })
      .click();
  const builtin = async (scope, name) => {
    await source(scope, '既定のアイコン');
    await scope.getByRole('button', { name, exact: true }).click();
  };
  const apply = (dialog) => dialog.getByTestId('settings-dialog-confirm').click();
  const cancel = (dialog) => dialog.getByTestId('settings-dialog-cancel').click();
  const reset = (dialog) => dialog.getByTestId('settings-dialog-reset').click();
  for (const [id, name, inherited] of [
    ['page:fixture.ribbon-icons:main', 'メール', false],
    ['group:colored', 'フォルダー', false],
    ['button:icon', 'アプレット', false],
    ['applet:fixture.ribbon-icons:main', 'ユーザー', true],
  ]) {
    const before = JSON.stringify(await layout());
    let dialog = await edit(id);
    const resetButton = dialog.getByTestId('settings-dialog-reset');
    const a = await resetButton.boundingBox(),
      b = await dialog.getByTestId('settings-dialog-confirm').boundingBox();
    assert(a.x < b.x);
    assert.equal(await resetButton.evaluate((element) => element.parentElement.tagName), 'FOOTER');
    await reset(dialog);
    if (inherited)
      assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
    else
      assert.equal(
        await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'),
        'true',
      );
    assert.equal(JSON.stringify(await layout()), before, 'reset remains a local draft');
    await cancel(dialog);
    assert.equal(JSON.stringify(await layout()), before, 'cancel restores previous icons');
    dialog = await edit(id);
    const nameInput = dialog.getByLabel(id.startsWith('group:') ? 'グループ名' : 'ボタン名', {
      exact: true,
    });
    const title = await nameInput.inputValue();
    await reset(dialog);
    assert.equal(await nameInput.inputValue(), title);
    await apply(dialog);
    await until(
      async () =>
        (await item(id))?.icon.name ===
        (id.startsWith('group:')
          ? 'folder'
          : id.startsWith('button:')
            ? 'extensions'
            : id.startsWith('page:')
              ? 'mail'
              : 'user'),
      'factory icon rendered',
    );
    assert.equal(!!(await item(id)).icon.assetId, inherited);
    const after = await layout();
    const baseline = JSON.parse(before);
    if (id.startsWith('group:')) {
      const expected = {
        ...baseline.groups.find((group) => group.id === id),
        icon: 'folder',
        image: null,
      };
      assert.deepEqual(
        after.groups.find((group) => group.id === id),
        expected,
      );
    } else if (id.startsWith('button:')) {
      assert.deepEqual(
        after.buttons.find((button) => button.id === id),
        { ...baseline.buttons.find((button) => button.id === id), icon: 'extensions', image: null },
      );
    } else
      assert.deepEqual(after.itemOverrides[id], {
        ...baseline.itemOverrides[id],
        icon: null,
        image: null,
      });
  }
  checks.push(
    'left footer reset is draft-only, supports cancel/apply and restores host/Applet/group/command defaults while preserving all other fields and inherited images',
  );

  const id = 'ribbon-display-mode';
  const setMode = async (mode) => {
    if ((await rail.evaluate(() => window.appdockShell.get())).displayMode !== mode)
      await rail.locator(`[data-ribbon-id="${id}"]`).click();
    await until(
      async () => (await rail.evaluate(() => window.appdockShell.get())).displayMode === mode,
      'mode active',
    );
  };
  const chooseImage = async (scope, label) => {
    await source(scope, '画像');
    await scope.locator('.registered-image-input-preview').click();
    const picker = host.getByRole('dialog', { name: '画像を選択', exact: true });
    await picker
      .locator('.ad-gallery-card')
      .filter({ hasText: 'fixture-image-with-a-long-name.png' })
      .locator('.ad-gallery-image')
      .click();
    await picker.getByRole('button', { name: '画像を使う', exact: true }).click();
  };
  let dialog = await edit(id);
  let compact = dialog.getByTestId('ribbon-mode-icon-compact'),
    expanded = dialog.getByTestId('ribbon-mode-icon-expanded');
  await chooseImage(compact);
  await builtin(expanded, 'ハート');
  await apply(dialog);
  await saved(
    (r) =>
      r.itemOverrides[id].displayModeIcons?.compact?.image?.file &&
      r.itemOverrides[id].displayModeIcons.expanded?.icon === 'heart',
  );
  await setMode('compact');
  assert((await item(id)).icon.assetId);
  await setMode('expanded');
  assert.equal((await item(id)).icon.name, 'heart');
  assert.equal((await item(id)).icon.assetId, undefined);
  dialog = await edit(id);
  compact = dialog.getByTestId('ribbon-mode-icon-compact');
  expanded = dialog.getByTestId('ribbon-mode-icon-expanded');
  await builtin(compact, 'カレンダー');
  await chooseImage(expanded);
  await dialog.screenshot({ path: path.join(profile, 'mode-specific-icons.png') });
  await apply(dialog);
  await saved(
    (r) =>
      r.itemOverrides[id].displayModeIcons?.compact?.icon === 'calendar' &&
      r.itemOverrides[id].displayModeIcons.expanded?.image?.file,
  );
  await setMode('compact');
  assert.equal((await item(id)).icon.name, 'calendar');
  assert.equal((await item(id)).icon.assetId, undefined);
  await setMode('expanded');
  assert((await item(id)).icon.assetId);
  ({ app, host, rail } = await restart());
  page = await openRibbonSettings();
  await setMode('compact');
  assert.equal((await item(id)).icon.name, 'calendar');
  await setMode('expanded');
  assert((await item(id)).icon.assetId);
  checks.push(
    'compact and expanded each support images and builtins independently; swapping both sources, toggling and real restart retain both appearances',
  );
  const beforeReset = JSON.stringify(await layout());
  dialog = await edit(id);
  await reset(dialog);
  for (const [mode, name] of [
    ['compact', '右向き矢印'],
    ['expanded', '左向き矢印'],
  ]) {
    const scope = dialog.getByTestId(`ribbon-mode-icon-${mode}`);
    assert.equal(
      await scope.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'),
      'true',
    );
    await source(scope, '画像');
    assert.equal(await scope.locator('img').count(), 0, 'reset also clears inactive image draft');
    await source(scope, '既定のアイコン');
  }
  await cancel(dialog);
  assert.equal(JSON.stringify(await layout()), beforeReset);
  dialog = await edit(id);
  await reset(dialog);
  await apply(dialog);
  await saved(
    (r) =>
      r.itemOverrides[id].displayModeIcons === null &&
      r.itemOverrides[id].icon === null &&
      r.itemOverrides[id].image === null,
  );
  for (const [mode, icon] of [
    ['compact', 'chevron'],
    ['expanded', 'chevron-left'],
  ]) {
    await setMode(mode);
    assert.equal((await item(id)).icon.name, icon);
    assert.equal((await item(id)).icon.assetId, undefined);
  }
  checks.push(
    'mode reset clears both state overrides and legacy common icon/image; cancel preserves both and apply restores dynamic factory arrows without resurrecting image drafts',
  );
};

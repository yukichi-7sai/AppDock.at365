const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ host, open, saved, save, checks, profile, row, until }) => {
  const baseline = await saved();
  const switchLabel = 'キージェスチャーを有効にする';
  const registered = async () => (await host.evaluate(() => window.dock.snapshot())).globalHotKeys;
  const nativeKey = 'Ctrl+Alt+F10';
  const setValue = async (change) => {
    const value = await saved();
    change(value);
    await host.evaluate(async (value) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(value, snapshot.settings.revision);
    }, value);
    await save();
  };
  const localPrevented = () =>
    host.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'F8',
        code: 'F8',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await open('shortcuts');
  const toggle = host.getByRole('switch', { name: switchLabel, exact: true });
  assert.equal(await toggle.getAttribute('aria-checked'), 'true');
  assert.equal(
    await host
      .getByTestId('key-gesture-options')
      .getByRole('switch')
      .first()
      .getAttribute('aria-label'),
    switchLabel,
  );
  await until(
    async () => (await registered()).some((s) => s.shortcut === nativeKey && s.registered),
    'enabled native key',
  );
  await until(localPrevented, 'enabled local input handler');
  await toggle.click();
  await save();
  assert.equal((await saved()).keybindingOptions.enabled, false);
  await until(async () => (await registered()).length === 0, 'native key removed while OFF');
  await until(async () => !(await localPrevented()), 'disabled local input handler');
  assert.deepEqual((await saved()).keybindings, baseline.keybindings);
  checks.push(
    'top switch immediately saves OFF, releases native keys and lets local input through',
  );

  await open();
  for (const [kind, title] of [
    ['shortcuts', 'キージェスチャー'],
    ['gestures', 'マウスジェスチャー'],
    ['touchpad-gestures', 'タッチパッドジェスチャー'],
  ]) {
    const mark = row(kind, 'same-id').getByRole('img', { name: title + 'が無効です' });
    await mark.waitFor();
    assert.equal(await mark.innerText(), 'OFF');
    assert.equal(await mark.getAttribute('title'), title + 'が無効です');
    await mark.scrollIntoViewIfNeeded();
    const markBounds = await mark.boundingBox();
    const triggerBounds = await row(kind, 'same-id')
      .locator('kbd[data-trigger-kind]')
      .boundingBox();
    assert(
      markBounds && triggerBounds && markBounds.x + markBounds.width <= triggerBounds.x,
      'whole-method OFF mark sits to the left outside the trigger frame',
    );
  }
  await row('shortcuts', 'same-id').scrollIntoViewIfNeeded();
  await host.screenshot({ path: path.join(profile, 'disabled-trigger-marks.png') });
  await setValue((value) => {
    value.host.theme = 'dark';
  });
  await host.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await host.screenshot({ path: path.join(profile, 'disabled-trigger-marks-dark.png') });
  await setValue((value) => {
    value.host.theme = baseline.host.theme;
  });
  const keyRow = row('shortcuts', 'same-id');
  await keyRow.getByTestId(/binding-condition-edit:/).click();
  const dialog = host.getByRole('dialog', { name: 'トリガーの編集', exact: true });
  await dialog.waitFor();
  await dialog.getByTestId('settings-dialog-cancel').click();
  assert.deepEqual((await saved()).keybindings, baseline.keybindings);
  checks.push('three method OFF marks identify their reason and trigger editing remains available');

  await setValue((value) => {
    value.gestures.enabled = true;
  });
  await until(
    async () =>
      (await row('gestures', 'same-id')
        .getByRole('img', { name: 'マウスジェスチャーが無効です' })
        .count()) === 0,
    'independent mouse mark refresh',
  );
  await row('touchpad-gestures', 'same-id')
    .getByRole('img', { name: 'タッチパッドジェスチャーが無効です' })
    .waitFor();
  await row('shortcuts', 'same-id')
    .getByRole('img', { name: 'キージェスチャーが無効です' })
    .waitFor();
  await setValue((value) => {
    value.gestures.enabled = false;
  });

  await open('shortcuts');
  await host.getByRole('switch', { name: switchLabel, exact: true }).focus();
  await host.keyboard.press('Space');
  await save();
  await until(
    async () => (await registered()).some((s) => s.shortcut === nativeKey && s.registered),
    'key restored after ON',
  );
  await until(localPrevented, 'restored local input handler');
  assert.deepEqual((await saved()).keybindings, baseline.keybindings);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')).keybindingOptions
      ?.enabled,
    undefined,
  );
  await open();
  await until(
    async () =>
      (await row('shortcuts', 'same-id')
        .getByRole('img', { name: 'キージェスチャーが無効です' })
        .count()) === 0,
    'key mark removed after ON',
  );
  await setValue((value) => {
    value.keybindings.find((r) => r.id === 'same-id').enabled = false;
  });
  await row('shortcuts', 'same-id')
    .locator('.binding-condition-cell')
    .getByText('無効', { exact: true })
    .waitFor();
  assert.equal(
    await row('shortcuts', 'same-id')
      .getByRole('img', { name: 'キージェスチャーが無効です' })
      .count(),
    0,
  );
  await setValue((value) => {
    value.keybindings.find((r) => r.id === 'same-id').enabled = true;
  });
  checks.push(
    'ON restores saved keys, omits the default and leaves individual disable status in the condition column only',
  );
  await open('shortcuts');
  await host.getByRole('switch', { name: switchLabel, exact: true }).click();
  await save();
  await host.setViewportSize({ width: 820, height: 680 });
  await host.getByRole('switch', { name: switchLabel, exact: true }).scrollIntoViewIfNeeded();
  await host.screenshot({ path: path.join(profile, 'key-switch-narrow.png') });
};

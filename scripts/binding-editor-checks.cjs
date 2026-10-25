const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ host, saved, save, checks, profile, row }) => {
  const dialog = host.getByTestId('settings-dialog');
  const original = await saved();
  const edit = async (kind) => {
    await row(kind, 'same-id').locator('.binding-condition-cell').hover();
    await row(kind, 'same-id').locator('.applet-shortcut-edit').click();
    await dialog.waitFor();
  };
  const apply = async () => {
    await dialog.getByTestId('binding-apply').click();
    await dialog.waitFor({ state: 'hidden' });
    await save();
  };
  const cancel = async () => {
    await dialog.getByTestId('binding-cancel').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const binding = async (kind) => {
    const settings = await saved();
    return (
      kind === 'shortcuts'
        ? settings.keybindings
        : kind === 'gestures'
          ? settings.gestures.bindings
          : settings.touchpadGestures.bindings
    ).find((item) => item.id === 'same-id');
  };

  for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
    await edit(kind);
    assert.equal(
      await dialog.getByTestId('binding-scope:app').getAttribute('aria-pressed'),
      'true',
    );
    await dialog.getByTestId('binding-scope:global').click();
    assert(await dialog.getByTestId('binding-excluded-processes').isDisabled());
    assert.match(await dialog.innerText(), /対応予定/);
    await dialog.getByRole('switch', { name: 'デスクトップを除外', exact: true }).click();
    await dialog.getByTestId('binding-scope:exe').click();
    const processes = dialog.getByRole('textbox', { name: '対象のexe名', exact: true });
    await processes.fill('C:\\invalid.exe');
    assert(await dialog.getByTestId('binding-apply').isDisabled());
    await processes.fill('NOTEPAD.EXE, explorer.exe');
    await dialog.getByTestId('binding-scope:browser').click();
    assert.equal(await dialog.getByTestId('binding-excluded-processes').count(), 0);
    assert.equal(
      await dialog.getByRole('switch', { name: 'デスクトップを除外', exact: true }).count(),
      0,
    );
    await dialog.getByTestId('binding-scope:exe').click();
    assert.equal(await processes.inputValue(), 'NOTEPAD.EXE, explorer.exe');
    await dialog.getByRole('switch', { name: 'デスクトップを除外', exact: true }).click();
    await apply();
    assert.deepEqual((await binding(kind)).when, {
      scope: 'exe',
      appletIds: [],
      processes: ['notepad', 'explorer'],
      excludeDesktop: true,
    });
    await edit(kind);
    assert.equal(
      await dialog.getByTestId('binding-scope:exe').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await processes.inputValue(), 'notepad, explorer');
    await dialog.getByTestId('binding-scope:applets').click();
    assert(await dialog.getByTestId('binding-apply').isDisabled());
    await dialog.getByTestId('binding-page:host:settings').check();
    await apply();
    assert.deepEqual((await binding(kind)).when.appletIds, ['host:settings']);
    assert.equal((await binding(kind)).when.excludeDesktop, undefined);
    await edit(kind);
    assert(await dialog.getByTestId('binding-page:host:settings').isChecked());
    await dialog.getByRole('textbox', { name: '対象ページを検索', exact: true }).fill('設定');
    await dialog.getByTestId('binding-page:host:settings').uncheck();
    assert(await dialog.getByTestId('binding-apply').isDisabled());
    await cancel();
    assert.deepEqual((await binding(kind)).when.appletIds, ['host:settings']);
    assert(
      await row(kind, 'same-id')
        .locator('.applet-shortcut-edit')
        .evaluate((element) => element === document.activeElement),
    );
    checks.push(
      `${kind}: shared scope transitions, invalid exe rejection, normalization, page selection, cancellation and focus return`,
    );
  }

  await edit('gestures');
  await dialog.getByTestId('gesture-steps:2').click();
  await dialog.getByTestId('gesture-direction:1:right').click();
  await dialog.getByTestId('gesture-direction:2:down').click();
  assert(await dialog.getByTestId('gesture-direction:2:right').isDisabled());
  await dialog.getByTestId('gesture-family:wheel').click();
  await dialog.getByTestId('gesture-action:wheel-down').click();
  await dialog.getByTestId('gesture-family:move').click();
  assert.equal(
    await dialog.getByTestId('gesture-direction:1:right').getAttribute('aria-pressed'),
    'true',
  );
  await dialog.getByTestId('gesture-steps:1').click();
  await dialog.getByTestId('gesture-steps:2').click();
  assert.match(await dialog.getByTestId('binding-input-summary').innerText(), /右.*下/);
  await host.screenshot({ path: path.join(profile, 'binding-mouse.png') });
  await apply();
  assert.equal((await binding('gestures')).gesture, 'move-right-down');
  await edit('gestures');
  assert.equal(
    await dialog.getByTestId('gesture-direction:2:down').getAttribute('aria-pressed'),
    'true',
  );
  await dialog.getByTestId('gesture-direction:1:down').click();
  assert(await dialog.getByTestId('gesture-direction:2:down').isDisabled());
  assert.equal(
    await dialog.getByTestId('gesture-direction:2:right').getAttribute('aria-pressed'),
    'true',
  );
  await cancel();
  checks.push(
    'mouse families and stage drafts persist during editing; two-stage direction swapping and stored order remain correct',
  );

  const touchpadIds = [
    'three.tap',
    'three.up',
    'three.down',
    'three.left',
    'three.right',
    'four.tap',
    'four.up',
    'four.down',
    'four.left',
    'four.right',
  ];
  for (const id of touchpadIds) {
    await edit('touchpad-gestures');
    assert.equal(await dialog.locator('[data-testid^="touchpad-action:"]').count(), 10);
    await dialog.getByTestId(`touchpad-action:${id}`).click();
    assert.equal(
      await dialog.getByTestId(`touchpad-action:${id}`).getAttribute('aria-pressed'),
      'true',
    );
    await apply();
    assert.equal((await binding('touchpad-gestures')).gesture, id);
  }
  await edit('touchpad-gestures');
  assert(
    await dialog
      .getByTestId('touchpad-action:four.right')
      .evaluate((element) => element === document.activeElement),
  );
  await dialog.getByTestId('touchpad-action:three.tap').focus();
  await dialog.getByTestId('touchpad-action:three.tap').press('Space');
  assert.equal(
    await dialog.getByTestId('touchpad-action:three.tap').getAttribute('aria-pressed'),
    'true',
  );
  await host.screenshot({ path: path.join(profile, 'binding-touchpad.png') });
  await cancel();
  assert.equal((await binding('touchpad-gestures')).gesture, 'four.right');
  checks.push(
    'all ten touchpad buttons save exact IDs; keyboard selection, initial focus and cancelled edits work',
  );

  await edit('shortcuts');
  await dialog
    .getByRole('button', { name: 'キージェスチャーを入力', exact: true })
    .press('Control+Shift+F9');
  await dialog.getByTestId('binding-scope:global').click();
  await dialog.getByRole('switch', { name: '元のキー入力をブロックする', exact: true }).click();
  await dialog.getByRole('switch', { name: 'この割り当てを有効にする', exact: true }).click();
  await apply();
  const key = await binding('shortcuts');
  assert.equal(key.key, 'Ctrl+Shift+F9');
  assert.equal(key.blockOriginalInput, false);
  assert.equal(key.enabled, false);
  assert.equal(key.when.excludedProcesses, undefined);
  checks.push(
    'key capture, original-input blocking and enabled toggle save together; pending global exclusions never enter settings',
  );

  for (const [theme, width, height] of [
    ['light', 1280, 760],
    ['dark', 760, 650],
    ['light', 480, 620],
  ]) {
    await host.setViewportSize({ width, height });
    await host.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
        snapshot.settings.revision,
      );
    }, theme);
    await save();
    for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      await edit(kind);
      await dialog.getByTestId('binding-scope:global').click();
      await host.screenshot({ path: path.join(profile, `binding-${kind}-${theme}-${width}.png`) });
      // Exercising the fixed footer also checks that long content remains dismissible.
      await cancel();
    }
  }
  checks.push(
    'all editors can be opened and cancelled in light/dark and narrow viewports; screenshots retained for manual review',
  );
  assert.deepEqual(
    (await saved()).touchpadGestures.connections,
    original.touchpadGestures.connections,
  );
  assert.deepEqual(
    (await saved()).keybindings.filter((item) => item.id !== 'same-id'),
    original.keybindings.filter((item) => item.id !== 'same-id'),
  );
  assert.equal((await saved()).gestures.distance, original.gestures.distance);
};

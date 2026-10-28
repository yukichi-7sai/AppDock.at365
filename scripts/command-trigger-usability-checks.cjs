const assert = require('node:assert/strict');
const { assertKeyboardFocus } = require('./ui-usability-helper.cjs');

module.exports = async ({ host, command, row, checks }) => {
  const dialog = host.getByTestId('settings-dialog');
  const cancel = async () => {
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const saved = () => host.evaluate(async () => (await window.dock.snapshot()).settings.value);
  const original = await saved();
  const add = host.getByTestId('binding-add:fixture.triggers.one:shortcuts');
  await host.getByTestId('command-provider:fixture.triggers.one').focus();
  await host.keyboard.press('Tab');
  await assertKeyboardFocus(add);
  await add.press('Enter');
  await dialog.waitFor();
  await cancel();
  assert(await add.evaluate((element) => element === document.activeElement));
  const condition = row('shortcuts', 'same-id').locator('.binding-condition-edit');
  await condition.focus();
  await condition.press('Enter');
  await dialog.getByTestId('command-stack-editor').waitFor();
  await cancel();
  assert(await condition.evaluate((element) => element === document.activeElement));
  const gear = row('shortcuts', 'same-id').locator('.binding-order');
  await gear.click();
  await dialog.getByTestId('command-stack-editor').waitFor();
  await cancel();
  checks.push(
    'keyboard addition and condition editing open real dialogs; cancellation restores focus',
  );

  for (const [kind, id, input, name] of [
    ['shortcuts', 'same-id', 'Ctrl+F8', 'キージェスチャー'],
    ['gestures', 'same-id', '移動: 上', 'マウスジェスチャー'],
    ['touchpad-gestures', 'touchpad-second', '3本指: タップ', 'タッチパッドジェスチャー'],
  ]) {
    const badge = row(kind, id).locator('.binding-input-filter');
    await badge.click();
    const chip = host.getByTestId('command-provider-filter');
    assert.equal((await chip.innerText()).trim(), input);
    assert.equal(
      await chip.getByRole('img', { name: `トリガー: ${name} · ${input}`, exact: true }).count(),
      1,
    );
    await chip.getByTestId('command-provider-filter-clear').click();
    assert(await badge.evaluate((element) => element === document.activeElement));
  }
  checks.push('input filters identify each trigger kind and clear back to the initiating control');

  await host.setViewportSize({ width: 700, height: 760 });
  const body = host.locator('.settings-body');
  const bar = host.getByRole('region', { name: 'コマンド一覧を横にスクロール', exact: true });
  await row('shortcuts', 'long-12').locator('.binding-input-filter').scrollIntoViewIfNeeded();
  await host.waitForFunction(() => {
    const body = document.querySelector('.settings-body');
    const bar = document.querySelector(
      '[role="region"][aria-label="コマンド一覧を横にスクロール"]',
    );
    return (
      bar?.clientWidth > 0 &&
      Math.abs(bar.scrollWidth - bar.clientWidth - (body.scrollWidth - body.clientWidth)) <= 1 &&
      Math.abs(bar.scrollLeft - body.scrollLeft) <= 1
    );
  });
  await bar.focus();
  await bar.press('End');
  try {
    await host.waitForFunction(() => {
      const element = document.querySelector('.settings-body');
      return (
        element.scrollLeft > 0 &&
        Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1
      );
    });
  } catch (error) {
    const state = await host.evaluate(() =>
      ['.settings-body', '[role="region"][aria-label="コマンド一覧を横にスクロール"]'].map(
        (selector) => {
          const element = document.querySelector(selector);
          return {
            selector,
            left: element.scrollLeft,
            width: element.clientWidth,
            scroll: element.scrollWidth,
          };
        },
      ),
    );
    throw new Error('End did not reach the horizontal edge: ' + JSON.stringify(state), {
      cause: error,
    });
  }
  await bar.press('Home');
  await host.waitForFunction(() => document.querySelector('.settings-body').scrollLeft === 0);
  const longAdd = host.getByTestId('binding-add:fixture.triggers.long:gestures');
  await command('fixture.triggers.long').locator('.command-title').hover();
  await longAdd.click({ trial: true });
  const position = await body.evaluate((element) => ({
    top: element.scrollTop,
    left: element.scrollLeft,
  }));
  await longAdd.click();
  await cancel();
  assert.deepEqual(
    await body.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft })),
    position,
  );
  assert(await longAdd.evaluate((element) => element === document.activeElement));
  checks.push(
    'narrow list supports keyboard horizontal scrolling and restores scroll/focus after a dialog',
  );

  const search = host.getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true });
  await search.fill('no-command-matches-this-filter');
  assert.equal(await host.locator('[data-shortcut-command]').count(), 0);
  assert.equal(await bar.isVisible(), false);
  await search.fill('');
  await bar.waitFor({ state: 'visible' });
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  await host.locator('.settings-panel-json textarea').waitFor();
  assert.equal(await bar.isVisible(), false);
  await host.getByTestId('command-trigger-tab:commands').click();
  await host.getByTestId('command-triggers-list').waitFor();
  await host.setViewportSize({ width: 1280, height: 840 });
  await body.evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  assert.deepEqual(await saved(), original, 'navigation, filters and cancelled dialogs never save');
  checks.push(
    'empty results and JSON/form switching remain usable without changing saved bindings',
  );
};

const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async ({ host, open, save, saved, checks, profile }) => {
  const pages = [
    ['shortcuts', 'キージェスチャー'],
    ['gestures', 'マウスジェスチャー'],
    ['touchpad-gestures', 'タッチパッドジェスチャー'],
  ];
  const execution = '条件に一致したコマンドの実行方法';
  const chromium = 'WebブラウザはChromiumウィンドウだけを対象にする';
  const original = await saved();
  for (const [id, title] of pages) {
    await open(id);
    await host.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    assert.equal(await host.locator('[data-shortcut-command], .command-binding-table').count(), 0);
    const first = host.locator('.settings-section').first();
    assert.equal(await first.locator('h2').count(), 0);
    assert.equal(await first.getByRole('combobox', { name: execution, exact: true }).count(), 1);
    if (id !== 'shortcuts') assert.equal((await first.getByRole('switch').count()) > 0, true);
    const common = host.getByTestId('gesture-common-options');
    assert.equal(await common.getByRole('heading', { name: 'ジェスチャー共通の設定' }).count(), 1);
    assert.equal(await common.locator('.settings-field-group').count(), 0);
    assert.equal(await host.locator('details.settings-section').count(), 0);
    assert.equal(
      await common.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).inputValue(),
      original.commandTriggerOptions.browsers.join(', '),
    );
  }
  checks.push(
    'three feature pages omit command lists, combine behavior with enablement in an untitled section and share an ungrouped browser section',
  );

  await open('shortcuts');
  await host
    .getByRole('textbox', { name: 'Webブラウザのexe', exact: true })
    .fill('FIREFOX.EXE, brave.exe');
  await host.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).press('Enter');
  await save();
  await host.getByRole('combobox', { name: execution, exact: true }).selectOption('first');
  await save();
  await open('gestures');
  assert.equal(
    await host.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).inputValue(),
    'firefox, brave',
  );
  await host.getByRole('switch', { name: chromium, exact: true }).click();
  await save();
  await open('touchpad-gestures');
  assert.equal(
    await host.getByRole('switch', { name: chromium, exact: true }).getAttribute('aria-checked'),
    'true',
  );
  assert.equal(
    await host.getByRole('textbox', { name: 'Webブラウザのexe', exact: true }).inputValue(),
    'firefox, brave',
  );
  await host.getByRole('combobox', { name: execution, exact: true }).selectOption('first');
  await save();
  const updated = await saved();
  assert.deepEqual(updated.commandTriggerOptions, {
    browsers: ['firefox', 'brave'],
    requireChromiumWindowClass: true,
  });
  assert.equal(updated.keybindingOptions.executionMode, 'first');
  assert.equal(updated.gestures.executionMode, 'all');
  assert.equal(updated.touchpadGestures.executionMode, 'first');
  for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures'])
    assert.equal(updated[key].browsers, undefined);
  assert.deepEqual(updated.keybindings, original.keybindings);
  assert.deepEqual(updated.gestures.bindings, original.gestures.bindings);
  assert.deepEqual(updated.touchpadGestures.bindings, original.touchpadGestures.bindings);
  checks.push(
    'editing common browsers and Chromium from different pages updates one saved source; per-trigger execution modes and all bindings remain independent',
  );

  const connection = host.getByTestId('touchpad-connection');
  assert.equal(await connection.evaluate((element) => element.tagName), 'SECTION');
  assert.equal(await connection.locator('select').count(), 10);
  assert.equal(await host.getByTestId('touchpad-windows-settings').getByRole('button').count(), 1);
  checks.push(
    'Windows connection stays expanded with ten configured keys; no key or OS setting is changed',
  );

  const style = async (locator) =>
    locator.evaluate((element) => {
      const value = getComputedStyle(element);
      return {
        background: value.backgroundColor,
        border: value.borderTopColor,
        radius: value.borderTopLeftRadius,
        font: value.fontSize,
        padding: value.paddingTop,
        height: element.getBoundingClientRect().height,
      };
    });
  const menu = host.locator('.settings-file-menu > summary');
  const idlePointer = async () => {
    await host.mouse.move(0, 0);
    await host.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  await idlePointer();
  const touchpadStyle = await style(menu);
  await menu.click();
  assert.equal(await host.locator('.settings-file-menu[open] button').count(), 2);
  await menu.click();
  await open('shortcuts');
  await idlePointer();
  const keyStyle = await style(host.locator('.settings-file-button'));
  assert.deepEqual(touchpadStyle, keyStyle);
  checks.push(
    'split-file menu summary matches the ordinary Open file button while retaining both file choices',
  );

  await open('applets');
  const links = host.locator('[data-applet-id="fixture.triggers"] .applet-management-links');
  assert.equal(await links.getByRole('button', { name: /コマンドトリガー/ }).count(), 1);
  assert.equal(
    await links
      .getByRole('button', { name: /キージェスチャー|マウスジェスチャー|タッチパッドジェスチャー/ })
      .count(),
    0,
  );
  await links.getByRole('button', { name: /コマンドトリガー/ }).click();
  await host.getByTestId('settings-page:command-triggers').waitFor();
  assert.match(await host.getByTestId('command-provider-filter').innerText(), /Trigger fixture/);
  assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 5);
  await host.getByTestId('command-provider-filter-clear').click();
  checks.push(
    'Applet management has one combined trigger link and opens the provider-filtered command trigger list',
  );

  await open('custom-commands');
  const custom = host.locator('.command-settings-links');
  assert.equal(await custom.getByRole('button').count(), 1);
  await custom.getByRole('button', { name: /コマンドトリガー/ }).click();
  await host.getByTestId('settings-page:command-triggers').waitFor();
  assert.match(await host.getByTestId('command-provider-filter').innerText(), /Trigger custom/);
  assert.equal(await host.locator('.command-triggers-editor [data-shortcut-command]').count(), 1);
  checks.push(
    'custom commands navigate only to the command-trigger list with their stable command target',
  );

  for (const theme of ['light', 'dark']) {
    await host.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
        snapshot.settings.revision,
      );
    }, theme);
    await save();
    for (const width of [1280, 760]) {
      await host.setViewportSize({ width, height: 760 });
      for (const [id] of pages) {
        await open(id);
        const common = host.getByTestId('gesture-common-options');
        await common.scrollIntoViewIfNeeded();
        const bounds = await common.evaluate((element) => {
          const page = element.closest('.settings-body');
          return { width: page.clientWidth, scrollWidth: page.scrollWidth };
        });
        assert(bounds.scrollWidth <= bounds.width + 1, `${theme}/${width}/${id} fits the page`);
        if (width === 760)
          await host.screenshot({
            path: path.join(profile, `gesture-settings-${theme}-${id}.png`),
          });
      }
    }
  }
  checks.push('all three feature layouts fit light/dark themes and 1280/760 viewports');
};

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { until } = require('./page-test-host.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');

module.exports = async ({ host, dock, category, at, back, owner, fixture, profile, report }) => {
  const commandName = 'チップから確認する対象コマンドをコマンドパレットで表示';
  const trigger = () => dock.getByTestId('command-description:' + owner + '.open');
  const popup = () => dock.getByRole('region', { name: 'Open fixture', exact: true });
  const open = async () => {
    await category('command-triggers');
    await trigger().scrollIntoViewIfNeeded();
    await trigger().hover();
    await popup().waitFor();
  };
  const noExecution = () => assert.equal(fs.existsSync(path.join(fixture, 'executed.txt')), false);
  await open();
  const accessibleText = await trigger().evaluate(
    (el) => document.getElementById(el.getAttribute('aria-describedby')).textContent,
  );
  assert.match(accessibleText, /チップから確認する対象コマンド/);
  assert(!accessibleText.includes('[command:'));
  assert.match(await popup().innerText(), /不明なコマンド.*fixture.missing/);
  assert.match(await popup().innerText(), /不明なページ.*missing/);
  assert.match(await popup().innerText(), /\[page:text-library\]/);
  assert.equal(await popup().locator('b').count(), 0);
  await popup().getByRole('button', { name: commandName, exact: true }).hover();
  await popup().getByRole('button', { name: commandName, exact: true }).click();
  const palette = await overlayPage(dock);
  assert.equal(await palette.getByRole('combobox').inputValue(), owner + '.target');
  noExecution();
  await palette.getByRole('combobox').press('Escape');
  await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
  await until(
    () =>
      dock.evaluate(() =>
        document.activeElement?.matches('[data-testid^="command-description:"], .command-link'),
      ),
    'focus restored after command palette',
  );
  noExecution();
  report(
    'Information chip resolves command/page names, preserves literal syntax and opens the selected command without execution',
  );

  await trigger().focus();
  await trigger().press('Tab');
  await until(
    () =>
      popup()
        .getByRole('button', { name: commandName, exact: true })
        .evaluate((el) => el === document.activeElement),
    'Tab enters chip',
  );
  await dock.keyboard.press('Tab');
  assert(
    await popup()
      .getByTestId('page-link:page:logs')
      .evaluate((el) => el === document.activeElement),
  );
  await dock.keyboard.press('Escape');
  await popup().waitFor({ state: 'hidden' });
  assert(await trigger().evaluate((el) => el === document.activeElement));
  await trigger().press('Enter');
  await popup().getByTestId('page-link:page:logs').press('Enter');
  await at('logs');
  await back();
  await open();
  await popup().getByTestId('page-link:setting:general').press('Space');
  await dock.getByTestId('settings-page:general').waitFor();
  await back();
  report(
    'Tab traverses links, Escape returns to the icon without reopening, and Enter/Space navigate with history',
  );

  await open();
  await trigger().focus();
  await trigger().press('Tab');
  await dock.mouse.move(1, 1);
  assert(await popup().isVisible());
  await dock.keyboard.press('Tab');
  await dock.keyboard.press('Tab');
  await dock.keyboard.press('Tab');
  await popup().waitFor({ state: 'hidden' });
  await open();
  await dock.getByTestId('settings-nav:general').click();
  await popup().waitFor({ state: 'hidden' });
  report('Focus inside keeps the chip open; Tab out and outside clicks close it');

  await category('notifications');
  const hint = dock.getByRole('button', { name: 'リンク付き通知ヒントのヒント', exact: true });
  const hintPopup = dock.getByRole('region', { name: 'リンク付き通知ヒント', exact: true });
  await hint.click();
  await hintPopup.getByRole('button', { name: commandName, exact: true }).click();
  const hintPalette = await overlayPage(dock);
  assert.equal(await hintPalette.getByRole('combobox').inputValue(), owner + '.target');
  await hintPalette.getByRole('combobox').press('Escape');
  await waitForHost(dock, async () => !(await window.dock.snapshot()).overlay.active);
  await hint.click();
  await hintPopup.getByTestId('page-link:page:logs').click();
  await at('logs');
  await back();
  await host.save({ host: { showHints: false } });
  await hint.waitFor({ state: 'hidden' });
  await open();
  assert(await popup().isVisible());
  await host.save({ host: { showHints: true } });
  noExecution();
  report(
    'Hint icons support the same links and obey the hint preference while information icons remain available',
  );

  await category('custom-commands');
  await dock.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
  const dialog = dock.getByTestId('settings-dialog');
  await dialog.getByTestId('custom-command-kind').selectOption(owner + '.custom');
  const draft = dialog.getByLabel('名前', { exact: true });
  await draft.fill('Keep unsaved draft');
  const info = dialog.getByTestId('custom-command-kind-info');
  await info.focus();
  await info.press('Tab');
  const dialogPopup = dialog.getByRole('region', { name: '種類', exact: true });
  await dialogPopup.getByTestId('page-link:setting:tts').waitFor();
  await dock.keyboard.press('Escape');
  await dialogPopup.waitFor({ state: 'hidden' });
  assert(await dialog.isVisible());
  assert(await info.evaluate((el) => el === document.activeElement));
  await info.press('Enter');
  await dialogPopup.getByTestId('page-link:setting:tts').click();
  await dialog
    .getByRole('alert')
    .filter({ hasText: /ダイアログ/ })
    .first()
    .waitFor();
  assert.equal(await draft.inputValue(), 'Keep unsaved draft');
  assert.equal((await dock.evaluate(() => window.dock.snapshot())).navigation.route, 'settings');
  await dialog.getByTestId('settings-dialog-cancel').click();
  await dialog.waitFor({ state: 'hidden' });
  report(
    'Nested chip Escape leaves the edit dialog open; rejected page navigation preserves the draft',
  );

  for (const [theme, width, height] of [
    ['light', 1720, 1000],
    ['dark', 900, 620],
  ]) {
    await host.save({ host: { theme } });
    await host.resize(width, height);
    await open();
    const box = await popup().boundingBox();
    const viewport = await dock.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height,
    );
    await dock.screenshot({ path: path.join(profile, `hint-links-${theme}-${width}.png`) });
  }
  await host.save({ host: { theme: 'light' } });
  await host.resize(1720, 1000);
  report('Information links remain within the window in light/wide and dark/narrow layouts');
  await category('appearance');
  const plainHint = dock.getByRole('button', { name: 'テーマのヒント', exact: true });
  await plainHint.hover();
  const plainPopup = dock
    .getByRole('tooltip')
    .filter({ hasText: 'ワークスペースの明るさを選びます。' });
  await plainPopup.waitFor();
  await plainPopup.hover();
  assert.equal(await plainPopup.innerText(), 'ワークスペースの明るさを選びます。');
  await dock.keyboard.press('Escape');
  await plainPopup.waitFor({ state: 'hidden' });
  await plainHint.focus();
  await plainPopup.waitFor();
  assert.equal(
    await plainHint.getAttribute('aria-describedby'),
    await plainPopup.getAttribute('id'),
  );
  await dock.keyboard.press('Escape');
  report('Plain hints retain hover, focus, accessible description and Escape behavior');
};

const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ host, open, save, saved, checks, profile }) => {
  const countText = (scope) => scope.locator('.command-list-summary-count').innerText();
  const baseline = await saved();
  await open();
  const commandList = host.getByTestId('command-triggers-list');
  const status = commandList.getByRole('combobox', { name: 'トリガーの絞り込み', exact: true });
  const command = (id) => host.locator(`[data-shortcut-command="fixture.triggers.${id}"]`);
  const chip = host.getByTestId('command-provider-filter');
  const clear = commandList.getByRole('button', { name: '絞り込みを解除', exact: true });
  await status.selectOption('assigned');
  await host.getByTestId('command-provider:fixture.triggers.one').click();
  assert.equal(await status.inputValue(), 'assigned');
  assert.equal(await command('one').count(), 1);
  assert.equal(await command('two').count(), 1);
  assert.equal(await command('new').count(), 0);
  await chip.getByRole('button').click();
  assert.equal(await status.inputValue(), 'assigned');
  checks.push('Applet target selection and its clear action retain the assignment filter');

  const input = command('one').locator('.binding-input-filter').first();
  await input.focus();
  await input.press('Enter');
  assert.equal(await status.inputValue(), 'assigned');
  assert.equal(await command('one').count(), 1);
  assert.equal(await command('two').count(), 0);
  await status.selectOption('unassigned');
  assert.equal(await commandList.locator('[data-shortcut-command]').count(), 0);
  await chip.getByRole('button').click();
  assert.equal(await status.inputValue(), 'unassigned');
  assert.equal(await command('new').count(), 1);
  assert(
    await commandList
      .getByRole('searchbox')
      .evaluate((element) => element === document.activeElement),
  );
  checks.push(
    'trigger targets combine with the selected status, retain empty results and clear back to search',
  );

  await status.selectOption('assigned');
  await host.getByTestId('command-provider:fixture.triggers.one').click();
  await host.getByTestId('command-trigger-filter:gestures').click();
  await clear.click();
  assert.equal(await status.inputValue(), 'all');
  assert.equal(await chip.count(), 0);
  assert.equal(await command('new').count(), 1);
  assert.equal(
    await host.getByTestId('command-trigger-filter:gestures').getAttribute('aria-pressed'),
    'true',
  );
  await host.getByTestId('command-provider:fixture.triggers.one').click();
  await clear.click();
  assert.equal(
    await chip.count(),
    0,
    'clear all is available when only an Applet target is active',
  );
  assert.deepEqual(await saved(), baseline);
  checks.push(
    'clear all resets status, trigger kinds and temporary targets without saving settings',
  );
  for (const context of ['command-triggers', 'feature']) {
    for (const [kind, input] of [
      ['shortcuts', 'Ctrl+F9'],
      ['gestures', 'move-right'],
      ['touchpad-gestures', 'three.tap'],
    ]) {
      if (context === 'command-triggers') {
        await open();
        await host.getByTestId('command-trigger-tab:' + kind).click();
      } else {
        await open(kind);
        await host.getByTestId('gesture-settings-tab:triggers').click();
      }
      const list = host.getByTestId('trigger-stack-table');
      await list.waitFor();
      const search = list.getByRole('searchbox', { name: 'トリガーを検索', exact: true });
      const mode = list.getByRole('combobox', { name: 'トリガーの実行方法で絞り込み' });
      assert.equal(await countText(list), '2 / 2 件');
      await search.fill('FIXTURE.TRIGGERS.TWO');
      assert.equal(await countText(list), '1 / 2 件');
      await mode.selectOption('first');
      await list.getByText('条件に一致するトリガーはありません。', { exact: true }).waitFor();
      assert.equal(await countText(list), '0 / 2 件');
      await mode.selectOption('inherit');
      assert.equal(await countText(list), '1 / 2 件');
      await list.getByTestId(`trigger-stacks:${kind}:list:edit:${input}`).click();
      const dialog = host.getByRole('dialog', { name: 'トリガーの編集', exact: true });
      assert.equal(await dialog.getByTestId('stack-execution-mode').inputValue(), 'inherit');
      await dialog.getByTestId('stack-execution-mode').selectOption('all');
      await dialog.getByTestId('settings-dialog-cancel').click();
      assert.deepEqual(await saved(), baseline);
      if (context === 'feature' && kind === 'shortcuts') {
        await list.getByTestId(`trigger-stacks:${kind}:list:edit:${input}`).click();
        await dialog.getByTestId('stack-execution-mode').selectOption('all');
        await dialog.getByTestId('settings-dialog-confirm').click();
        await save();
        const changed = await saved();
        assert.equal(changed.keybindingOptions.inputExecutionModes['Ctrl+F8'], 'first');
        assert.equal(changed.keybindingOptions.inputExecutionModes['Ctrl+F9'], 'all');
        assert.deepEqual(changed.keybindings, baseline.keybindings);
        await mode.selectOption('');
        await list.getByTestId(`trigger-stacks:${kind}:list:edit:${input}`).click();
        await dialog.getByTestId('stack-execution-mode').selectOption('inherit');
        await dialog.getByTestId('settings-dialog-confirm').click();
        await save();
        await mode.selectOption('inherit');
        assert.deepEqual(await saved(), baseline);
      }
      const clear = list.getByRole('button', { name: '絞り込みを解除', exact: true });
      if (context === 'feature' && kind === 'touchpad-gestures') {
        await host.setViewportSize({ width: 760, height: 650 });
        await clear.scrollIntoViewIfNeeded();
        const action = await clear.boundingBox();
        const counter = await list.locator('.command-list-summary-count').boundingBox();
        assert(
          action.x + action.width <= counter.x &&
            Math.abs(action.y + action.height / 2 - counter.y - counter.height / 2) < 2,
        );
        assert(
          await host
            .locator('.settings-body')
            .evaluate((body) => body.scrollWidth <= body.clientWidth + 1),
        );
        await host.screenshot({ path: path.join(profile, 'trigger-filter-narrow.png') });
      }
      await clear.click();
      assert.equal(await search.inputValue(), '');
      assert.equal(await mode.inputValue(), '');
      assert.equal(await countText(list), '2 / 2 件');
      assert.deepEqual(await saved(), baseline);
      checks.push(
        `${context}/${kind}: search, execution mode, empty state, unified counts, clear and filtered edit/cancel preserve saved inputs`,
      );
    }
  }
  await open();
  const commands = host.getByTestId('command-triggers-list');
  const allCount = await countText(commands);
  assert.match(allCount, /^(\d+) \/ \1 件$/);
  const commandTotal = Number(allCount.split(' / ')[1].split(' ')[0]);
  await commands.getByRole('searchbox').fill('fixture.triggers.two');
  assert.equal(await countText(commands), `1 / ${commandTotal} 件`);
  await commands.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
  assert.equal(await countText(commands), allCount);
  await open('applets');
  const applets = host.locator('.applet-management');
  const appletCount = await countText(applets);
  assert.match(appletCount, /^(\d+) \/ \1 件$/);
  const appletTotal = Number(appletCount.split(' / ')[1].split(' ')[0]);
  await applets.getByRole('searchbox').fill('no-such-applet');
  assert.equal(await countText(applets), `0 / ${appletTotal} 件`);
  await applets.getByRole('searchbox').fill('');
  assert.deepEqual(await saved(), baseline);
  checks.push(
    'command and Applet lists use the same visible / total count with and without filtering',
  );
  await host.screenshot({ path: path.join(profile, 'applet-unified-count.png') });
};

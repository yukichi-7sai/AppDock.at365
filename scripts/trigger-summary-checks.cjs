const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ host, open, saved, checks, profile }) => {
  const baseline = await saved();
  for (const context of ['command-triggers', 'feature']) {
    for (const [kind, input] of [
      ['shortcuts', 'Ctrl+F8'],
      ['gestures', 'move-up'],
      ['touchpad-gestures', 'four.right'],
    ]) {
      if (context === 'command-triggers') {
        await open();
        await host.getByTestId('command-trigger-tab:' + kind).click();
      } else {
        await open(kind);
        await host.getByTestId('gesture-settings-tab:triggers').click();
      }
      const table = host.getByTestId('trigger-stack-table');
      const row = table.getByTestId(`trigger-stacks:${kind}:list:row:${input}`);
      const commands = await row.getByRole('cell').nth(1).innerText();
      assert.match(commands, /Trigger new\s*\(無効\)/);
      assert.match(commands, /fixture\.triggers\.missing\s*\(現在利用できません\)/);
      assert(commands.indexOf('Trigger one') < commands.indexOf('Trigger new'));
      assert(commands.indexOf('Trigger new') < commands.indexOf('fixture.triggers.missing'));
      assert.equal(await table.getByRole('columnheader', { name: '操作' }).innerText(), '');
      await table.getByTestId(`trigger-stacks:${kind}:list:edit:${input}`).click();
      const dialog = host.getByRole('dialog', { name: 'トリガーの編集', exact: true });
      const disabled = dialog.getByTestId('stack-entry').filter({ hasText: 'Trigger new' });
      await disabled.getByRole('button', { name: /Trigger new/ }).click();
      const enabled = dialog.getByRole('checkbox', { name: '有効', exact: true });
      assert.equal(await enabled.isChecked(), false);
      await enabled.check();
      await dialog.getByTestId('settings-dialog-cancel').click();
      assert.match(await row.getByRole('cell').nth(1).innerText(), /Trigger new\s*\(無効\)/);
      await table.getByTestId(`trigger-stacks:${kind}:list:delete:${input}`).focus();
      assert.deepEqual(await saved(), baseline);
      if (context === 'feature' && kind === 'shortcuts') {
        const viewport = host.viewportSize();
        for (const [size, width] of [
          ['wide', 1100],
          ['narrow', 820],
        ]) {
          await host.setViewportSize({ width, height: 820 });
          await table
            .getByTestId(`trigger-stacks:${kind}:list:edit:${input}`)
            .scrollIntoViewIfNeeded();
          await host.screenshot({ path: path.join(profile, `trigger-column-${size}.png`) });
        }
        if (viewport) await host.setViewportSize(viewport);
      }
    }
    checks.push(
      `${context}: ordered command summaries expose disabled and unavailable entries; edit cancellation and actions preserve settings`,
    );
  }
};

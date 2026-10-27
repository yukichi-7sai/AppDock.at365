const assert = require('node:assert/strict');
const path = require('node:path');
const { applyTriggerStack } = require('../out/main/shared/trigger-stacks');
const title = 'Publication stack fixture';

exports.install = (settings) => {
  const entry = {
    id: 'publication-entry',
    command: 'appdock.noop',
    enabled: true,
    when: { scope: 'global', appletIds: [] },
  };
  settings.customCommands = {
    version: 2,
    items: [
      {
        id: '6a1336f5-0033-4f17-9557-fefb9ef1d451',
        typeId: 'appdock.commands.stack',
        owner: { kind: 'host' },
        title,
        description: '',
        configVersion: 1,
        enabled: true,
        automation: false,
        config: { executionMode: 'all', entries: [entry] },
      },
    ],
  };
  Object.assign(
    settings,
    applyTriggerStack(
      settings,
      {
        kind: 'gestures',
        input: 'move-up',
        executionMode: 'inherit',
        entries: [entry],
      },
      null,
    ),
  );
};

exports.check = async ({ page, profile, checks }) => {
  const cancel = async (dialog) => {
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await page.getByTestId('settings-nav:custom-commands').click();
  await page.getByRole('button', { name: title + 'を編集', exact: true }).click();
  let dialog = page.getByTestId('settings-dialog');
  await dialog.getByTestId('stack-execution-mode').waitFor();
  assert.equal(await dialog.locator('[data-mcp-lock]').count(), 0);
  await dialog.screenshot({ path: path.join(profile, 'mcp-named-stack.png') });
  await cancel(dialog);
  checks.push(
    'Named-stack configuration uses its public custom-command owner independently of command execution publication',
  );
  await page.getByTestId('command-stack-tab:gestures').click();
  await page
    .getByTestId('trigger-stack-table')
    .getByRole('button', { name: /を編集$/ })
    .first()
    .click();
  dialog = page.getByTestId('settings-dialog');
  await dialog.getByTestId('stack-execution-mode').waitFor();
  assert.equal(await dialog.locator('[data-mcp-lock]').count(), 0);
  await dialog.screenshot({ path: path.join(profile, 'mcp-trigger-stack.png') });
  await cancel(dialog);
  checks.push(
    'Trigger-stack identity, execution mode and conditions inherit the existing public input API in custom-command tabs',
  );
  await page.getByTestId('settings-nav:gestures').click();
  await page
    .getByTestId('trigger-stack-table')
    .getByRole('button', { name: /を編集$/ })
    .first()
    .click();
  dialog = page.getByTestId('settings-dialog');
  await dialog.getByTestId('stack-execution-mode').waitFor();
  assert.equal(await dialog.locator('[data-mcp-lock]').count(), 0);
  await cancel(dialog);
  checks.push(
    'The input settings page uses the same trigger-stack publication metadata as the custom-command editor',
  );
};

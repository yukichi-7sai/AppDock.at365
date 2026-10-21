const { settleSettings } = require('./settings-immediate-helper.cjs');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function ({
  page,
  shell,
  client,
  call,
  until,
  togglePermission,
  profile,
  webId,
  manage,
}) {
  const read = () => call(client, 'appdock_get_ribbon');
  const edit = async (operations, extras = {}) =>
    call(client, 'appdock_execute_command', {
      id: 'appdock.ribbon.update',
      args: { expectedRevision: (await read()).revision, operations, ...extras },
    });
  const denied = async (operations) =>
    (
      await client.callTool({
        name: 'appdock_execute_command',
        arguments: {
          id: 'appdock.ribbon.update',
          args: { expectedRevision: (await read()).revision, operations },
        },
      })
    ).structuredContent;
  const grant = () => togglePermission('Codexからのリボン編集を許可する');
  assert.equal((await read()).ribbonEditingAllowed, false);
  assert.equal((await denied([{ kind: 'reset' }])).code, 'RIBBON_EDITING_DISABLED');
  await grant();
  await until(async () => (await read()).ribbonEditingAllowed, 'ribbon grant');
  const file = path.join(profile, 'settings.json'),
    bytes = fs.readFileSync(file, 'utf8');
  const ops = [
    { kind: 'addSeparator', id: 'separator:mcp-test', placement: 'bottom' },
    { kind: 'update', id: 'logs', changes: { visible: false } },
    { kind: 'update', id: 'home', changes: { placement: 'bottom' } },
  ];
  assert.equal((await edit(ops, { dryRun: true })).completion, 'validated');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  await edit(ops);
  await page.getByRole('button', { name: 'リボン', exact: true }).click();
  const row = (id) => page.locator(`[data-ribbon-setting="${id}"]`);
  await until(
    async () => !(await row('logs').getByRole('checkbox').isChecked()),
    'hidden logs reflected',
  );
  assert.equal(await row('home').getByRole('combobox').inputValue(), 'bottom');
  await shell.locator('.ribbon-bottom [data-ribbon-id="home"]').waitFor();
  await shell.locator('.ribbon-bottom [data-ribbon-id="separator:mcp-test"]').waitFor();
  await shell.locator('[data-ribbon-id="logs"]').waitFor({ state: 'detached' });
  const bottom = (await read()).items
    .filter((i) => i.placement === 'bottom')
    .map((i) => i.id)
    .reverse();
  await edit([{ kind: 'reorder', placement: 'bottom', ids: bottom }]);
  await until(
    async () =>
      JSON.stringify(
        await shell
          .locator('.ribbon-bottom [data-ribbon-id]')
          .evaluateAll((els) => els.map((el) => el.dataset.ribbonId)),
      ) === JSON.stringify(bottom),
    'real bottom order',
  );
  await page.screenshot({ path: path.join(profile, 'mcp-ribbon-edited.png') });
  await shell.screenshot({ path: path.join(profile, 'mcp-ribbon-shell.png') });
  // Existing GUI writes remain visible through the same read API.
  await row('logs').getByRole('checkbox').check();
  await settleSettings(page);
  await until(
    async () => (await read()).items.find((i) => i.id === 'logs').visible,
    'GUI ribbon save',
  );
  await shell.locator('[data-ribbon-id="logs"]').waitFor();
  // A disabled Applet retains its configurable page, without implicit activation or navigation.
  await manage(webId, 'disable');
  const disabled = (await read()).items.find((i) => i.appletId === webId);
  assert.ok(disabled);
  assert.equal(disabled.enabled, false);
  await edit([
    { kind: 'update', id: disabled.id, changes: { visible: true, placement: 'bottom' } },
  ]);
  assert.equal((await call(client, 'appdock_get_applet', { id: webId })).applet.enabled, false);
  await shell.locator(`[data-ribbon-id="${disabled.id}"]`).waitFor({ state: 'detached' });
  await manage(webId, 'enable');
  await shell.locator(`.ribbon-bottom [data-ribbon-id="${disabled.id}"]`).waitFor();
  const saved = fs.readFileSync(file, 'utf8');
  assert.equal(
    (
      await denied([
        { kind: 'removeSeparator', id: 'separator:mcp-test' },
        { kind: 'reorder', placement: 'top', ids: [] },
      ])
    ).code,
    'INVALID_ARGUMENT',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await edit([{ kind: 'removeSeparator', id: 'separator:mcp-test' }]);
  await until(
    async () => (await shell.locator('[data-ribbon-id="separator:mcp-test"]').count()) === 0,
    'separator removed',
  );
  await edit([{ kind: 'reset' }]);
  assert.deepEqual((await read()).layout, {
    order: [],
    hidden: [],
    bottom: ['theme', 'profile'],
    separators: [],
  });
  await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
  await grant();
  await until(async () => !(await read()).ribbonEditingAllowed, 'ribbon revoke');
  assert.equal((await denied([{ kind: 'reset' }])).code, 'RIBBON_EDITING_DISABLED');
  await grant();
  await until(async () => (await read()).ribbonEditingAllowed, 'ribbon regrant');
  await edit([
    { kind: 'addSeparator', id: 'separator:mcp-persistent', placement: 'bottom' },
    { kind: 'update', id: 'logs', changes: { placement: 'bottom' } },
  ]);
  const logs = (await page.evaluate(() => window.dock.snapshot())).logs.filter(
    (l) => l.source === 'automation',
  );
  assert.ok(
    logs.some(
      (l) =>
        l.message.includes('target=appdock.ribbon.update') && l.message.includes('result=success'),
    ),
  );
  assert.ok(logs.some((l) => l.message.includes('API=ribbon.get')));
  assert.ok(!JSON.stringify(logs).includes('separator:mcp-test'));
};

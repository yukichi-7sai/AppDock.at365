const { settleSettings } = require('./settings-immediate-helper.cjs');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function ({
  page,
  client,
  call,
  until,
  togglePermission,
  profile,
  fixtureId,
  fixtureRoot,
}) {
  const read = () => call(client, 'appdock_get_tray');
  const edit = async (operations, extras = {}) =>
    call(client, 'appdock_execute_command', {
      id: 'appdock.tray.update',
      args: { expectedRevision: (await read()).revision, operations, ...extras },
    });
  const denied = async (operations) =>
    (
      await client.callTool({
        name: 'appdock_execute_command',
        arguments: {
          id: 'appdock.tray.update',
          args: { expectedRevision: (await read()).revision, operations },
        },
      })
    ).structuredContent;
  const grant = () => togglePermission('Codexからのタスクトレイ編集を許可する');
  const configure = (changes) => ({ kind: 'configure', changes });
  assert.equal((await read()).trayEditingAllowed, false);
  assert.equal(
    (await denied([configure({ doubleClickCommand: null })])).code,
    'TRAY_EDITING_DISABLED',
  );
  await grant();
  await until(async () => (await read()).trayEditingAllowed, 'tray grant');
  const file = require('./test-settings.cjs').file(profile, 'settings.json'),
    bytes = fs.readFileSync(file, 'utf8');
  const calls = path.join(fixtureRoot, 'calls.json'),
    beforeCalls = fs.readFileSync(calls, 'utf8');
  const ops = [
    {
      kind: 'add',
      parentId: null,
      item: { id: 'mcp-tray-group', type: 'group', title: 'MCP test group' },
    },
    {
      kind: 'add',
      parentId: 'mcp-tray-group',
      item: { id: 'mcp-tray-next', type: 'command', command: `${fixtureId}.next` },
    },
    { kind: 'add', parentId: 'mcp-tray-group', item: { id: 'mcp-tray-sep', type: 'separator' } },
    {
      kind: 'add',
      parentId: 'mcp-tray-group',
      item: { id: 'mcp-tray-open', type: 'command', command: 'appdock.open' },
    },
    configure({
      singleClickCommand: `${fixtureId}.next`,
      doubleClickCommand: 'appdock.settings.open',
    }),
  ];
  assert.equal((await edit(ops, { dryRun: true })).completion, 'validated');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  await edit(ops);
  assert.equal(fs.readFileSync(calls, 'utf8'), beforeCalls);
  await page.getByRole('button', { name: 'タスクトレイ', exact: true }).click();
  const row = (id) => page.locator(`[data-tray-item="${id}"]`);
  await row('mcp-tray-group').waitFor();
  assert.ok(
    (
      await page.getByRole('button', { name: 'トレイクリックのコマンドを選択' }).innerText()
    ).includes('next'),
  );
  assert.ok(
    (
      await page.getByRole('button', { name: 'トレイダブルクリックのコマンドを選択' }).innerText()
    ).includes('設定'),
  );
  await edit([
    { kind: 'update', id: 'mcp-tray-group', changes: { title: 'MCP renamed' } },
    {
      kind: 'reorder',
      parentId: 'mcp-tray-group',
      ids: ['mcp-tray-open', 'mcp-tray-sep', 'mcp-tray-next'],
    },
  ]);
  await until(
    async () => (await row('mcp-tray-group').innerText()).includes('MCP renamed'),
    'tray title reflection',
  );
  await page.screenshot({ path: path.join(profile, 'mcp-tray-edited.png') });
  await row('mcp-tray-group').locator('.tray-select').click();
  await page.getByRole('textbox', { name: 'グループ名' }).fill('GUI renamed');
  await settleSettings(page);
  await until(
    async () => (await read()).menu.find((i) => i.id === 'mcp-tray-group').title === 'GUI renamed',
    'tray GUI roundtrip',
  );
  const saved = fs.readFileSync(file, 'utf8');
  assert.equal(
    (
      await denied([
        configure({ singleClickCommand: 'appdock.open' }),
        { kind: 'remove', id: 'mcp-tray-group' },
      ])
    ).code,
    'INVALID_ARGUMENT',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  assert.equal(
    (await denied([configure({ singleClickCommand: `${fixtureId}.prepare-background` })])).code,
    'COMMAND_NOT_ASSIGNABLE',
  );
  await edit([
    { kind: 'move', id: 'mcp-tray-open', parentId: null, beforeId: 'mcp-tray-group' },
    { kind: 'ungroup', id: 'mcp-tray-group' },
    { kind: 'remove', id: 'mcp-tray-sep' },
    configure({ singleClickCommand: 'appdock.open', doubleClickCommand: null }),
  ]);
  const value = await read();
  assert.ok(value.menu.some((i) => i.id === 'mcp-tray-next'));
  assert.ok(!value.menu.some((i) => i.id === 'mcp-tray-group'));
  assert.equal(value.clicks.doubleClickCommand, null);
  await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
  await grant();
  await until(async () => !(await read()).trayEditingAllowed, 'tray revoke');
  assert.equal(
    (await denied([configure({ doubleClickCommand: null })])).code,
    'TRAY_EDITING_DISABLED',
  );
  await grant();
  await until(async () => (await read()).trayEditingAllowed, 'tray regrant');
  await edit([
    configure({
      singleClickCommand: 'appdock.logs.open',
      doubleClickCommand: 'appdock.settings.open',
    }),
  ]);
  const logs = (await page.evaluate(() => window.dock.snapshot())).logs.filter(
    (l) => l.source === 'automation',
  );
  assert.ok(
    logs.some(
      (l) =>
        l.message.includes('target=appdock.tray.update') && l.message.includes('result=success'),
    ),
  );
  assert.ok(logs.some((l) => l.message.includes('API=tray.get')));
  assert.ok(!JSON.stringify(logs).includes('mcp-tray-group'));
  assert.equal(fs.readFileSync(calls, 'utf8'), beforeCalls);
};

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
}) {
  const read = () => call(client, 'appdock_get_gestures');
  const edit = async (operations, extras = {}) =>
    call(client, 'appdock_execute_command', {
      id: 'appdock.gestures.update',
      args: { expectedRevision: (await read()).revision, operations, ...extras },
    });
  const denied = async (operations) =>
    (
      await client.callTool({
        name: 'appdock_execute_command',
        arguments: {
          id: 'appdock.gestures.update',
          args: { expectedRevision: (await read()).revision, operations },
        },
      })
    ).structuredContent;
  const grant = () => togglePermission('Codexからのジェスチャー編集を許可する');
  const original = await read();
  assert.equal(original.gestureEditingAllowed, false);
  const additions = ['next', 'start'].map((name, i) => ({
    kind: 'add',
    binding: {
      id: `mcp-gesture-${i}`,
      command: `${fixtureId}.${name}`,
      gesture: 'move-left',
      enabled: true,
      when: { scope: 'app', appletIds: [], processes: [] },
    },
  }));
  assert.equal((await denied(additions)).code, 'GESTURE_EDITING_DISABLED');
  await grant();
  await until(async () => (await read()).gestureEditingAllowed, 'gesture grant');
  const file = require('./test-settings.cjs').file(profile, 'settings.json'),
    bytes = fs.readFileSync(file, 'utf8');
  assert.equal((await edit(additions, { dryRun: true })).completion, 'validated');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  await edit([
    ...additions,
    { kind: 'configure', changes: { enabled: true, distance: 65, wheelDelayMs: 80 } },
  ]);
  await page.getByRole('button', { name: 'マウスジェスチャー', exact: true }).click();
  await page.locator('.gesture-settings-section > summary').click();
  await until(
    async () =>
      await page.getByRole('switch', { name: 'マウスジェスチャーを有効にする' }).isChecked(),
    'gesture enabled in GUI',
  );
  assert.equal(
    (await page.evaluate(() => window.dock.snapshot())).settings.value.gestures.distance,
    65,
  );
  const search = page.getByRole('searchbox', { name: 'ジェスチャーのコマンドを検索' });
  await search.fill(`${fixtureId}.next`);
  await page.getByText('← 左', { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(profile, 'mcp-gesture-created.png') });
  await edit([{ kind: 'reorder', gesture: 'move-left', ids: ['mcp-gesture-1', 'mcp-gesture-0'] }]);
  assert.deepEqual(
    (await read()).bindings.filter((r) => r.gesture === 'move-left').map((r) => r.id),
    ['mcp-gesture-1', 'mcp-gesture-0'],
  );
  await edit([
    {
      kind: 'update',
      id: 'mcp-gesture-0',
      changes: {
        gesture: 'key:control+f8',
        when: { scope: 'exe', appletIds: [], processes: ['Editor.EXE'] },
      },
    },
  ]);
  const changed = (await read()).bindings.find((r) => r.id === 'mcp-gesture-0');
  assert.equal(changed.gesture, 'key:Ctrl+F8');
  assert.deepEqual(changed.when.processes, ['editor']);
  const saved = fs.readFileSync(file, 'utf8');
  assert.equal(
    (
      await denied([
        { kind: 'configure', changes: { enabled: false } },
        { kind: 'configure', changes: { distance: 0 } },
      ])
    ).code,
    'INVALID_ARGUMENT',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
  await grant();
  await until(async () => !(await read()).gestureEditingAllowed, 'gesture revoke');
  assert.equal(
    (await denied([{ kind: 'remove', id: 'mcp-gesture-0' }])).code,
    'GESTURE_EDITING_DISABLED',
  );
  await grant();
  await until(async () => (await read()).gestureEditingAllowed, 'gesture regrant');
  await edit([
    { kind: 'remove', id: 'mcp-gesture-0' },
    { kind: 'remove', id: 'mcp-gesture-1' },
    { kind: 'configure', changes: { enabled: false } },
    {
      kind: 'add',
      binding: {
        id: 'mcp-gesture-persistent',
        command: 'appdock.open',
        gesture: 'move-up',
        enabled: false,
        when: { scope: 'app', appletIds: [], processes: [] },
      },
    },
  ]);
  const logs = (await page.evaluate(() => window.dock.snapshot())).logs.filter(
    (l) => l.source === 'automation',
  );
  assert.ok(
    logs.some(
      (l) =>
        l.message.includes('target=appdock.gestures.update') &&
        l.message.includes('result=success'),
    ),
  );
  assert.ok(logs.some((l) => l.message.includes('API=gestures.get')));
  assert.ok(!JSON.stringify(logs).includes('mcp-gesture-0'));
  assert.equal((await read()).settings.enabled, false);
};

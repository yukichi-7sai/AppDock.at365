const assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
module.exports = async ({ client, page, fixtureId, checks, tool, value }) => {
  const definitions = JSON.stringify((await client.listTools()).tools);
  const targets = (await value('appdock_settings_list_targets', { ownerId: fixtureId })).items;
  const target = targets.find(
    (target) => target.kind === 'list' && target.title.endsWith('/ Records'),
  );
  const protectedTarget = targets.find(
    (target) => target.kind === 'list' && target.title.endsWith('/ Protected records'),
  );
  assert(target && protectedTarget);
  const read = () => value('appdock_settings_list_items', { targetId: target.targetId });
  const apply = async (operations, dryRun = false) => {
    const snapshot = await read();
    return {
      targetId: target.targetId,
      expectedRevision: snapshot.revision,
      expectedSchemaRevision: snapshot.schemaRevision,
      requestId: randomUUID(),
      dryRun,
      operations,
    };
  };
  let rows = await read();
  assert.deepEqual(
    rows.items.map((row) => row.values.name),
    ['Same', 'Same'],
  );
  const previewRequest = await apply(
    [{ kind: 'add', beforeItemRef: rows.items[1].itemRef, values: { name: 'MCP added' } }],
    true,
  );
  assert.equal((await value('appdock_settings_apply', previewRequest)).completion, 'validated');
  assert.equal((await read()).revision, rows.revision);
  const addRequest = { ...previewRequest, dryRun: false, requestId: randomUUID() };
  const add = await value('appdock_settings_apply', addRequest);
  assert.deepEqual(await value('appdock_settings_apply', addRequest), add);
  rows = await read();
  assert.deepEqual(
    rows.items.map((row) => row.values.name),
    ['Same', 'MCP added', 'Same'],
  );
  assert.match(rows.items[1].values.id, /^[a-f0-9-]{36}$/);
  await value(
    'appdock_settings_apply',
    await apply([
      { kind: 'update', itemRef: rows.items[0].itemRef, changes: { name: 'Gateway renamed' } },
    ]),
  );
  assert.equal(
    (await page.evaluate(() => window.dock.snapshot())).settings.value.extensions[fixtureId]
      .settings.records[0].unknown.retained,
    7,
  );
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByRole('button', { name: 'Settings fixture', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings fixture', level: 1, exact: true }).waitFor();
  await page.getByText('Gateway renamed', { exact: true }).waitFor();
  await page.locator('[data-testid$=":list:edit:one"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Record name', { exact: true }).fill('UI renamed');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByText('UI renamed', { exact: true }).waitFor();
  rows = await read();
  assert.equal(rows.items[0].values.name, 'UI renamed');
  await value(
    'appdock_settings_apply',
    await apply([{ kind: 'reorder', itemRefs: rows.items.map((row) => row.itemRef).reverse() }]),
  );
  rows = await read();
  assert.deepEqual(
    rows.items.map((row) => row.values.name),
    ['Same', 'MCP added', 'UI renamed'],
  );
  await value(
    'appdock_settings_apply',
    await apply([{ kind: 'remove', itemRef: rows.items[1].itemRef }]),
  );
  assert.equal((await read()).items.length, 2);
  const guarded = await value('appdock_settings_list_items', {
    targetId: protectedTarget.targetId,
  });
  const guardedSchema = await value('appdock_settings_get_schema', {
    targetId: protectedTarget.targetId,
  });
  assert.equal(JSON.stringify([guarded, guardedSchema]).includes('PRIVATE_LIST'), false);
  assert.equal(guarded.items[0].removable, false);
  assert.equal(
    (
      await tool('appdock_settings_apply', {
        targetId: protectedTarget.targetId,
        expectedRevision: guarded.revision,
        expectedSchemaRevision: guarded.schemaRevision,
        requestId: randomUUID(),
        operations: [{ kind: 'remove', itemRef: guarded.items[0].itemRef }],
      })
    ).structuredContent.code,
    'LOCAL_ACTION_REQUIRED',
  );
  checks.push(
    'real MCP list add/partial update/remove/reorder, stable IDs/replay, hidden-column protection, shared UI editor and unknown fields',
  );
  const scalar = targets.find((target) => target.kind === 'fields');
  const options = await value('appdock_settings_list_options', {
    targetId: scalar.targetId,
    key: 'monitor',
  });
  assert.deepEqual(
    options.items.map((option) => option.value),
    ['primary', 'secondary'],
  );
  const monitor = await value('appdock_settings_get_values', {
    targetId: scalar.targetId,
    keys: ['monitor'],
  });
  await value('appdock_settings_apply', {
    targetId: scalar.targetId,
    expectedRevision: monitor.revision,
    expectedSchemaRevision: monitor.schemaRevision,
    requestId: randomUUID(),
    operations: [{ kind: 'set', changes: { monitor: 'secondary' } }],
  });
  assert.equal(
    (await value('appdock_settings_get_values', { targetId: scalar.targetId, keys: ['monitor'] }))
      .fields[0].value,
    'secondary',
  );
  assert.equal(JSON.stringify((await client.listTools()).tools), definitions);
  checks.push(
    'live Node Applet options use fixed settings entry points without command execution or tool refresh',
  );
};

const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const active = 'fixture.common-active',
  waiting = 'fixture.common-waiting';
module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    sharedFile = path.join(profile, 'settings.json'),
    deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`),
    marker = (id) => path.join(profile, 'extensions', id, 'activations.json'),
    count = (id) => (fs.existsSync(marker(id)) ? JSON.parse(fs.readFileSync(marker(id))) : 0),
    ai = fs.readFileSync(path.join(local, 'ai-keys.json')),
    tts = fs.readFileSync(path.join(local, 'tts-key.json')),
    orderId = (await value('appdock_settings_list_targets', { query: 'applet-management' }))
      .items[0].targetId,
    commonId = async (ownerId) =>
      (await value('appdock_settings_list_targets', { ownerId })).items.find(
        (item) => item.category === 'applet-common',
      ).targetId,
    read = (targetId) => value('appdock_settings_get_values', { targetId }),
    items = () => value('appdock_settings_list_items', { targetId: orderId }),
    applet = async (id) => (await value('appdock_get_applet', { id })).applet;
  const request = async (targetId, operations, dryRun = false) => {
    const schema = await value('appdock_settings_get_schema', { targetId });
    const state = schema.kind === 'list' ? await items() : await read(targetId);
    return {
      targetId,
      operations,
      expectedSchemaRevision: schema.schemaRevision,
      expectedRevision: state.revision,
      requestId: randomUUID(),
      dryRun,
    };
  };
  const id = await commonId(active),
    waitingId = await commonId(waiting),
    enabled = (state) => state.fields.find((field) => field.key === 'enabled'),
    set = async (targetId, next, dryRun = false) =>
      value(
        'appdock_settings_apply',
        await request(targetId, [{ kind: 'set', changes: { enabled: next } }], dryRun),
      );
  const shared = fs.readFileSync(sharedFile),
    device = fs.readFileSync(deviceFile),
    configuration = JSON.parse(device).extensions[active].configuration;
  assert.equal(count(active), 1);
  assert.equal((await set(id, false, true)).completion, 'validated');
  assert.equal((await applet(active)).state, 'running');
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  const disableRequest = await request(id, [{ kind: 'set', changes: { enabled: false } }]);
  const disabled = await value('appdock_settings_apply', disableRequest);
  assert.equal(disabled.completion, 'settingsSaved');
  assert.equal(disabled.effectVerified, false);
  await until(
    async () => (await applet(active)).state === 'stopped',
    'MCP disable stops the worker',
  );
  assert.deepEqual(await value('appdock_settings_apply', disableRequest), disabled);
  assert.equal(count(active), 1);
  await set(id, true);
  await until(
    async () => (await applet(active)).state === 'running' && count(active) === 2,
    'MCP enable starts one worker',
  );
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(deviceFile)).extensions[active].configuration,
    configuration,
  );
  checks.push(
    'Applet enabled dryRun does not save or stop; real save/replay uses the current PC, stops/starts through normal reconciliation exactly once and preserves shared/local configuration',
  );

  await page.getByTestId('settings-nav:applets').click();
  const row = page.locator(`[data-applet-id="${active}"]`),
    toggle = row.getByRole('switch');
  await until(
    async () => (await toggle.getAttribute('aria-checked')) === 'true',
    'management UI receives MCP enabled state',
  );
  const stale = await request(id, [{ kind: 'set', changes: { enabled: false } }]);
  await toggle.click();
  await until(
    async () =>
      (await applet(active)).state === 'stopped' && enabled(await read(id)).value === false,
    'native disable reaches MCP',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  await until(() => toggle.isEnabled(), 'native enable available');
  await toggle.click();
  await until(
    async () => (await applet(active)).state === 'running' && count(active) === 3,
    'native enable keeps existing lifecycle behavior',
  );
  await set(waitingId, false);
  await until(async () => (await applet(waiting)).state === 'stopped', 'waiting start cancelled');
  await set(waitingId, true);
  await until(
    async () => (await applet(waiting)).state === 'waiting',
    'enabled preference preserves startup delay',
  );
  assert.equal(count(waiting), 0);
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  checks.push(
    'Existing management toggles and MCP enabled values agree with stale-edit rejection; disabling cancels a pending start and re-enabling schedules the existing delay without early activation',
  );

  const schema = await value('appdock_settings_get_schema', { targetId: orderId });
  assert.deepEqual(Object.keys(schema.operationSchemas), ['reorder']);
  const rows = (await items()).items,
    refs = rows.map((item) => item.itemRef).reverse(),
    deviceBeforeOrder = fs.readFileSync(deviceFile),
    beforeOrder = fs.readFileSync(sharedFile);
  assert(rows.every((item) => !item.removable && item.writableKeys.length === 0));
  for (const operation of [
    { kind: 'add', values: { name: 'New' } },
    { kind: 'remove', itemRef: rows[0].itemRef },
    { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Other' } },
  ])
    assert.equal(
      (await tool('appdock_settings_apply', await request(orderId, [operation]))).structuredContent
        .code,
      'INVALID_ARGUMENT',
    );
  const operation = [{ kind: 'reorder', itemRefs: refs }];
  assert.equal(
    (await value('appdock_settings_apply', await request(orderId, operation, true))).completion,
    'validated',
  );
  assert.deepEqual(fs.readFileSync(sharedFile), beforeOrder);
  assert.deepEqual(fs.readFileSync(deviceFile), deviceBeforeOrder);
  const reorderRequest = await request(orderId, operation),
    saved = await value('appdock_settings_apply', reorderRequest);
  assert.deepEqual(await value('appdock_settings_apply', reorderRequest), saved);
  const orderedIds = rows.map((item) => item.values.id).reverse(),
    uiIds = () =>
      page
        .locator('[data-applet-id]')
        .evaluateAll((elements) => elements.map((element) => element.dataset.appletId));
  await until(
    async () => JSON.stringify(await uiIds()) === JSON.stringify(orderedIds),
    'MCP package order reaches native management table',
  );
  const storedOrder = JSON.parse(fs.readFileSync(sharedFile)).appletOrder;
  assert.equal(storedOrder[0], 'fixture.absent');
  assert.equal(storedOrder[2], 'fixture.saved-child');
  assert.deepEqual(fs.readFileSync(deviceFile), deviceBeforeOrder);
  assert.equal(count(active), 3);
  assert.equal(count(waiting), 0);
  checks.push(
    'Package order exposes reorder only: unsupported install/remove/update and dryRun leave files intact; save/replay changes the management display while retaining absent slots and PC settings without worker restarts',
  );

  const staleOrder = await request(orderId, [
    { kind: 'reorder', itemRefs: (await items()).items.map((item) => item.itemRef).reverse() },
  ]);
  await page.getByRole('button', { name: 'Appletを並べ替え', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Common fixtureを上へ', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(async () => {
    const current = (await items()).items.map((item) => item.values.id);
    return (
      JSON.stringify(current) !== JSON.stringify(orderedIds) &&
      JSON.stringify(current) === JSON.stringify(await uiIds())
    );
  }, 'native package reorder reaches MCP');
  assert.equal(
    (await tool('appdock_settings_apply', staleOrder)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  assert.deepEqual(fs.readFileSync(deviceFile), deviceBeforeOrder);
  assert.deepEqual(fs.readFileSync(path.join(local, 'ai-keys.json')), ai);
  assert.deepEqual(fs.readFileSync(path.join(local, 'tts-key.json')), tts);
  assert.equal(count(active), 3);
  assert.equal(count(waiting), 0);
  assert.equal((await value('appdock_get_info')).executable, false);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  await page.screenshot({ path: path.join(profile, 'applet-management-mcp.png') });
  fs.writeFileSync(
    path.join(profile, 'management-lifecycle.json'),
    JSON.stringify(
      {
        activations: count(active),
        waitingActivations: count(waiting),
        executeAllowed: false,
        order: JSON.parse(fs.readFileSync(sharedFile)).appletOrder,
      },
      null,
      2,
    ),
  );
  checks.push(
    'Native order dialog and MCP list remain consistent; stale requests fail, credential bytes and execute OFF stay intact and the same MCP tool definitions cover both additions',
  );
  await page.getByTestId('settings-nav:mcp-client').waitFor();
};
module.exports.install = (profile) => {
  const file = path.join(profile, 'settings.json'),
    settings = JSON.parse(fs.readFileSync(file));
  settings.appletOrder = [
    'fixture.absent',
    active,
    'fixture.saved-child',
    'fixture.common-disabled',
    waiting,
  ];
  fs.writeFileSync(file, JSON.stringify(settings));
};

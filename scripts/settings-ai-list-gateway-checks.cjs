const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const text = require('../src/shared/locales/ja/host.json');

module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools);
  const target = (await value('appdock_settings_list_targets', { limit: 100 })).items.find(
    (item) => item.kind === 'list' && item.category === 'ai',
  );
  assert(target);
  const targetId = target.targetId;
  const items = () => value('appdock_settings_list_items', { targetId });
  const request = async (operations, dryRun = false) => {
    const before = await items();
    return {
      targetId,
      operations,
      dryRun,
      expectedRevision: before.revision,
      expectedSchemaRevision: before.schemaRevision,
      requestId: randomUUID(),
    };
  };
  const apply = async (operations, dryRun = false) =>
    value('appdock_settings_apply', await request(operations, dryRun));
  const shared = path.join(profile, 'settings.json'),
    keyFile = path.join(local, 'ai-keys.json'),
    cipher = fs.readFileSync(keyFile),
    before = fs.readFileSync(shared);
  const add = {
    kind: 'add',
    values: { name: 'Service fixture', baseUrl: 'http://127.0.0.1:9/added/' },
  };
  const preview = await apply([add], true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.deepEqual(fs.readFileSync(shared), before);
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  const save = await request([add]),
    result = await value('appdock_settings_apply', save);
  assert.deepEqual(await value('appdock_settings_apply', save), result);
  let rows = (await items()).items;
  assert.equal(rows.length, 2);
  const addedId = rows[1].values.id;
  assert.notEqual(addedId, rows[0].values.id);
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  const table = page.getByTestId('ai-connections');
  await until(
    async () => (await table.locator('tbody tr[data-ai-connection]').count()) === 2,
    'AI UI received list add',
  );
  const added = table.locator(`tr[data-ai-connection="${addedId}"]`);
  await added.getByRole('button').first().click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(text['settings.aiConnectionDialog.nameLabel'], { exact: true })
    .fill('UI edited connection');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(async () => (await page.getByRole('dialog').count()) === 0, 'AI UI connection saved');
  await until(
    async () =>
      (await items()).items.find((row) => row.values.id === addedId)?.values.name ===
      'UI edited connection',
    'AI UI save reached list API',
  );
  rows = (await items()).items;
  const update = await request([
    {
      kind: 'update',
      itemRef: rows[1].itemRef,
      changes: { defaultModel: 'List model', 'compatibility.temperature': 0.3 },
    },
  ]);
  await value('appdock_settings_apply', update);
  await until(
    async () => (await added.locator('.ai-model-name').textContent()) === 'List model',
    'AI UI received list partial edit',
  );
  assert.equal(
    (await tool('appdock_settings_apply', { ...update, requestId: randomUUID() })).structuredContent
      .code,
    'REVISION_CONFLICT',
  );
  checks.push(
    'AI list real MCP dryRun/add/replay, duplicate names by stable ID, and existing UI partial edits agree',
  );

  rows = (await items()).items;
  assert.equal(rows[0].removable, false);
  assert(!rows[0].writableKeys.includes('baseUrl'));
  assert(rows[0].writableKeys.includes('defaultModel'));
  for (const dryRun of [true, false]) {
    for (const operation of [
      { kind: 'remove', itemRef: rows[0].itemRef },
      {
        kind: 'update',
        itemRef: rows[0].itemRef,
        changes: { baseUrl: 'http://127.0.0.1:9/rebound' },
      },
      { kind: 'update', itemRef: rows[0].itemRef, changes: { authentication: 'none' } },
      {
        kind: 'add',
        values: { name: 'Needs key', baseUrl: 'https://example.test/v1', authentication: 'bearer' },
      },
    ])
      assert.equal(
        (await tool('appdock_settings_apply', await request([operation], dryRun))).structuredContent
          .code,
        'LOCAL_ACTION_REQUIRED',
      );
  }
  assert(
    !/PRIVATE_|keyRevision|fingerprint|\$guard/.test(
      JSON.stringify([
        await value('appdock_settings_get_schema', { targetId }),
        await items(),
        preview,
      ]),
    ),
  );
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  checks.push(
    'AI list denies encrypted-key deletion, endpoint/auth rebinding and key-required additions; ciphertext remains identical',
  );

  rows = (await items()).items;
  await apply([{ kind: 'reorder', itemRefs: rows.map((row) => row.itemRef).reverse() }]);
  await until(
    async () =>
      JSON.stringify(
        await table
          .locator('tbody tr[data-ai-connection]')
          .evaluateAll((elements) => elements.map((element) => element.dataset.aiConnection)),
      ) === JSON.stringify([addedId, rows[0].values.id]),
    'AI UI received list order',
  );
  const general = await value('appdock_settings_get_values', { targetId: 'service.ai' });
  await value('appdock_settings_apply', {
    targetId: 'service.ai',
    operations: [{ kind: 'set', changes: { defaultConnectionId: addedId } }],
    expectedRevision: general.revision,
    expectedSchemaRevision: general.schemaRevision,
    requestId: randomUUID(),
  });
  rows = (await items()).items;
  await apply([{ kind: 'remove', itemRef: rows[0].itemRef }]);
  await until(async () => (await added.count()) === 0, 'AI UI received list removal');
  const current = await value('appdock_settings_get_values', { targetId: 'service.ai' });
  assert.equal(current.fields.find((field) => field.key === 'defaultConnectionId').hasValue, false);
  assert.equal(JSON.parse(fs.readFileSync(shared)).ai.defaultConnectionId, undefined);
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  checks.push(
    'AI list reorder updates UI with stable IDs and removing a default clears it without choosing another',
  );

  await table.getByRole('button', { name: text['settings.aiSettings.add'], exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(text['settings.aiConnectionDialog.nameLabel'], { exact: true })
    .fill('Local lifecycle');
  await dialog
    .getByLabel(text['settings.aiConnectionDialog.urlLabel'], { exact: true })
    .fill('http://127.0.0.1:9/local');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(
    async () => (await page.getByRole('dialog').count()) === 0,
    'local AI addition saved',
  );
  rows = (await items()).items;
  const localRow = rows.find((row) => row.values.name === 'Local lifecycle');
  assert(localRow);
  assert.equal(rows.length, 2);
  await table
    .locator(`tr[data-ai-connection="${localRow.values.id}"]`)
    .getByRole('button')
    .last()
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: text['settings.aiSettings.delete'], exact: true })
    .click();
  await until(async () => (await page.getByRole('dialog').count()) === 0, 'local AI removal saved');
  await until(
    async () => (await items()).items.length === 1,
    'local AI lifecycle reached list API',
  );
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  checks.push(
    'existing AI local add/delete dialogs share lifecycle defaults with MCP while the six transport tool definitions remain unchanged',
  );
};

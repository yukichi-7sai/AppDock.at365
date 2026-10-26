const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { settingsItemId } = require('../out/main/shared/settings-catalog');
const ownerId = 'test.settings-shortcut-list';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
exports.install = (profile) => {
  const directory = path.join(profile, 'extensions/shortcut-list');
  fs.mkdirSync(directory, { recursive: true });
  const settings = [
    {
      key: 'shortcuts',
      title: 'Shortcut entries',
      type: 'shortcut-list',
      default: [
        {
          id: 'one',
          title: 'Same',
          keys: 'Ctrl+J',
          retained: { private: 'PRIVATE_SHORTCUT_VALUE' },
        },
        { id: 'two', title: 'Same', keys: 'Alt+J' },
      ],
    },
    {
      key: 'private',
      title: 'Private shortcuts',
      type: 'shortcut-list',
      automation: false,
      default: [{ id: 'private', title: 'PRIVATE_SHORTCUT_TITLE', keys: 'Ctrl+P' }],
    },
  ];
  require('../out/main/shared/setting-definitions').parseSettingDefinitions(settings);
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      minimumHostVersion: '0.96.5',
      id: ownerId,
      name: 'Shortcut list fixture',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['settings'],
      settings,
    }),
  );
  // This fixture has no execution handlers or input hooks.
  fs.writeFileSync(path.join(directory, 'index.cjs'), 'exports.activate = async () => {};');
};

exports.check = async ({ page, profile, local, client, checks, tool, value, until }) => {
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const credentials = ['ai-keys.json', 'tts-key.json', 'mcp-client.json']
    .map((file) => path.join(local, file))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, sha256: hash(file) }));
  const target = await until(
    async () =>
      (await value('appdock_settings_list_targets', { ownerId })).items.find(
        (item) => item.kind === 'list' && item.category === 'settings' && item.available,
      ),
    'shortcut list target',
  );
  const read = (extra = {}) =>
    value('appdock_settings_list_items', { targetId: target.targetId, ...extra });
  const schema = () => value('appdock_settings_get_schema', { targetId: target.targetId });
  const request = async (operations, extra = {}) => ({
    targetId: target.targetId,
    expectedSchemaRevision: (await schema()).schemaRevision,
    expectedRevision: (await read()).revision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  assert.deepEqual(target.operations, ['add', 'update', 'remove', 'reorder']);
  const definition = await schema();
  assert.equal(definition.maxItems, 32);
  assert.deepEqual(
    definition.items.map((field) => [field.key, field.writable]),
    [
      ['id', true],
      ['title', true],
      ['keys', true],
    ],
  );
  assert.doesNotMatch(JSON.stringify([definition, await read()]), /PRIVATE_SHORTCUT|retained/);
  const settingsFile = path.join(profile, 'settings.json'),
    before = fs.readFileSync(settingsFile);
  const original = (await read()).items;
  const draft = await request(
    [
      {
        kind: 'update',
        itemRef: original[0].itemRef,
        changes: { id: 'mcp-renamed', title: 'MCP shortcut', keys: 'Ctrl+Shift+J' },
      },
    ],
    { dryRun: true },
  );
  assert.equal((await value('appdock_settings_apply', draft)).completion, 'validated');
  assert.deepEqual(fs.readFileSync(settingsFile), before);
  const save = { ...draft, requestId: randomUUID(), dryRun: false };
  const reply = await value('appdock_settings_apply', save);
  assert.deepEqual(await value('appdock_settings_apply', save), reply);
  assert.equal(reply.revision, (await read()).revision);
  const pageId = 'applet:' + ownerId;
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.locator(`[data-testid="settings-nav:${pageId}"]`).click();
  const field = page.locator(
    `fieldset[data-setting-item="${settingsItemId(pageId, 'setting:shortcuts')}"]`,
  );
  const entry = () => field.locator('.send-key-entry').first();
  await until(
    async () =>
      (await entry()
        .getByRole('textbox', { name: 'Shortcut entries 1 ID', exact: true })
        .inputValue()) === 'mcp-renamed',
    'MCP edit reaches native shortcuts',
  );
  assert.equal(await field.locator('[data-mcp-lock]').count(), 0);
  const privateField = page.locator(
    `fieldset[data-setting-item="${settingsItemId(pageId, 'setting:private')}"]`,
  );
  assert((await privateField.locator('[data-mcp-lock="private"]').count()) > 0);
  const name = entry().getByRole('textbox', { name: 'Shortcut entries 1 名前', exact: true });
  await name.fill('Native shortcut');
  await name.press('Enter');
  await until(
    async () => (await read()).items[0].values.title === 'Native shortcut',
    'native title reaches MCP',
  );
  const id = entry().getByRole('textbox', { name: 'Shortcut entries 1 ID', exact: true });
  await id.fill('native-renamed');
  await id.press('Enter');
  await until(
    async () => (await read()).items[0].values.id === 'native-renamed',
    'native ID edit reaches MCP',
  );
  const keys = entry().getByRole('textbox', { name: 'Shortcut entries 1 キー', exact: true });
  await keys.fill('Alt+Shift+J');
  await keys.press('Enter');
  await until(
    async () => (await read()).items[0].values.keys === 'Alt+Shift+J',
    'native key text reaches MCP',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(settingsFile)).extensions[ownerId].settings.shortcuts[0].retained
      .private,
    'PRIVATE_SHORTCUT_VALUE',
  );
  await page.screenshot({ path: path.join(profile, 'mcp-shortcut-list.png') });
  checks.push(
    'Shortcut declarations auto-publish all three columns through fixed MCP; dryRun/save/replay and native ID/name/key edits agree, while private lists stay locked and hidden row data is retained',
  );

  await field.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
  await until(async () => (await read()).items.length === 3, 'native shortcut addition');
  assert.deepEqual((await read()).items[2].values, {
    id: 'shortcut-1',
    title: '新しいキージェスチャー',
    keys: 'Ctrl+T',
  });
  await field.locator('.send-key-entry').last().getByRole('button', { name: /削除$/ }).click();
  await until(async () => (await read()).items.length === 2, 'native shortcut removal');
  await value(
    'appdock_settings_apply',
    await request([
      {
        kind: 'add',
        beforeItemRef: (await read()).items[1].itemRef,
        values: { id: 'mcp-added', title: 'Added shortcut', keys: 'Ctrl+Alt+J' },
      },
    ]),
  );
  await until(
    async () => (await field.locator('.send-key-entry').count()) === 3,
    'MCP addition reaches native editor',
  );
  const order = (await read()).items.map((item) => item.values.id).reverse();
  await value(
    'appdock_settings_apply',
    await request([
      { kind: 'reorder', itemRefs: (await read()).items.map((item) => item.itemRef).reverse() },
    ]),
  );
  assert.deepEqual(
    (await read()).items.map((item) => item.values.id),
    order,
  );
  assert.equal(
    (
      await tool(
        'appdock_settings_apply',
        await request([
          {
            kind: 'remove',
            itemRef: (await read()).items.find((item) => item.values.id === 'native-renamed')
              .itemRef,
          },
        ]),
      )
    ).structuredContent.code,
    'LOCAL_ACTION_REQUIRED',
  );
  const plain = (await read()).items.find((item) => item.values.id === 'mcp-added');
  await value(
    'appdock_settings_apply',
    await request([{ kind: 'remove', itemRef: plain.itemRef }]),
  );
  assert.deepEqual(
    (await read()).items.map((item) => item.values.id),
    order.filter((id) => id !== 'mcp-added'),
  );
  checks.push(
    'Native and MCP additions share defaults; insert/reorder/remove retain saved identities and unknown fields, and protected rows require local removal without sending any keys',
  );

  const current = await read({ limit: 1 });
  const stale = await request([
    { kind: 'update', itemRef: current.items[0].itemRef, changes: { title: 'Stale' } },
  ]);
  await value(
    'appdock_settings_apply',
    await request([
      { kind: 'update', itemRef: current.items[0].itemRef, changes: { title: 'Current' } },
    ]),
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  assert.equal(
    (
      await tool('appdock_settings_list_items', {
        targetId: target.targetId,
        limit: 1,
        cursor: current.nextCursor,
      })
    ).structuredContent.code,
    'REVISION_CONFLICT',
  );
  const preserved = fs.readFileSync(settingsFile),
    items = (await read()).items;
  for (const operations of [
    [{ kind: 'update', itemRef: items[0].itemRef, changes: { id: items[1].values.id } }],
    [{ kind: 'update', itemRef: items[0].itemRef, changes: { keys: 'Ctrl+Ctrl+J' } }],
    [
      { kind: 'update', itemRef: items[0].itemRef, changes: { title: 'Atomic refusal' } },
      { kind: 'update', itemRef: items[1].itemRef, changes: { keys: '%{F4}' } },
    ],
  ]) {
    assert.equal(
      (await tool('appdock_settings_apply', await request(operations))).structuredContent.code,
      'INVALID_ARGUMENT',
    );
    assert.deepEqual(fs.readFileSync(settingsFile), preserved);
  }
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  credentials.forEach((item) => assert.equal(hash(item.file), item.sha256));
  checks.push(
    'Duplicate IDs, invalid keys and later invalid changes are atomic; stale reads/cursors are refused, tool schemas and encrypted credential bytes stay unchanged',
  );
};

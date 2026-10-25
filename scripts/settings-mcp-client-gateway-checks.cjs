const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { randomUUID } = require('node:crypto');
module.exports = async ({ page, client, profile, local, secretId, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    target = (await value('appdock_settings_list_targets', { query: 'mcp-client' })).items.find(
      (item) => item.category === 'mcp-client',
    ),
    targetId = target.targetId,
    sharedFile = path.join(profile, 'settings.json'),
    deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`),
    localFile = path.join(local, 'mcp-client.json'),
    bytes = () => [sharedFile, deviceFile, localFile].map((file) => fs.readFileSync(file)),
    read = () => value('appdock_settings_list_items', { targetId }),
    row = async (id) => (await read()).items.find((item) => item.values.id === id);
  const request = async (operations, dryRun = false) => {
      const state = await read();
      return {
        targetId,
        operations,
        dryRun,
        expectedRevision: state.revision,
        expectedSchemaRevision: state.schemaRevision,
        requestId: randomUUID(),
      };
    },
    apply = async (operations, dryRun = false) =>
      value('appdock_settings_apply', await request(operations, dryRun));
  const secretBytes = fs.readFileSync(localFile),
    cipher = JSON.parse(secretBytes).entries[secretId].secret;
  const schema = await value('appdock_settings_get_schema', { targetId });
  assert.equal(schema.kind, 'list');
  assert.equal(schema.maxItems, 32);
  assert.equal(
    schema.items.find((field) => field.key === 'connection.publishedTools').inputSchema.maxItems,
    512,
  );
  const protectedRow = await row(secretId);
  assert.equal(protectedRow.removable, false);
  assert(!protectedRow.writableKeys.includes('connection.url'));
  for (const dryRun of [true, false]) {
    for (const operation of [
      { kind: 'remove', itemRef: protectedRow.itemRef },
      {
        kind: 'update',
        itemRef: protectedRow.itemRef,
        changes: { 'connection.url': 'http://127.0.0.1:9/rebound' },
      },
    ])
      assert.equal(
        (await tool('appdock_settings_apply', await request([operation], dryRun))).structuredContent
          .code,
        'LOCAL_ACTION_REQUIRED',
      );
  }
  assert.deepEqual(fs.readFileSync(localFile), secretBytes);
  checks.push(
    'MCP connection list discovers the owner schema and per-row restrictions; encrypted removal and rebinding fail for both dryRun and save',
  );

  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res.writeHead(503);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/mcp`,
      values = { name: ' Gateway MCP fixture ', 'connection.url': url },
      before = bytes();
    assert.equal((await apply([{ kind: 'add', values }], true)).completion, 'validated');
    assert.deepEqual(bytes(), before);
    const saveRequest = await request([{ kind: 'add', values }]),
      saved = await value('appdock_settings_apply', saveRequest);
    assert.equal(saved.effectVerified, false);
    assert.deepEqual(await value('appdock_settings_apply', saveRequest), saved);
    const id = JSON.parse(fs.readFileSync(sharedFile)).mcpServers.items.find(
      (item) => item.name === 'Gateway MCP fixture',
    ).id;
    await apply([
      {
        kind: 'update',
        itemRef: (await row(id)).itemRef,
        changes: {
          'connection.enabled': true,
          'connection.published': true,
          'connection.publishedTools': ['echo'],
        },
      },
    ]);
    await until(
      () => page.getByRole('button', { name: 'Gateway MCP fixtureを編集', exact: true }).count(),
      'MCP list native projection',
    );
    assert.equal(
      (await value('appdock_mcp_get_server_settings', { serverId: id })).connection.enabled,
      true,
    );
    assert.equal(requests, 0);
    assert.deepEqual(fs.readFileSync(deviceFile), before[1]);
    checks.push(
      'Real MCP add/dryRun/replay and partial connection updates keep execute/useMcp OFF, preserve shared/device storage, and send no HTTP requests',
    );

    await apply([
      {
        kind: 'update',
        itemRef: (await row(id)).itemRef,
        changes: { 'connection.enabled': false },
      },
    ]);
    const stale = await request([
      { kind: 'update', itemRef: (await row(id)).itemRef, changes: { description: 'Stale' } },
    ]);
    await page.getByRole('button', { name: 'Gateway MCP fixtureを編集', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '名前', exact: true }).fill('Native MCP fixture');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await until(async () => (await page.getByRole('dialog').count()) === 0, 'native MCP save');
    assert.equal((await row(id)).values.name, 'Native MCP fixture');
    assert.equal(
      (await tool('appdock_settings_apply', stale)).structuredContent.code,
      'REVISION_CONFLICT',
    );
    const ordered = (await read()).items;
    await apply([{ kind: 'reorder', itemRefs: ordered.map((item) => item.itemRef).reverse() }]);
    assert.deepEqual(
      (await value('appdock_mcp_get_server_settings')).items.map((item) => item.id),
      ordered.map((item) => item.values.id).reverse(),
    );
    assert.equal(requests, 0);
    checks.push(
      'Native MCP dialog edits immediately reach the common API; stale requests fail and generic reorder agrees with the existing management API',
    );

    const beforeInvalid = bytes();
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request([
            { kind: 'update', itemRef: (await row(id)).itemRef, changes: { description: 'Valid' } },
            {
              kind: 'update',
              itemRef: (await row(secretId)).itemRef,
              changes: { 'connection.authentication': 'none' },
            },
          ]),
        )
      ).structuredContent.code,
      'LOCAL_ACTION_REQUIRED',
    );
    assert.deepEqual(bytes(), beforeInvalid);
    await apply([
      {
        kind: 'update',
        itemRef: (await row(secretId)).itemRef,
        changes: { description: 'Generic metadata edit' },
      },
    ]);
    await apply([{ kind: 'remove', itemRef: (await row(id)).itemRef }]);
    assert.equal((await read()).items.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(localFile)).entries[id], undefined);
    assert.equal(JSON.parse(fs.readFileSync(localFile)).entries[secretId].secret, cipher);
    for (const hidden of [
      'PRIVATE_CREDENTIAL_FIXTURE',
      'tokenConfigured',
      'environmentNames',
      cipher,
    ])
      assert(!JSON.stringify(await read()).includes(hidden));
    assert.equal(JSON.stringify((await client.listTools()).tools), tools);
    assert.equal(requests, 0);
    checks.push(
      'A rejected late row is atomic; metadata edits preserve the encrypted cipher, non-secret removal is complete and tools/list stays unchanged',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

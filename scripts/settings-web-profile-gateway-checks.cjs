const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { settingsItemId } = require('../out/main/shared/settings-catalog');
const ownerId = 'test.settings-profiles';
const ids = [
  'account.11111111-1111-4111-8111-111111111111',
  'account.22222222-2222-4222-8222-222222222222',
];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rosterFile = (profile) => path.join(profile, 'data/web-profiles', ownerId, 'accounts.json');

exports.install = (profile) => {
  const directory = path.join(profile, 'extensions', 'profiles');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      minimumHostVersion: '0.96.4',
      id: ownerId,
      name: 'Profile settings fixture',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['settings', 'web-profiles'],
      settings: [
        {
          key: 'routes',
          title: 'Profile routes',
          type: 'object-list',
          default: [{ id: 'one', name: 'Fixture route', accountId: ids[0] }],
          fields: [
            { key: 'id', title: 'ID', type: 'string' },
            { key: 'name', title: 'Route name', type: 'string' },
            {
              key: 'accountId',
              title: 'Account',
              type: 'select',
              options: [],
              optionSource: 'web-profiles',
            },
          ],
          list: { idKey: 'id', titleKey: 'name', columns: ['name', 'accountId'] },
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(directory, 'index.cjs'), 'exports.activate = async () => {};');
  const file = rosterFile(profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      accounts: ids.map((id) => ({ id, name: 'Profile fixture', hidden: 'PRIVATE_PROFILE_VALUE' })),
      retained: { path: 'PRIVATE_PROFILE_PATH' },
    }),
  );
};

exports.check = async ({ page, profile, local, client, checks, tool, value, until }) => {
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const file = rosterFile(profile);
  const target = await until(
    async () =>
      (await value('appdock_settings_list_targets', { ownerId })).items.find(
        (item) => item.category === 'web-accounts' && item.available,
      ),
    'public profile roster',
  );
  const read = (extra = {}) =>
    value('appdock_settings_list_items', { targetId: target.targetId, ...extra });
  const schema = () => value('appdock_settings_get_schema', { targetId: target.targetId });
  const request = async (operations, extra = {}) => ({
    targetId: target.targetId,
    expectedRevision: (await read()).revision,
    expectedSchemaRevision: (await schema()).schemaRevision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  const definition = await schema();
  assert.deepEqual(target.operations, ['add', 'update']);
  assert.deepEqual(
    definition.items.map((field) => [field.key, field.writable]),
    [
      ['id', false],
      ['name', true],
    ],
  );
  const rows = await read({ limit: 1 });
  assert(rows.nextCursor);
  assert.equal(rows.items[0].removable, false);
  assert.doesNotMatch(
    JSON.stringify([definition, rows]),
    /PRIVATE_|pendingDeletion|Cookies|sessions|[A-Z]:\\/,
  );

  // Fake local bytes are created after ordinary startup cleanup has finished.
  const directory = path.join(local, 'web-profiles', ownerId);
  const cookie = path.join(directory, 'sessions', ids[0], 'Cookies.fixture');
  const pending = path.join(directory, 'pending-deletion.json');
  fs.mkdirSync(path.dirname(cookie), { recursive: true });
  fs.writeFileSync(cookie, 'PRIVATE_PROFILE_COOKIE_BYTES');
  fs.writeFileSync(pending, '[]');
  const preserved = [
    cookie,
    pending,
    ...['ai-keys.json', 'tts-key.json', 'mcp-client.json']
      .map((name) => path.join(local, name))
      .filter((entry) => fs.existsSync(entry)),
  ].map((entry) => ({ file: entry, sha256: hash(entry) }));
  const settingsFile = path.join(profile, 'settings.json');
  const settingsHash = hash(settingsFile);
  const settingsRevision = (await value('appdock_get_settings')).revision;
  const before = fs.readFileSync(file);
  const rename = await request(
    [{ kind: 'update', itemRef: rows.items[0].itemRef, changes: { name: 'MCP profile' } }],
    { dryRun: true },
  );
  assert.equal((await value('appdock_settings_apply', rename)).completion, 'validated');
  assert.deepEqual(fs.readFileSync(file), before);
  const save = { ...rename, requestId: randomUUID(), dryRun: false };
  const reply = await value('appdock_settings_apply', save);
  assert.equal(reply.effectVerified, false);
  assert.deepEqual(await value('appdock_settings_apply', save), reply);
  assert.equal((await read()).items[0].values.name, 'MCP profile');
  assert.equal(
    (
      await tool('appdock_settings_list_items', {
        targetId: target.targetId,
        limit: 1,
        cursor: rows.nextCursor,
      })
    ).structuredContent.code,
    'REVISION_CONFLICT',
  );

  await page.evaluate(() => window.dock.navigate('settings'));
  await page.locator('[data-testid="settings-nav:web-accounts"]').click();
  const table = page.locator(`[data-setting-item="${settingsItemId('web-accounts', 'accounts')}"]`);
  const input = table.locator(`tr[data-account-id="${ids[0]}"] input`);
  await until(
    async () => (await input.inputValue()) === 'MCP profile',
    'MCP rename reaches native roster',
  );
  assert.equal(await table.locator('thead th').first().locator('[data-mcp-lock]').count(), 0);
  assert.equal(
    await table.locator('thead th').last().locator('[data-mcp-lock="unsupported"]').count(),
    1,
  );
  await input.fill('Native profile');
  await input.press('Enter');
  await until(
    async () => (await read()).items[0].values.name === 'Native profile',
    'native rename reaches MCP',
  );
  await page.screenshot({ path: path.join(profile, 'mcp-web-profiles.png') });
  checks.push(
    'Web profile owners expose only ID/name while preserving local authentication and unknown roster data; dryRun/save/replay and native name edits agree, with only local destructive actions locked',
  );

  const add = await request([{ kind: 'add', values: { name: 'MCP added profile' } }]);
  const added = await value('appdock_settings_apply', add);
  assert.equal(added.changed, true);
  await until(
    async () => (await table.locator('tbody tr[data-account-id]').count()) === 3,
    'MCP added profile reaches native roster',
  );
  const count = (await read()).items.length;
  await table.getByRole('button', { name: 'アカウント枠を追加', exact: true }).click();
  await until(async () => (await read()).items.length === count + 1, 'native addition reaches MCP');
  const generic = (await value('appdock_settings_list_targets', { ownerId })).items.find(
    (entry) => entry.category === 'settings' && entry.kind === 'list',
  );
  const candidates = await value('appdock_settings_list_options', {
    targetId: generic.targetId,
    key: 'accountId',
  });
  assert(candidates.items.some((entry) => entry.label === 'Native profile'));
  assert(candidates.items.some((entry) => entry.label === 'MCP added profile'));
  assert.equal((await value('appdock_get_settings')).revision, settingsRevision);
  assert.equal(hash(settingsFile), settingsHash);
  const raw = JSON.parse(fs.readFileSync(file));
  assert.equal(raw.accounts[0].hidden, 'PRIVATE_PROFILE_VALUE');
  assert.equal(raw.retained.path, 'PRIVATE_PROFILE_PATH');
  preserved.forEach((entry) => assert.equal(hash(entry.file), entry.sha256));
  checks.push(
    'MCP and native additions share atomic roster saving; dynamic account options update without tool refresh, settings JSON/revision and encrypted credentials/session markers remain unchanged',
  );

  const current = await read();
  const stale = await request([
    { kind: 'update', itemRef: current.items[0].itemRef, changes: { name: 'Stale edit' } },
  ]);
  const changed = JSON.parse(fs.readFileSync(file));
  changed.accounts[0].name = 'External profile';
  fs.writeFileSync(file, JSON.stringify(changed));
  await until(
    async () => (await read()).items[0]?.values.name === 'External profile',
    'external roster watcher',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  for (const operations of [
    [{ kind: 'remove', itemRef: (await read()).items[0].itemRef }],
    [{ kind: 'reorder', itemRefs: (await read()).items.map((row) => row.itemRef).reverse() }],
    [
      {
        kind: 'update',
        itemRef: (await read()).items[0].itemRef,
        changes: { name: 'No private fields', token: 'PRIVATE_NEW_TOKEN' },
      },
    ],
  ]) {
    const result = await tool(
      'appdock_settings_apply',
      await request(operations, { dryRun: true }),
    );
    assert(['INVALID_ARGUMENT', 'NOT_FOUND'].includes(result.structuredContent.code));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|[A-Z]:\\/);
  }
  assert.equal((await read()).items[0].values.name, 'External profile');
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  preserved.forEach((entry) => assert.equal(hash(entry.file), entry.sha256));
  checks.push(
    'External roster changes invalidate stale edits/cursors; private keys, removal and reorder are refused through fixed tools and local authentication state stays unchanged',
  );
};

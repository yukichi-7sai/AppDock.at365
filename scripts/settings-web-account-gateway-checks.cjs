const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const privateOwner = 'test.service-private',
  groupOwner = 'test.service-group',
  peerOwner = 'test.service-peer';
const groupId = 'test.service-accounts';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const privateFile = (local, owner = privateOwner) =>
  path.join(local, 'web-accounts', owner, 'accounts.json');
const groupFile = (profile) =>
  path.join(profile, 'data', 'web-account-groups', groupId, 'accounts.json');
const stateFile = (local) => path.join(local, 'web-account-groups', groupId, 'state.json');
exports.install = (profile, local) => {
  const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json'),
    settings = JSON.parse(fs.readFileSync(settingsFile));
  for (const owner of [privateOwner, groupOwner, peerOwner]) {
    const directory = path.join(profile, 'extensions', owner);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.cjs'), 'exports.activate=async()=>{};');
    fs.writeFileSync(
      path.join(directory, 'index.html'),
      '<!doctype html><html><body>Service account fixture</body></html>',
    );
    fs.writeFileSync(path.join(directory, 'observer.js'), '({ready:true})');
    fs.writeFileSync(
      path.join(directory, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        minimumHostVersion: '0.104.0',
        id: owner,
        name: owner,
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['web-accounts'],
        webAccounts: {
          url: 'https://service-accounts.invalid/',
          origins: ['https://service-accounts.invalid'],
          observeOrigin: 'https://service-accounts.invalid',
          ui: 'index.html',
          observer: 'observer.js',
          ...(owner !== privateOwner
            ? { accountGroup: { id: groupId, title: 'Service group fixture' } }
            : {}),
        },
      }),
    );
    settings.extensions[owner] = { enabled: false, settings: {} };
  }
  fs.writeFileSync(settingsFile, JSON.stringify(settings));
  for (const [file, grouped] of [
    [privateFile(local), false],
    [groupFile(profile), true],
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        accounts: ids.map((id) => ({
          id,
          name: 'Service fixture',
          temporaryName: true,
          retained: 'PRIVATE_SERVICE_ROW',
          ...(!grouped ? { monitoring: false, sound: { enabled: false, file: '' } } : {}),
        })),
        retained: 'PRIVATE_SERVICE_ROOT',
        ...(!grouped ? { selected: ids[1] } : {}),
      }),
    );
  }
  fs.mkdirSync(path.dirname(stateFile(local)), { recursive: true });
  fs.writeFileSync(
    stateFile(local),
    JSON.stringify({
      version: 1,
      rosterKnown: true,
      members: {},
      legacySessions: {},
      retained: 'PRIVATE_SERVICE_LOCAL',
    }),
  );
};
exports.check = async ({ profile, local, page, client, checks, tool, value, until }) => {
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json'),
    settingsBefore = hash(settingsFile);
  const revision = (await value('appdock_get_settings')).revision;
  const localBefore = hash(stateFile(local));
  const marker = path.join(
    local,
    'web-accounts',
    privateOwner,
    'sessions',
    ids[0],
    'Cookies.fixture',
  );
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, 'PRIVATE_SERVICE_COOKIE');
  for (const owner of [privateOwner, groupOwner]) {
    const target = await until(
      async () =>
        (await value('appdock_settings_list_targets', { ownerId: owner })).items.find(
          (t) => t.category === 'web-accounts' && t.available,
        ),
      'service account target',
    );
    const read = (extra = {}) =>
      value('appdock_settings_list_items', { targetId: target.targetId, ...extra });
    const schema = await value('appdock_settings_get_schema', { targetId: target.targetId });
    assert.deepEqual(target.operations, ['add', 'update']);
    assert.deepEqual(
      schema.items.map((f) => [f.key, f.writable]),
      [
        ['id', false],
        ['name', true],
      ],
    );
    assert.equal(schema.maxItems, undefined);
    assert.doesNotMatch(
      JSON.stringify([schema, await read()]),
      /PRIVATE_|monitoring|selected|sound|Cookies|sessions|[A-Z]:\\/,
    );
    const request = async (operations, extra = {}) => ({
      targetId: target.targetId,
      expectedRevision: (await read()).revision,
      expectedSchemaRevision: schema.schemaRevision,
      requestId: randomUUID(),
      operations,
      ...extra,
    });
    const rows = await read({ limit: 1 });
    assert(rows.nextCursor);
    const file = owner === privateOwner ? privateFile(local) : groupFile(profile),
      before = fs.readFileSync(file);
    const preview = await request(
      [{ kind: 'update', itemRef: rows.items[0].itemRef, changes: { name: 'MCP service name' } }],
      { dryRun: true },
    );
    assert.equal((await value('appdock_settings_apply', preview)).completion, 'validated');
    assert.deepEqual(fs.readFileSync(file), before);
    const save = { ...preview, requestId: randomUUID(), dryRun: false },
      saved = await value('appdock_settings_apply', save);
    assert.equal(saved.effectVerified, false);
    assert.deepEqual(await value('appdock_settings_apply', save), saved);
    assert.equal((await read()).items[0].values.name, 'MCP service name');
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
    await value(
      'appdock_settings_apply',
      await request([{ kind: 'add', values: { name: 'MCP service added' } }]),
    );
    const current = await read();
    assert.equal(current.items.length, 3);
    for (const operation of [
      { kind: 'remove', itemRef: current.items[0].itemRef },
      { kind: 'reorder', itemRefs: current.items.map((r) => r.itemRef).reverse() },
      { kind: 'update', itemRef: current.items[0].itemRef, changes: { monitoring: true } },
    ]) {
      const refused = await tool(
        'appdock_settings_apply',
        await request([operation], { dryRun: true }),
      );
      assert(['INVALID_ARGUMENT', 'NOT_FOUND'].includes(refused.structuredContent.code));
      assert.doesNotMatch(JSON.stringify(refused), /PRIVATE_|[A-Z]:\\/);
    }
    const raw = JSON.parse(fs.readFileSync(file));
    assert.equal(raw.accounts[0].retained, 'PRIVATE_SERVICE_ROW');
    assert.equal(raw.retained, 'PRIVATE_SERVICE_ROOT');
    assert.equal(raw.accounts[0].temporaryName, false);
    if (owner === privateOwner) {
      assert.equal(raw.selected, ids[1]);
      assert.equal(raw.accounts[0].monitoring, false);
      assert.deepEqual(raw.accounts[0].sound, { enabled: false, file: '' });
    }
  }
  const peer = (await value('appdock_settings_list_targets', { ownerId: peerOwner })).items.find(
    (t) => t.category === 'web-accounts',
  );
  const peerRows = await value('appdock_settings_list_items', { targetId: peer.targetId });
  assert.equal(peerRows.items[0].values.name, 'MCP service name');
  assert.equal(peerRows.items.length, 3);
  const host = await page.evaluate(() => window.dock.snapshot());
  for (const owner of [privateOwner, groupOwner, peerOwner]) {
    const item = host.extensions.find((a) => a.id === owner);
    assert.equal(item.enabled, false);
    assert.equal(item.state, 'stopped');
  }
  assert.equal(hash(settingsFile), settingsBefore);
  assert.equal((await value('appdock_get_settings')).revision, revision);
  assert.equal(hash(stateFile(local)), localBefore);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'PRIVATE_SERVICE_COOKIE');
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  checks.push(
    'Service-specific and shared account rosters publish only ID/name while stopped: real MCP dryRun/save/replay/add work and shared members observe names without tool refresh',
  );
  checks.push(
    'Service account edits preserve selection, monitoring, unknown data, local preferences and login markers; destructive/private actions are refused and providers remain disabled',
  );
};

const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { McpClientSettings } = require('../out/main/main/core/mcp-client-settings');
const { mcpClientSettingsTarget } = require('../out/main/main/core/settings-mcp-client-target');
const { defaultMcpConnection } = require('../out/main/shared/mcp-client');

const targetId = 'service.mcp.servers';
function fixture(t) {
  const dir = path.resolve('.artifacts/settings-mcp-client-unit', randomUUID()),
    localFile = path.join(dir, 'local', 'mcp-client-secrets.json');
  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  fs.writeFileSync(localFile, JSON.stringify({ version: 1, entries: {} }));
  const store = new DeviceSettingsStore(
    path.join(dir, 'settings.json'),
    path.join(dir, 'local'),
    'TEST',
    () => [],
    () => [],
  );
  store.load();
  t.after(() => store.close());
  let crypts = 0,
    changes = 0,
    write = true,
    busy = false;
  const owner = new McpClientSettings(
    store,
    localFile,
    {
      encrypt: () => {
        crypts++;
        throw Error('Unexpected encryption');
      },
      decrypt: () => {
        crypts++;
        throw Error('Unexpected decryption');
      },
    },
    () => changes++,
    () => {
      if (busy) throw Error('busy');
    },
  );
  const save = (value, revision) => store.save(value, revision),
    commands = new SettingsCommands({ settings: store, applets: () => [], save });
  const api = new AppDockApi({
    settings: store,
    settingsCommands: commands,
    serviceSettingsTargets: () => [
      mcpClientSettingsTarget(owner, (revision) => commands.checkRevision(revision)),
    ],
    save,
    ready: () => true,
    writable: () => write,
    executable: () => false,
    version: 'test',
    instanceId: randomUUID(),
    applets: () => [],
    commands: () => [],
    execute: () => {
      throw Error('Unexpected execution');
    },
  });
  const call = (name, args = {}) => api.call('settings.' + name, args),
    read = () => call('items.list', { targetId }),
    schema = () => call('schema.get', { targetId }),
    request = (operations, dryRun = false) => ({
      targetId,
      operations,
      dryRun,
      requestId: randomUUID(),
      expectedRevision: read().revision,
      expectedSchemaRevision: schema().schemaRevision,
    }),
    apply = (operations, dryRun = false) => call('apply', request(operations, dryRun));
  const row = (id) => read().items.find((item) => item.values.id === id),
    add = (name = 'Same', url = 'http://example.test/mcp') => {
      apply([{ kind: 'add', values: { name, 'connection.url': url } }]);
      return owner.roster().at(-1).id;
    },
    bytes = () =>
      [store.shared.file, store.device.file, localFile].map((file) =>
        fs.existsSync(file) ? fs.readFileSync(file) : null,
      );
  return {
    dir,
    localFile,
    store,
    owner,
    api,
    call,
    read,
    schema,
    request,
    apply,
    row,
    add,
    bytes,
    crypts: () => crypts,
    changes: () => changes,
    setWrite: (value) => (write = value),
    setBusy: (value) => (busy = value),
  };
}

test('MCP settings API preserves long display text, URLs and stdio arguments', (t) => {
  const f = fixture(t),
    text = 'data'.repeat(20000);
  const id = f.add(text, 'http://example.test/' + text);
  f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes: { description: text } }]);
  assert.equal(f.row(id).values.name, text);
  assert.equal(f.row(id).values.description, text);
  assert.equal(f.row(id).values['connection.url'], 'http://example.test/' + text);
  f.apply([
    {
      kind: 'add',
      values: {
        name: 'stdio',
        'connection.transport': 'stdio',
        'connection.command': 'C:\\fixture.exe',
        'connection.args': [text],
      },
    },
  ]);
  const stdio = f.owner.roster().at(-1).id;
  assert.deepEqual(f.row(stdio).values['connection.args'], [text]);
});

test('MCP connections use fixed device storage and stable IDs without changing shared bytes', (t) => {
  const f = fixture(t),
    discovery = f.call('targets.list').items.find((item) => item.targetId === targetId);
  assert.equal(discovery.category, 'mcp-client');
  assert.deepEqual(discovery.operations, ['add', 'update', 'remove', 'reorder']);
  const schema = f.schema();
  assert.equal(schema.maxItems, undefined);
  assert.equal(schema.items.find((field) => field.key === 'id').writable, false);
  assert.equal(
    schema.items.find((field) => field.key === 'connection.args').inputSchema.maxItems,
    undefined,
  );
  assert.equal(
    schema.items.find((field) => field.key === 'connection.publishedTools').inputSchema.maxItems,
    undefined,
  );
  const before = f.bytes();
  assert.equal(
    f.apply(
      [{ kind: 'add', values: { name: ' Same ', 'connection.url': 'http://example.test' } }],
      true,
    ).completion,
    'validated',
  );
  assert.deepEqual(f.bytes(), before);
  const request = f.request([
      { kind: 'add', values: { name: ' Same ', 'connection.url': 'http://example.test' } },
    ]),
    saved = f.call('apply', request);
  assert.equal(saved.effectVerified, false);
  assert.equal(saved.completion, 'settingsSaved');
  assert.deepEqual(f.call('apply', request), saved);
  const id = f.owner.roster()[0].id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(f.row(id).values.name, 'Same');
  assert.equal(f.row(id).values['connection.url'], 'http://example.test/');
  const shared = JSON.parse(fs.readFileSync(f.store.shared.file)),
    device = JSON.parse(fs.readFileSync(f.store.device.file));
  assert.equal(shared.mcpClient, undefined);
  assert.equal(device.mcpClient.servers[0].id, id);
  assert.equal(device.mcpClient.servers[0].connection.enabled, false);
  assert.equal(device.mcpClient.servers[0].connection.published, false);
  assert.equal(f.crypts(), 0);
  assert.equal(f.changes(), 1);
});

test('partial edits, duplicate names, full ordering, deletion, no-op and stale item references are transactional', (t) => {
  const f = fixture(t),
    one = f.add(),
    two = f.add(),
    snapshot = f.read(),
    old = snapshot.items[0].itemRef;
  const update = f.request([
    { kind: 'update', itemRef: old, changes: { description: 'First' } },
    { kind: 'update', itemRef: snapshot.items[1].itemRef, changes: { name: 'Second' } },
  ]);
  f.call('apply', update);
  assert.equal(f.row(one).values.description, 'First');
  assert.equal(f.row(two).values.name, 'Second');
  assert.throws(() => f.call('apply', { ...update, requestId: randomUUID() }), {
    code: 'REVISION_CONFLICT',
  });
  assert.deepEqual(f.call('apply', update).completion, 'settingsSaved');
  const beforeNoop = f.bytes(),
    count = f.changes();
  assert.equal(
    f.apply([{ kind: 'update', itemRef: f.row(one).itemRef, changes: { name: ' Same ' } }]).changed,
    false,
  );
  assert.deepEqual(f.bytes(), beforeNoop);
  assert.equal(f.changes(), count);
  const items = f.read().items;
  f.apply([{ kind: 'reorder', itemRefs: items.map((item) => item.itemRef).reverse() }]);
  assert.deepEqual(
    f.owner.roster().map((item) => item.id),
    [two, one],
  );
  const local = fs.readFileSync(f.localFile);
  f.apply([{ kind: 'remove', itemRef: f.row(one).itemRef }]);
  assert.equal(f.owner.roster().length, 1);
  assert.equal(JSON.parse(fs.readFileSync(f.localFile)).entries[one], undefined);
  assert.deepEqual(fs.readFileSync(f.localFile), local);
  assert.equal(f.row(two).values['connection.url'], 'http://example.test/mcp');
  assert.throws(() => f.apply([{ kind: 'update', itemRef: old, changes: { name: 'Old' } }]), {
    code: 'REVISION_CONFLICT',
  });
});

test('encrypted and unreadable entries retain exact ciphers without any decryption in generic or legacy settings', (t) => {
  const f = fixture(t),
    secure = f.add('Secure'),
    broken = f.add('Broken'),
    plain = f.add('Plain');
  const entries = JSON.parse(fs.readFileSync(f.localFile));
  entries.entries[secure] = 'UNREADABLE_ENCRYPTED_CIPHER';
  entries.entries[broken] = { connection: { invalid: true }, secret: null, extra: 'PRESERVE_RAW' };
  fs.writeFileSync(f.localFile, JSON.stringify(entries, null, 3));
  const fileBefore = fs.readFileSync(f.localFile);
  for (const id of [secure, broken]) {
    const item = f.row(id);
    assert.equal(item.removable, false);
    assert(!item.writableKeys.includes('connection.url'));
    const detail = JSON.stringify(f.owner.publicSettings(id));
    for (const hidden of [
      'UNREADABLE_ENCRYPTED_CIPHER',
      'PRESERVE_RAW',
      'tokenConfigured',
      'environmentNames',
      'secret',
    ])
      assert(!detail.includes(hidden));
    for (const dryRun of [true, false]) {
      assert.throws(() => f.apply([{ kind: 'remove', itemRef: item.itemRef }], dryRun), {
        code: 'LOCAL_ACTION_REQUIRED',
      });
      assert.throws(
        () =>
          f.apply(
            [
              {
                kind: 'update',
                itemRef: item.itemRef,
                changes: { 'connection.url': 'http://other.test/mcp' },
              },
            ],
            dryRun,
          ),
        { code: 'LOCAL_ACTION_REQUIRED' },
      );
    }
  }
  f.apply([
    {
      kind: 'update',
      itemRef: f.row(secure).itemRef,
      changes: {
        name: 'Renamed',
        'connection.enabled': true,
        'connection.publishedTools': ['echo'],
      },
    },
    { kind: 'update', itemRef: f.row(broken).itemRef, changes: { description: 'Still damaged' } },
  ]);
  const after = JSON.parse(fs.readFileSync(f.localFile));
  assert.equal(after.entries[secure], entries.entries[secure]);
  assert.deepEqual(after.entries[broken], entries.entries[broken]);
  const detail = f.owner.publicSettings(secure);
  f.owner.update(
    {
      op: 'save',
      item: { ...detail.item, description: 'Legacy edit' },
      connection: detail.connection,
      expectedRevision: detail.revision,
    },
    true,
  );
  const beforeOrder = fs.readFileSync(f.localFile);
  f.owner.update(
    { op: 'reorder', ids: [plain, broken, secure], expectedRevision: f.owner.revision() },
    true,
  );
  assert.deepEqual(fs.readFileSync(f.localFile), beforeOrder);
  assert.equal(f.crypts(), 0);
  assert.deepEqual(fs.readFileSync(f.localFile), fileBefore);
});

test('secret input and new bearer bindings are rejected; both endpoint kinds preserve owner validation and limits', (t) => {
  const f = fixture(t),
    id = f.add();
  for (const changes of [{ token: '' }, { environment: {} }, { 'connection.secret': '' }])
    assert.throws(() => f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes }]), {
      code: 'NOT_FOUND',
    });
  assert.throws(
    () =>
      f.apply([
        {
          kind: 'update',
          itemRef: f.row(id).itemRef,
          changes: { 'connection.authentication': 'bearer' },
        },
      ]),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  f.apply([
    {
      kind: 'update',
      itemRef: f.row(id).itemRef,
      changes: {
        'connection.transport': 'stdio',
        'connection.command': path.join(f.dir, 'never-started.exe'),
        'connection.url': '',
        'connection.args': ['', '--flag'],
      },
    },
  ]);
  assert.deepEqual(f.row(id).values['connection.args'], ['', '--flag']);
  const toolNames = Array.from({ length: 512 }, (_, index) => `tool-${index}`);
  f.apply([
    {
      kind: 'update',
      itemRef: f.row(id).itemRef,
      changes: { 'connection.publishedTools': toolNames },
    },
  ]);
  assert.equal(f.row(id).values['connection.publishedTools'].length, 512);
  for (const changes of [
    { 'connection.publishedTools': ['same', 'same'] },
    { 'connection.command': 'relative.exe' },
    { 'connection.args': ['bad\0arg'] },
  ]) {
    const before = f.bytes();
    assert.throws(() => f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes }]), {
      code: 'INVALID_ARGUMENT',
    });
    assert.deepEqual(f.bytes(), before);
  }
  assert.equal(f.crypts(), 0);
});

test('unrelated edits and non-binding connection edits retain encrypted credentials', (t) => {
  const f = fixture(t),
    secure = f.add('Secure'),
    plain = f.add('Plain');
  const document = JSON.parse(fs.readFileSync(f.localFile));
  const device = structuredClone(f.store.value);
  device.mcpClient.servers.find((row) => row.id === secure).connection.authentication = 'bearer';
  f.store.save(device, f.store.revision);
  document.entries[secure] = 'PRESERVED_CIPHER';
  fs.writeFileSync(f.localFile, JSON.stringify(document, null, 2));
  const before = fs.readFileSync(f.localFile);
  f.apply([
    { kind: 'update', itemRef: f.row(plain).itemRef, changes: { description: 'Other row' } },
  ]);
  f.apply([{ kind: 'update', itemRef: f.row(secure).itemRef, changes: { name: 'Renamed' } }]);
  assert.deepEqual(fs.readFileSync(f.localFile), before);
  f.apply([
    { kind: 'update', itemRef: f.row(secure).itemRef, changes: { 'connection.enabled': true } },
  ]);
  assert.equal(f.row(secure).values['connection.url'], 'http://example.test/mcp');
  assert.equal(JSON.parse(fs.readFileSync(f.localFile)).entries[secure], 'PRESERVED_CIPHER');
  assert.equal(f.crypts(), 0);
});

test('validation failure on a later row, invalid reorder and ID edits leave both files unchanged', (t) => {
  const f = fixture(t),
    one = f.add(),
    two = f.add(),
    before = f.bytes();
  for (const operations of [
    [
      { kind: 'update', itemRef: f.row(one).itemRef, changes: { name: 'Valid' } },
      {
        kind: 'update',
        itemRef: f.row(two).itemRef,
        changes: { 'connection.url': 'https://example.test/?secret=bad' },
      },
    ],
    [{ kind: 'reorder', itemRefs: [f.row(one).itemRef, f.row(one).itemRef] }],
    [{ kind: 'update', itemRef: f.row(one).itemRef, changes: { id: randomUUID() } }],
    [
      { kind: 'update', itemRef: f.row(one).itemRef, changes: { name: 'Valid' } },
      { kind: 'update', itemRef: f.row(one).itemRef, changes: { name: 'Again' } },
    ],
  ]) {
    assert.throws(() => f.apply(operations), { code: 'INVALID_ARGUMENT' });
    assert.deepEqual(f.bytes(), before);
  }
});

test('permission revocation, owner busy, external local edits and final commit rechecks prevent saving', (t) => {
  const f = fixture(t),
    id = f.add(),
    request = f.request([
      { kind: 'update', itemRef: f.row(id).itemRef, changes: { name: 'Changed' } },
    ]);
  const saved = f.call('apply', request);
  assert.equal(saved.changed, true);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  assert.equal(f.read().items.length, 1);
  f.setWrite(true);
  f.setBusy(true);
  assert.throws(
    () =>
      f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes: { name: 'Busy' } }], true),
    { code: 'BUSY' },
  );
  f.setBusy(false);
  fs.writeFileSync(
    f.localFile,
    JSON.stringify({ version: 1, entries: { [id]: 'ORIGINAL_CIPHER' } }),
  );
  const stale = f.request([
      { kind: 'update', itemRef: f.row(id).itemRef, changes: { name: 'Stale' } },
    ]),
    entries = JSON.parse(fs.readFileSync(f.localFile));
  entries.entries[id] = 'CHANGED_CIPHER';
  fs.writeFileSync(f.localFile, JSON.stringify(entries));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  const snapshot = f.owner.publicConfiguration();
  snapshot.rows[0].name = 'Commit race';
  const plan = f.owner.planPublicConfiguration(snapshot.rows, snapshot.revision),
    before = fs.readFileSync(f.store.shared.file);
  entries.entries[id] = 'NEW_CIPHER';
  fs.writeFileSync(f.localFile, JSON.stringify(entries));
  assert.throws(() => plan.commit(), { code: 'REVISION_CONFLICT' });
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
});

test('whole secret corruption protects endpoints while metadata remains editable', (t) => {
  const f = fixture(t),
    id = f.add();
  const entries = JSON.parse(fs.readFileSync(f.localFile));
  delete entries.entries[id];
  fs.writeFileSync(f.localFile, JSON.stringify(entries, null, 2));
  const before = fs.readFileSync(f.localFile);
  f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes: { name: 'Roster only' } }]);
  assert.deepEqual(fs.readFileSync(f.localFile), before);
  f.apply([
    {
      kind: 'update',
      itemRef: f.row(id).itemRef,
      changes: { 'connection.url': 'http://configured.test/mcp' },
    },
  ]);
  assert.equal(f.row(id).values['connection.url'], 'http://configured.test/mcp');
  for (const text of ['{invalid', '{"version":2,"entries":{}}']) {
    fs.writeFileSync(f.localFile, text);
    const target = f.call('targets.list').items.find((item) => item.targetId === targetId);
    assert.equal(target.available, true);
    assert.equal(f.row(id).removable, false);
    assert.throws(() => f.apply([{ kind: 'remove', itemRef: f.row(id).itemRef }]), {
      code: 'LOCAL_ACTION_REQUIRED',
    });
    f.apply([{ kind: 'update', itemRef: f.row(id).itemRef, changes: { name: 'Still editable' } }]);
    assert.equal(fs.readFileSync(f.localFile, 'utf8'), text);
  }
});

test('device save failure leaves all files unchanged', (t) => {
  const f = fixture(t),
    id = f.add(),
    before = f.bytes(),
    save = f.store.device.save.bind(f.store.shared);
  f.store.device.save = () => {
    throw Error('PRIVATE_IO_DETAILS');
  };
  assert.throws(
    () =>
      f.apply([
        {
          kind: 'update',
          itemRef: f.row(id).itemRef,
          changes: { name: 'Failure', 'connection.url': 'http://other.test/mcp' },
        },
      ]),
    (error) => error.code === 'SAVE_FAILED' && !error.message.includes('PRIVATE_IO_DETAILS'),
  );
  f.store.device.save = save;
  assert.deepEqual(f.bytes(), before);
  assert.equal(f.crypts(), 0);
});

test('additional connection rows and restart-loaded IDs retain device values', (t) => {
  const f = fixture(t);
  const ids = Array.from({ length: 32 }, () => randomUUID());
  f.store.save(
    {
      ...f.store.value,
      mcpClient: {
        version: 1,
        commands: [],
        servers: ids.map((id) => ({
          id,
          name: 'Same',
          description: '',
          connection: { ...defaultMcpConnection(), url: 'http://example.test/mcp' },
          requiresEnvironment: false,
        })),
      },
    },
    f.store.revision,
  );
  assert.equal(f.read().items.length, 32);
  f.apply([
    { kind: 'add', values: { name: 'Additional', 'connection.url': 'http://example.test/mcp' } },
  ]);
  assert.equal(f.read().items.length, 33);
  const ref = f.row(ids[0]).itemRef;
  f.apply([
    { kind: 'update', itemRef: ref, changes: { 'connection.url': 'http://device.test/mcp' } },
  ]);
  f.store.reload();
  const reloaded = new McpClientSettings(
    f.store,
    f.localFile,
    {
      encrypt: () => {
        throw Error();
      },
      decrypt: () => {
        throw Error();
      },
    },
    () => {},
  );
  assert.deepEqual(
    reloaded.roster().map((item) => item.id),
    f.store.value.mcpClient.servers.map((item) => item.id),
  );
  assert.equal(reloaded.publicSettings(ids[0]).connection.url, 'http://device.test/mcp');
  assert.equal(f.crypts(), 0);
});

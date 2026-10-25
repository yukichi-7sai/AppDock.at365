const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
function fixture(
  t,
  {
    id = true,
    hidden = false,
    device = false,
    local = true,
    collection = false,
    rows,
    fields,
    definition = {},
  } = {},
) {
  const dir = path.resolve('.artifacts/settings-lists-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const list = parseSettingDefinitions([
    {
      key: 'records',
      title: 'Records',
      type: 'object-list',
      automation: true,
      default: [],
      fields: fields ?? [
        ...(id ? [{ key: 'id', title: 'Identity', type: 'string' }] : []),
        { key: 'name', title: 'Name', type: 'string', default: 'New', minLength: 1, maxLength: 80 },
        { key: 'enabled', title: 'Enabled', type: 'boolean', default: false },
        {
          key: 'scope',
          title: 'Scope',
          type: 'select',
          options: [
            { value: 'app', label: 'App' },
            { value: 'global', label: 'Global' },
          ],
          default: 'app',
          propertyPath: ['when', 'scope'],
        },
        { key: 'folders', title: 'Folders', type: 'string-list', default: [], aliases: ['folder'] },
        {
          key: 'mode',
          title: 'Mode',
          type: 'select',
          options: [
            { value: 'fill', label: 'Fill' },
            { value: 'fit', label: 'Fit' },
          ],
          default: 'fill',
          numericOptions: true,
        },
        ...(hidden
          ? [
              {
                key: 'credential',
                title: 'PRIVATE_TITLE',
                type: 'string',
                secret: true,
                automation: true,
                default: 'PRIVATE_DEFAULT',
              },
              {
                key: 'local',
                title: 'PRIVATE_LOCAL',
                type: 'boolean',
                localOnly: true,
                default: false,
              },
            ]
          : []),
      ],
      list: { columns: ['name'], titleKey: 'name', ...(id ? { idKey: 'id' } : {}) },
      ...definition,
    },
  ])[0];
  const owner = {
    id: 'test.list-provider',
    displayName: 'List provider',
    enabled: true,
    state: 'running',
    settingOptions: {},
    settings: [list],
  };
  const owners = [owner],
    choices = [{ value: 'account.one', label: 'Account One' }];
  const store = device
    ? new DeviceSettingsStore(
        path.join(dir, 'settings.json'),
        path.join(dir, 'local'),
        'TEST',
        () =>
          collection
            ? [
                {
                  owner: owner.id,
                  definition: { key: 'records', source: 'local', ui: 'main.html', fields: [] },
                },
              ]
            : [],
        () => owners,
      )
    : new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      extensions: {
        [owner.id]: {
          enabled: true,
          settings: {
            records: rows ?? [
              {
                ...(id ? { id: 'one' } : {}),
                name: 'Same',
                enabled: false,
                folder: 'A:/old',
                mode: 0,
                when: { scope: 'app', privateSibling: { keep: 7 } },
                unknown: { keep: 1 },
              },
              { ...(id ? { id: 'two' } : {}), name: 'Same', enabled: true, unknown: { keep: 2 } },
            ],
          },
        },
      },
    },
    store.revision,
  );
  if (device && local) store.setLocalSettings(owner.id, true, store.revision);
  let writes = 0,
    write = true,
    principal = 'one';
  const options = {
    settings: store,
    applets: () => owners,
    settingOptions: () => choices,
    save: (value, revision) => {
      writes++;
      return store.save(value, revision);
    },
  };
  const commands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    ready: () => true,
    writable: () => write,
    executable: () => false,
    settingsPrincipal: () => principal,
    instanceId: randomUUID(),
    version: 'test',
    commands: () => [],
    execute: () => {},
  });
  const call = (name, args = {}) => api.call('settings.' + name, args);
  const target = () =>
    call('targets.list', { ownerId: owner.id }).items.find((target) => target.kind === 'list')
      .targetId;
  const items = (args = {}) => call('items.list', { targetId: target(), ...args });
  const request = (operations) => ({
    targetId: target(),
    operations,
    expectedRevision: items().revision,
    expectedSchemaRevision: call('schema.get', { targetId: target() }).schemaRevision,
    requestId: randomUUID(),
  });
  return {
    dir,
    owner,
    owners,
    choices,
    list,
    store,
    commands,
    api,
    call,
    target,
    items,
    request,
    rows: () => store.value.extensions[owner.id].settings.records,
    writes: () => writes,
    setWrite: (v) => (write = v),
    setPrincipal: (v) => (principal = v),
  };
}
test('list discovery projects public columns, excludes parent/private/overlapping metadata and blocks protected removal', (t) => {
  const f = fixture(t, { hidden: true });
  const schema = f.call('schema.get', { targetId: f.target() }),
    items = f.items();
  assert.equal(schema.kind, 'list');
  assert.equal(schema.items.find((field) => field.key === 'id').writable, false);
  assert.equal(JSON.stringify([schema, items, f.call('targets.list')]).includes('PRIVATE'), false);
  assert.equal(items.items[0].removable, false);
  assert.throws(
    () => f.call('apply', f.request([{ kind: 'remove', itemRef: items.items[0].itemRef }])),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  for (const key of ['credential', 'local', 'unknown'])
    assert.throws(
      () =>
        f.call(
          'apply',
          f.request([{ kind: 'update', itemRef: items.items[0].itemRef, changes: { [key]: 'x' } }]),
        ),
      { code: 'NOT_FOUND' },
    );
  f.list.fields.push({
    key: 'aliasLeak',
    title: 'PRIVATE_ALIAS',
    type: 'string-list',
    propertyPath: ['credential'],
  });
  assert.equal(
    JSON.stringify(f.call('schema.get', { targetId: f.target() })).includes('PRIVATE'),
    false,
  );
  f.list.automation = false;
  assert.equal(f.call('targets.list', { ownerId: f.owner.id }).items.length, 0);
  assert.equal(f.writes(), 0);
});
test('stable-ID list CRUD preserves unknown/nested state, uses generated IDs and replays once', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file, 'utf8'),
    original = f.items();
  const previewRequest = {
    ...f.request([
      { kind: 'add', beforeItemRef: original.items[1].itemRef, values: { name: 'Third' } },
    ]),
    dryRun: true,
  };
  const preview = f.call('apply', previewRequest);
  assert.equal(preview.completion, 'validated');
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.call('apply', previewRequest), preview);
  const addRequest = { ...previewRequest, dryRun: false, requestId: randomUUID() };
  const add = f.call('apply', addRequest);
  assert.deepEqual(f.call('apply', addRequest), add);
  assert.equal(f.writes(), 1);
  assert.deepEqual(
    f.rows().map((row) => row.name),
    ['Same', 'Third', 'Same'],
  );
  assert.match(f.rows()[1].id, /^[a-f0-9-]{36}$/);
  let items = f.items();
  f.call(
    'apply',
    f.request([
      {
        kind: 'update',
        itemRef: items.items[0].itemRef,
        changes: { name: 'Renamed', scope: 'global', folders: ['B:/new'] },
      },
    ]),
  );
  assert.deepEqual(f.rows()[0].unknown, { keep: 1 });
  assert.deepEqual(f.rows()[0].when, { scope: 'global', privateSibling: { keep: 7 } });
  assert.equal(f.rows()[0].folder, undefined);
  assert.equal(f.rows()[0].mode, 0);
  items = f.items();
  const noOp = f.call(
    'apply',
    f.request([{ kind: 'update', itemRef: items.items[0].itemRef, changes: { mode: 'fill' } }]),
  );
  assert.equal(noOp.changed, false);
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request([{ kind: 'update', itemRef: items.items[0].itemRef, changes: { id: 'rename' } }]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  f.call(
    'apply',
    f.request([{ kind: 'reorder', itemRefs: items.items.map((item) => item.itemRef).reverse() }]),
  );
  assert.deepEqual(
    f.rows().map((row) => row.name),
    ['Same', 'Third', 'Renamed'],
  );
  items = f.items();
  f.call('apply', f.request([{ kind: 'remove', itemRef: items.items[1].itemRef }]));
  assert.equal(f.rows().length, 2);
});
test('ID-less duplicate rows use snapshot-bound refs without adding IDs; cursors and refs expire on changes/restart/principal', (t) => {
  const f = fixture(t, { id: false }),
    page = f.items({ limit: 1 }),
    oldRefs = f.items().items.map((item) => item.itemRef);
  f.call(
    'apply',
    f.request([{ kind: 'update', itemRef: oldRefs[1], changes: { enabled: false } }]),
  );
  assert.equal(f.rows()[0].enabled, false);
  assert.equal(f.rows()[1].enabled, false);
  assert(f.rows().every((row) => !Object.hasOwn(row, 'id')));
  assert.throws(() => f.items({ cursor: page.nextCursor }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => f.call('apply', f.request([{ kind: 'remove', itemRef: oldRefs[0] }])), {
    code: 'REVISION_CONFLICT',
  });
  const refs = f.items().items.map((item) => item.itemRef);
  f.setPrincipal('two');
  assert.throws(() => f.call('apply', f.request([{ kind: 'remove', itemRef: refs[0] }])), {
    code: 'REVISION_CONFLICT',
  });
  const other = fixture(t, { id: false });
  assert.throws(
    () =>
      other.call('apply', other.request([{ kind: 'remove', itemRef: f.items().items[0].itemRef }])),
    { code: 'REVISION_CONFLICT' },
  );
});
test('list batches reject duplicates, mixed structure, incomplete reorders, unknown operations and invalid values atomically', (t) => {
  const f = fixture(t),
    refs = f.items().items.map((item) => item.itemRef),
    before = fs.readFileSync(f.store.file, 'utf8');
  for (const operations of [
    [
      { kind: 'update', itemRef: refs[0], changes: { name: 'Valid' } },
      { kind: 'update', itemRef: refs[1], changes: { enabled: 'invalid' } },
    ],
    [
      { kind: 'update', itemRef: refs[0], changes: { enabled: true } },
      { kind: 'update', itemRef: refs[0], changes: { enabled: false } },
    ],
    [
      { kind: 'add', values: { name: 'New' } },
      { kind: 'remove', itemRef: refs[0] },
    ],
    [{ kind: 'reorder', itemRefs: [refs[0]] }],
    [{ kind: 'reorder', itemRefs: [refs[0], refs[0]] }],
    [{ kind: 'set', changes: { records: [] } }],
    [{ kind: 'reset', keys: ['records'] }],
    [{ kind: 'update', itemRef: refs[0], changes: { scope: 'invalid' } }],
    [{ kind: 'update', itemRef: refs[0], changes: { name: '' } }],
  ])
    assert.throws(() => f.call('apply', f.request(operations)), { code: 'INVALID_ARGUMENT' });
  assert.throws(
    () =>
      f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes: { extra: 'x' } }])),
    { code: 'NOT_FOUND' },
  );
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
  assert.equal(f.writes(), 0);
  const request = f.request([{ kind: 'add', values: { name: 'New' } }]);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  f.owner.state = 'stopped';
  assert.throws(() => f.call('apply', request), { code: 'UNAVAILABLE' });
});
test('list writes preserve device-local ownership and shared bytes, and reject unobserved external edits', (t) => {
  const f = fixture(t, { device: true }),
    shared = fs.readFileSync(f.store.shared.file, 'utf8');
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: f.items().items[0].itemRef, changes: { name: 'Local' } },
    ]),
  );
  assert.equal(f.rows()[0].name, 'Local');
  assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), shared);
  const stale = f.request([{ kind: 'remove', itemRef: f.items().items[0].itemRef }]);
  const raw = JSON.parse(fs.readFileSync(f.store.device.file));
  raw.host = { theme: 'dark' };
  fs.writeFileSync(f.store.device.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  assert.equal(f.rows().length, 2);
});
test('dynamic root and list options come from live owner metadata and revalidate schema without writes', (t) => {
  const f = fixture(t, {
    id: false,
    fields: [
      { key: 'name', title: 'Name', type: 'string', default: 'New' },
      {
        key: 'account',
        title: 'Account',
        type: 'select',
        optionSource: 'web-profiles',
        options: [],
      },
    ],
  });
  f.owner.settings.push({
    key: 'monitor',
    title: 'Monitor',
    type: 'select',
    dynamic: true,
    options: [],
    default: 'one',
  });
  f.owner.settingOptions.monitor = [{ value: 'one', label: 'One' }];
  const scalar = f
    .call('targets.list', { ownerId: f.owner.id })
    .items.find((target) => target.kind === 'fields');
  assert.deepEqual(f.call('options.list', { targetId: scalar.targetId, key: 'monitor' }).items, [
    { value: 'one', label: 'One' },
  ]);
  assert.deepEqual(
    f.call('options.list', {
      targetId: f.target(),
      key: 'account',
      itemRef: f.items().items[0].itemRef,
      draftValues: { name: 'Draft' },
    }).items,
    f.choices,
  );
  const request = f.request([
    { kind: 'update', itemRef: f.items().items[0].itemRef, changes: { account: 'account.one' } },
  ]);
  f.choices.splice(0, 1, { value: 'account.two', label: 'Account Two' });
  assert.throws(() => f.call('apply', request), { code: 'SCHEMA_CONFLICT' });
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request([
          {
            kind: 'update',
            itemRef: f.items().items[0].itemRef,
            changes: { account: 'account.one' },
          },
        ]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(f.writes(), 0);
});
test('list pagination respects response limits and oversized change previews fail before persistence', (t) => {
  const rows = Array.from({ length: 27 }, (_, index) => ({ name: 'x'.repeat(10000), index }));
  const f = fixture(t, {
    id: false,
    rows,
    fields: [{ key: 'name', title: 'Name', type: 'string', maxLength: 10000 }],
  });
  const refs = [];
  let cursor;
  do {
    const page = f.items({ ...(cursor ? { cursor } : {}) });
    assert(Buffer.byteLength(JSON.stringify(page)) <= 256 * 1024);
    refs.push(...page.items.map((item) => item.itemRef));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(refs.length, 27);
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request(refs.map((itemRef) => ({ kind: 'update', itemRef, changes: { name: 'small' } }))),
      ),
    { code: 'RESULT_TOO_LARGE' },
  );
  assert.equal(f.writes(), 0);
});

test('legacy JSON-string list no-ops preserve bytes and declared identity cannot be changed through another path', (t) => {
  const f = fixture(t, {
    id: false,
    rows: JSON.stringify([{ name: 'Same' }, { name: 'Same' }]),
    fields: [{ key: 'name', title: 'Name', type: 'string' }],
  });
  const before = fs.readFileSync(f.store.file, 'utf8');
  assert.equal(
    f.call(
      'apply',
      f.request([{ kind: 'reorder', itemRefs: f.items().items.map((item) => item.itemRef) }]),
    ).changed,
    false,
  );
  assert.equal(f.writes(), 0);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
  const g = fixture(t);
  g.list.fields.push({
    key: 'identityAlias',
    title: 'Identity alias',
    type: 'string',
    propertyPath: ['id'],
  });
  assert(
    !g
      .call('schema.get', { targetId: g.target() })
      .items.some((field) => field.key === 'identityAlias'),
  );
  assert.throws(
    () =>
      g.call(
        'apply',
        g.request([
          {
            kind: 'update',
            itemRef: g.items().items[0].itemRef,
            changes: { identityAlias: 'renamed' },
          },
        ]),
      ),
    { code: 'NOT_FOUND' },
  );
  g.list.fields.push({
    key: 'scopeAlias',
    title: 'Scope alias',
    type: 'string',
    propertyPath: ['when', 'scope'],
  });
  assert.throws(
    () =>
      g.call(
        'apply',
        g.request([
          {
            kind: 'update',
            itemRef: g.items().items[0].itemRef,
            changes: { scope: 'global', scopeAlias: 'app' },
          },
        ]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
});

test('declared page-list enabled edits stay on this PC while the shared list bytes remain unchanged', (t) => {
  const f = fixture(t, { device: true, local: false, collection: true });
  const before = fs.readFileSync(f.store.shared.file, 'utf8'),
    row = f.items().items[0];
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: row.itemRef, changes: { enabled: !row.values.enabled } },
    ]),
  );
  assert.equal(f.items().items[0].values.enabled, !row.values.enabled);
  assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), before);
  assert.equal(
    JSON.parse(fs.readFileSync(f.store.device.file)).collectionEnabled[f.owner.id].records.one,
    !row.values.enabled,
  );
});

test('fixed list choices remain independent from a root dynamic select with the same key', (t) => {
  const f = fixture(t);
  f.owner.settings.push({
    key: 'mode',
    title: 'Root mode',
    type: 'select',
    dynamic: true,
    options: [],
    default: 'runtime',
  });
  f.owner.settingOptions.mode = [{ value: 'runtime', label: 'Runtime' }];
  assert.deepEqual(
    f
      .call('options.list', { targetId: f.target(), key: 'mode' })
      .items.map((option) => option.value),
    ['fill', 'fit'],
  );
  const scalar = f
    .call('targets.list', { ownerId: f.owner.id })
    .items.find((target) => target.kind === 'fields');
  assert.deepEqual(
    f
      .call('options.list', { targetId: scalar.targetId, key: 'mode' })
      .items.map((option) => option.value),
    ['runtime'],
  );
  f.call(
    'apply',
    f.request([{ kind: 'update', itemRef: f.items().items[0].itemRef, changes: { mode: 'fit' } }]),
  );
  assert.equal(f.items().items[0].values.mode, 'fit');
});

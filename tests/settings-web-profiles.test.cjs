const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { PageCollectionManager } = require('../out/main/main/core/page-collections');
const { WebProfileStore } = require('../out/main/main/core/web-profiles');
const { settingsItemId } = require('../out/main/shared/settings-catalog');

function fixture(t, { missing = false, legacy = false } = {}) {
  const root = path.resolve('.artifacts/settings-web-profiles-unit', randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const settings = new SettingsStore(path.join(root, 'settings.json'));
  settings.load();
  t.after(() => settings.close());
  const state = { writable: true, changed: 0, failed: 0 };
  const owner = {
    id: legacy ? 'at365.web-applet' : 'fixture.profiles',
    displayName: 'Profiles fixture',
    enabled: false,
    state: 'stopped',
    capabilities: ['settings', 'pages', 'dynamic-pages', 'web-profiles'],
    settings: [
      {
        key: 'items',
        title: 'Pages',
        type: 'object-list',
        default: [],
        fields: [
          { key: 'id', title: 'ID', type: 'string' },
          {
            key: 'accountId',
            title: 'Account',
            type: 'select',
            options: [],
            optionSource: 'web-profiles',
          },
        ],
        list: { idKey: 'id' },
      },
    ],
  };
  if (legacy)
    settings.save(
      { ...settings.value, migrations: { webApplet: { version: 1, owner: owner.id, ids: [] } } },
      settings.revision,
    );
  const directory = path.join(root, 'data', legacy ? 'web-applets' : 'web-profiles/' + owner.id);
  const local = path.join(root, 'local', legacy ? 'web-applets' : 'web-profiles/' + owner.id);
  const file = path.join(directory, 'accounts.json');
  const rows = [
    { id: `account.${randomUUID()}`, name: 'Same', retained: { token: 'PRIVATE_ROSTER_VALUE' } },
    { id: `account.${randomUUID()}`, name: 'Same' },
  ];
  const raw = {
    schemaVersion: 1,
    accounts: rows,
    extra: { path: 'PRIVATE_ROSTER_PATH' },
    pendingDeletion: [],
  };
  fs.mkdirSync(directory, { recursive: true });
  if (!missing) fs.writeFileSync(file, JSON.stringify(raw));
  const manager = new PageCollectionManager({
    settings: () => settings.value,
    parents: () => [owner],
    sharedRoot: path.join(root, 'data'),
    localRoot: path.join(root, 'local'),
    changed: () => state.changed++,
    failed: () => state.failed++,
    openLocal: async () => {
      throw Error('No page opening');
    },
  });
  // The public owner must never initialize RemotePageService or a Chromium session.
  manager.profiles = () => {
    throw Error('Remote service initialization forbidden');
  };
  const options = {
    settings,
    applets: () => [owner],
    save: () => {
      throw Error('Settings save forbidden');
    },
    settingOptions: (id) => manager.settingOptions(id),
  };
  const commands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    serviceSettingsTargets: () =>
      manager.settingsTargets((revision) => commands.checkRevision(revision)),
    ready: () => true,
    writable: () => state.writable,
    executable: () => false,
    version: 'test',
    instanceId: randomUUID(),
    commands: () => [],
    execute: async () => {
      throw Error('Execution forbidden');
    },
  });
  const call = (method, args = {}) => api.call('settings.' + method, args);
  const target = () =>
    call('targets.list', { ownerId: owner.id }).items.find(
      (item) => item.category === 'web-accounts',
    );
  const read = (extra = {}) => call('items.list', { targetId: target().targetId, ...extra });
  const request = (operations, extra = {}) => ({
    targetId: target().targetId,
    expectedSchemaRevision: call('schema.get', { targetId: target().targetId }).schemaRevision,
    expectedRevision: read().revision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  return {
    root,
    local,
    settings,
    state,
    owner,
    file,
    raw,
    rows,
    manager,
    api,
    commands,
    call,
    target,
    read,
    request,
  };
}
const refuses = (work, code) => assert.throws(work, (error) => error.code === code);

test('declared profile owners expose names and readonly IDs while stopped without remote initialization', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.target().operations, ['add', 'update']);
  const schema = f.call('schema.get', { targetId: f.target().targetId });
  assert.equal(schema.available, true);
  assert.equal(schema.maxItems, undefined);
  assert.deepEqual(
    schema.items.map((item) => [item.key, item.writable]),
    [
      ['id', false],
      ['name', true],
    ],
  );
  assert(f.read().items.every((item) => item.removable === false));
  assert.doesNotMatch(
    JSON.stringify([schema, f.read()]),
    /PRIVATE_|pendingDeletion|sessions|Cookies|localRoot/,
  );
  assert.equal(fs.existsSync(f.local), false);
  const access = f.api.settingsAccess({ id: 'web-accounts', items: [] });
  assert.equal(access.items[settingsItemId('web-accounts', 'accounts')].fields.name.reason, null);
});

test('public rename plans, commits and replay preserve unknown roster data, all local bytes and settings', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.local, 'sessions', f.rows[0].id), { recursive: true });
  const cookie = path.join(f.local, 'sessions', f.rows[0].id, 'Cookies');
  const pending = path.join(f.local, 'pending-deletion.json');
  fs.writeFileSync(cookie, 'PRIVATE_COOKIE_BYTES');
  fs.writeFileSync(pending, JSON.stringify([`account.${randomUUID()}`]));
  const settingsBytes = fs.readFileSync(f.settings.file),
    pendingBytes = fs.readFileSync(pending);
  const before = fs.readFileSync(f.file),
    revision = f.settings.revision;
  const operation = [
    { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: '  Personal  ' } },
  ];
  assert.equal(f.call('apply', f.request(operation, { dryRun: true })).completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(f.state.changed, 0);
  const saved = f.request(operation);
  const reply = f.call('apply', saved);
  assert.equal(reply.completion, 'settingsSaved');
  assert.equal(reply.effectVerified, false);
  assert.deepEqual(f.call('apply', saved), reply);
  assert.equal(f.state.changed, 1);
  const raw = JSON.parse(fs.readFileSync(f.file));
  assert.deepEqual(raw, { ...f.raw, accounts: [{ ...f.rows[0], name: 'Personal' }, f.rows[1]] });
  assert.equal(fs.readFileSync(cookie, 'utf8'), 'PRIVATE_COOKIE_BYTES');
  assert.deepEqual(fs.readFileSync(pending), pendingBytes);
  assert.equal(f.settings.revision, revision);
  assert.deepEqual(fs.readFileSync(f.settings.file), settingsBytes);
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE_|pendingDeletion|Cookies/);
  const same = f.request([
    { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'Personal' } },
  ]);
  const bytes = fs.readFileSync(f.file),
    count = f.state.changed;
  assert.equal(f.call('apply', same).changed, false);
  assert.deepEqual(fs.readFileSync(f.file), bytes);
  assert.equal(f.state.changed, count);
});

test('add uses generated identity, supports insertion, refreshes candidates and survives restart', (t) => {
  const f = fixture(t);
  const read = f.read();
  const add = f.request([
    { kind: 'add', values: { name: 'Work' }, beforeItemRef: read.items[1].itemRef },
  ]);
  f.call('apply', add);
  const rows = f.read().items.map((item) => item.values);
  assert.equal(rows[1].name, 'Work');
  assert.match(rows[1].id, /^account\.[a-f0-9-]{36}$/);
  assert.deepEqual(
    [rows[0].id, rows[2].id],
    f.rows.map((row) => row.id),
  );
  assert.deepEqual(
    f.manager.settingOptions(f.owner.id).map((option) => option.label),
    ['Same', 'Work', 'Same'],
  );
  const restarted = new WebProfileStore(f.file);
  restarted.loadStandalone(() => true);
  assert.deepEqual(restarted.snapshot(), rows);
  assert.equal(fs.existsSync(f.local), false);
});

test('invalid late edits, private keys, identities, clear, removal and reorder cannot write', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.file);
  const refs = f.read().items.map((item) => item.itemRef);
  for (const name of ['', '  ', 'a\nsecret', 'x'.repeat(81), 17])
    refuses(
      () => f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes: { name } }])),
      'INVALID_ARGUMENT',
    );
  refuses(
    () =>
      f.call(
        'apply',
        f.request([
          { kind: 'update', itemRef: refs[0], changes: { name: 'Must not save' } },
          { kind: 'update', itemRef: refs[1], changes: { token: 'PRIVATE_NEW_TOKEN' } },
        ]),
      ),
    'NOT_FOUND',
  );
  for (const operations of [
    [{ kind: 'remove', itemRef: refs[0] }],
    [{ kind: 'reorder', itemRefs: refs.slice().reverse() }],
    [{ kind: 'clear', itemRef: refs[0] }],
    [{ kind: 'add', values: { id: `account.${randomUUID()}`, name: 'No' } }],
    [{ kind: 'update', itemRef: refs[0], changes: { id: `account.${randomUUID()}` } }],
  ])
    refuses(() => f.call('apply', f.request(operations)), 'INVALID_ARGUMENT');
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(f.state.changed, 0);
});

test('external byte changes expire rows/cursors/requests without changing settings revision', (t) => {
  const f = fixture(t),
    read = f.read({ limit: 1 });
  const old = f.request([
    { kind: 'update', itemRef: read.items[0].itemRef, changes: { name: 'Old write' } },
  ]);
  const revision = f.settings.revision;
  const external = JSON.stringify({ ...f.raw, extra: { changed: true } }, null, 2);
  fs.writeFileSync(f.file, external);
  refuses(() => f.call('apply', old), 'REVISION_CONFLICT');
  refuses(() => f.read({ cursor: read.nextCursor, limit: 1 }), 'REVISION_CONFLICT');
  assert.equal(f.settings.revision, revision);
  assert.equal(fs.readFileSync(f.file, 'utf8'), external);
});

test('malformed and missing delivered rosters stay unavailable without disclosing paths or overwriting', (t) => {
  const f = fixture(t);
  for (const text of [
    'PRIVATE_BAD_JSON',
    JSON.stringify({ schemaVersion: 99, accounts: f.rows }),
    JSON.stringify({ schemaVersion: 1, accounts: [f.rows[0], f.rows[0]] }),
  ]) {
    fs.writeFileSync(f.file, text);
    assert.equal(f.target().available, false);
    assert.deepEqual(f.read().items, []);
    const request = f.request([{ kind: 'add', values: { name: 'No replacement' } }]);
    refuses(() => f.call('apply', request), 'UNAVAILABLE');
    assert.equal(fs.readFileSync(f.file, 'utf8'), text);
    assert.doesNotMatch(JSON.stringify(f.target()), /PRIVATE_|[A-Z]:\\/);
  }
});

test('missing empty roster stays absent on read/dryRun and initializes only on deliberate add', (t) => {
  const f = fixture(t, { missing: true });
  assert.equal(f.target().available, true);
  assert.deepEqual(f.read().items, []);
  const operations = [{ kind: 'add', values: { name: 'First' } }];
  f.call('apply', f.request(operations, { dryRun: true }));
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(fs.existsSync(f.local), false);
  f.call('apply', f.request(operations));
  assert.equal(f.read().items[0].values.name, 'First');
  assert.equal(fs.existsSync(f.local), false);
});

test('owner capability/removal, multiple providers and legacy storage stay bound to their own target', (t) => {
  const f = fixture(t, { legacy: true });
  const other = { ...f.owner, id: 'fixture.other-profiles', displayName: 'Other profiles' };
  const original = f.manager.options.parents;
  f.manager.options.parents = () => [f.owner, other];
  const targets = f.call('targets.list').items.filter((item) => item.category === 'web-accounts');
  assert.equal(targets.length, 2);
  const target = targets.find((item) => item.ownerId === other.id);
  const schema = f.call('schema.get', { targetId: target.targetId });
  const values = f.call('items.list', { targetId: target.targetId });
  f.call('apply', {
    targetId: target.targetId,
    expectedSchemaRevision: schema.schemaRevision,
    expectedRevision: values.revision,
    requestId: randomUUID(),
    operations: [{ kind: 'add', values: { name: 'Other only' } }],
  });
  assert.equal(JSON.parse(fs.readFileSync(f.file)).accounts.length, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, 'data/web-profiles', other.id, 'accounts.json')))
      .accounts[0].name,
    'Other only',
  );
  const request = f.request([
    { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'No owner' } },
  ]);
  f.manager.options.parents = () => [];
  refuses(() => f.call('apply', request), 'NOT_FOUND');
  f.manager.options.parents = original;
  f.owner.capabilities = [];
  assert(!f.call('targets.list').items.some((item) => item.category === 'web-accounts'));
});

test('active owner is reused and clearing/disposal blocks public changes without starting a service', (t) => {
  const f = fixture(t);
  const store = new WebProfileStore(f.file, f.local);
  store.loadStandalone(() => true);
  const active = { settingsProfiles: () => store };
  f.manager.services.set(f.owner.id, active);
  const request = f.request([
    { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'Active' } },
  ]);
  f.call('apply', request);
  assert.equal(store.snapshot()[0].name, 'Active');
  assert.equal(fs.existsSync(f.local), false);
  active.settingsProfiles = () => {
    throw Error('PRIVATE_BUSY_PATH');
  };
  assert.equal(f.target().available, false);
  refuses(
    () => f.call('apply', f.request([{ kind: 'add', values: { name: 'Busy' } }])),
    'UNAVAILABLE',
  );
});

test('store plan rechecks file bytes immediately before commit and refuses implicit removal/reorder', (t) => {
  const f = fixture(t),
    store = new WebProfileStore(f.file);
  store.loadStandalone(() => true);
  const before = store.publicConfiguration();
  const plan = store.planPublicConfiguration(
    before.accounts.map((row, index) => (index ? row : { ...row, name: 'Planned' })),
    before.revision,
  );
  fs.writeFileSync(f.file, JSON.stringify({ ...f.raw, external: 'PRIVATE_EXTERNAL' }));
  assert.throws(() => plan.commit());
  assert.equal(JSON.parse(fs.readFileSync(f.file)).external, 'PRIVATE_EXTERNAL');
  const fresh = new WebProfileStore(f.file);
  fresh.loadStandalone(() => true);
  const view = fresh.publicConfiguration();
  refuses(
    () => fresh.planPublicConfiguration(view.accounts.slice(1), view.revision),
    'INVALID_ARGUMENT',
  );
  refuses(
    () => fresh.planPublicConfiguration(view.accounts.slice().reverse(), view.revision),
    'INVALID_ARGUMENT',
  );
});

test('write revocation applies to new changes and replay; larger rosters permit further adds', (t) => {
  const f = fixture(t);
  const request = f.request([{ kind: 'add', values: { name: 'Added' } }]);
  f.call('apply', request);
  const before = fs.readFileSync(f.file);
  f.state.writable = false;
  refuses(() => f.call('apply', request), 'WRITE_DISABLED');
  assert.deepEqual(fs.readFileSync(f.file), before);
  f.state.writable = true;
  fs.writeFileSync(
    f.file,
    JSON.stringify({
      schemaVersion: 1,
      accounts: Array.from({ length: 32 }, () => ({ id: `account.${randomUUID()}`, name: 'Full' })),
    }),
  );
  f.call('apply', f.request([{ kind: 'add', values: { name: 'Overflow' } }]));
  assert.equal(f.read().items.length, 33);
});

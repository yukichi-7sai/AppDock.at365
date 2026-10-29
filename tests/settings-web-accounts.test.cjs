const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { webAccountSettingsTargets } = require('../out/main/main/core/settings-web-account-target');
function fixture(t, grouped = false, missing = false) {
  const root = path.resolve('.artifacts/settings-service-accounts-unit', randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const local = path.join(root, 'local'),
    shared = path.join(root, 'data');
  const owner = {
    id: 'fixture.service-accounts',
    displayName: 'Service fixture',
    enabled: false,
    state: 'stopped',
    settings: [],
    capabilities: ['web-accounts'],
    webAccounts: {
      url: 'https://fixture.invalid/',
      origins: ['https://fixture.invalid'],
      observeOrigin: 'https://fixture.invalid',
      ui: 'index.html',
      observer: 'observer.js',
      ...(grouped ? { accountGroup: { id: 'fixture.google', title: 'Fixture group' } } : {}),
    },
  };
  const owners = [owner];
  const file = grouped
    ? path.join(shared, 'web-account-groups/fixture.google/accounts.json')
    : path.join(local, 'web-accounts', owner.id, 'accounts.json');
  const ids = [randomUUID(), randomUUID()];
  const raw = {
    version: 1,
    accounts: ids.map((id) => ({
      id,
      name: 'Same',
      hidden: 'PRIVATE_ROW',
      ...(!grouped ? { monitoring: false, sound: { enabled: false, file: '' } } : {}),
    })),
    retained: 'PRIVATE_ROOT',
    ...(!grouped ? { selected: ids[1] } : {}),
  };
  if (!missing) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(raw));
  }
  const settings = new SettingsStore(path.join(root, 'settings.json'));
  settings.load();
  t.after(() => settings.close());
  const state = { writable: true, changed: 0 };
  const options = {
    settings,
    applets: () => owners,
    save: (next, revision) => settings.save(next, revision),
  };
  const commands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    serviceSettingsTargets: () =>
      webAccountSettingsTargets({
        applets: owners,
        localRoot: local,
        sharedRoot: shared,
        checkRevision: (r) => commands.checkRevision(r),
        changed: () => state.changed++,
      }),
    ready: () => true,
    writable: () => state.writable,
    executable: () => false,
    version: 'test',
    instanceId: randomUUID(),
    commands: () => [],
    execute: () => {
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
    expectedRevision: read().revision,
    expectedSchemaRevision: call('schema.get', { targetId: target().targetId }).schemaRevision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  return {
    root,
    local,
    shared,
    file,
    ids,
    raw,
    owner,
    owners,
    settings,
    state,
    api,
    commands,
    call,
    target,
    read,
    request,
  };
}
const refuses = (work, code) => assert.throws(work, (error) => error.code === code);
for (const grouped of [false, true]) {
  test(`${grouped ? 'group' : 'private'} service roster publishes names and readonly IDs while disabled`, (t) => {
    const f = fixture(t, grouped),
      schema = f.call('schema.get', { targetId: f.target().targetId });
    assert(f.target().available);
    assert.deepEqual(f.target().operations, ['add', 'update']);
    assert.equal(schema.maxItems, undefined);
    assert.deepEqual(
      schema.items.map((field) => [field.key, field.writable]),
      [
        ['id', false],
        ['name', true],
      ],
    );
    assert.deepEqual(
      f.read().items.map((row) => row.values),
      f.ids.map((id) => ({ id, name: 'Same' })),
    );
    assert(f.read().items.every((row) => row.removable === false));
    assert.doesNotMatch(
      JSON.stringify([schema, f.read()]),
      /PRIVATE_|monitoring|selected|sound|sessions|Cookies|[A-Z]:\\/,
    );
    assert.equal(f.owner.enabled, false);
    assert.equal(f.owner.state, 'stopped');
    assert.equal(fs.existsSync(path.join(f.local, 'chromium')), false);
  });
  test(`${grouped ? 'group' : 'private'} service edits validate, save and replay without changing settings or session bytes`, (t) => {
    const f = fixture(t, grouped),
      before = fs.readFileSync(f.file),
      settingsBefore = fs.readFileSync(f.settings.file),
      revision = f.settings.revision;
    const marker = path.join(
      f.local,
      'web-accounts',
      f.owner.id,
      'sessions',
      f.ids[0],
      'Cookies.fixture',
    );
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, 'PRIVATE_COOKIE');
    const initial = f.read({ limit: 1 });
    assert(initial.nextCursor);
    const preview = f.request(
      [{ kind: 'update', itemRef: initial.items[0].itemRef, changes: { name: ' Renamed ' } }],
      { dryRun: true },
    );
    assert.equal(f.call('apply', preview).completion, 'validated');
    assert.deepEqual(fs.readFileSync(f.file), before);
    const save = { ...preview, requestId: randomUUID(), dryRun: false };
    const result = f.call('apply', save);
    assert.equal(result.completion, 'settingsSaved');
    assert.equal(result.effectVerified, false);
    assert.deepEqual(f.call('apply', save), result);
    assert.equal(f.read().items[0].values.name, 'Renamed');
    assert.equal(result.revision, f.read().revision);
    refuses(() => f.read({ limit: 1, cursor: initial.nextCursor }), 'REVISION_CONFLICT');
    f.call(
      'apply',
      f.request([
        { kind: 'add', beforeItemRef: f.read().items[0].itemRef, values: { name: 'Added' } },
      ]),
    );
    const saved = JSON.parse(fs.readFileSync(f.file));
    assert.equal(saved.accounts.length, 3);
    assert.equal(saved.accounts[1].id, f.ids[0]);
    assert.equal(saved.accounts[1].hidden, 'PRIVATE_ROW');
    assert.equal(saved.retained, 'PRIVATE_ROOT');
    assert.equal(saved.selected, grouped ? undefined : f.ids[1]);
    assert.deepEqual(fs.readFileSync(f.settings.file), settingsBefore);
    assert.equal(f.settings.revision, revision);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'PRIVATE_COOKIE');
  });
}
test('service discovery follows declarations and shared changes invalidate every member target', (t) => {
  const f = fixture(t, true);
  const other = { ...f.owner, id: 'fixture.calendar' };
  f.owners.push(other, { ...f.owner, id: 'fixture.unpublished', capabilities: [] });
  assert.equal(f.call('targets.list').items.filter((a) => a.category === 'web-accounts').length, 2);
  const otherTarget = f
    .call('targets.list', { ownerId: other.id })
    .items.find((a) => a.category === 'web-accounts');
  const otherRead = f.call('items.list', { targetId: otherTarget.targetId });
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'Shared name' } },
    ]),
  );
  const after = f.call('items.list', { targetId: otherTarget.targetId });
  assert.equal(after.items[0].values.name, 'Shared name');
  assert.notEqual(after.revision, otherRead.revision);
  f.owners.splice(f.owners.indexOf(other), 1);
  refuses(() => f.call('items.list', { targetId: otherTarget.targetId }), 'NOT_FOUND');
});
test('service roster rejects immutable IDs, private fields, destructive actions and stale writes', (t) => {
  const f = fixture(t),
    rows = f.read();
  for (const changes of [
    { id: randomUUID() },
    { name: 'Visible', monitoring: true },
    { token: 'PRIVATE_NEW' },
    { name: 'x'.repeat(61) },
  ])
    assert.throws(() =>
      f.call('apply', f.request([{ kind: 'update', itemRef: rows.items[0].itemRef, changes }])),
    );
  for (const operation of [
    { kind: 'remove', itemRef: rows.items[0].itemRef },
    { kind: 'reorder', itemRefs: rows.items.map((a) => a.itemRef).reverse() },
  ])
    refuses(() => f.call('apply', f.request([operation])), 'INVALID_ARGUMENT');
  const stale = f.request([
    { kind: 'update', itemRef: rows.items[0].itemRef, changes: { name: 'Stale' } },
  ]);
  fs.writeFileSync(f.file, JSON.stringify({ ...f.raw, retained: 'EXTERNAL_PRIVATE' }));
  refuses(() => f.call('apply', stale), 'REVISION_CONFLICT');
  f.state.writable = false;
  refuses(
    () => f.call('apply', f.request([{ kind: 'add', values: { name: 'No grant' } }])),
    'WRITE_DISABLED',
  );
  assert.equal(f.read().items.length, 2);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).accounts[0].name, 'Same');
});
test('missing service rosters stay absent until an explicit addition; corruption stays unavailable', (t) => {
  const f = fixture(t, true, true);
  assert.equal(f.read().items.length, 0);
  assert.equal(fs.existsSync(f.file), false);
  const preview = f.request([{ kind: 'add', values: { name: 'First' } }], { dryRun: true });
  f.call('apply', preview);
  assert.equal(fs.existsSync(f.file), false);
  f.call('apply', { ...preview, requestId: randomUUID(), dryRun: false });
  assert.equal(f.read().items[0].values.name, 'First');
  fs.writeFileSync(f.file, '{PRIVATE_BROKEN');
  assert.equal(f.target().available, false);
  assert.equal(f.call('schema.get', { targetId: f.target().targetId }).available, false);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{PRIVATE_BROKEN');
});

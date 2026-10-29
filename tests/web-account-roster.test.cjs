const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WebAccountRoster } = require('../out/main/main/core/web-account-roster');
const { WebAccountGroup } = require('../out/main/main/core/web-account-groups');
const { parseWebAccountSound } = require('../out/main/main/core/web-accounts');
function fixture(t, group = false) {
  const root = path.resolve('.artifacts/service-account-roster-unit', randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const local = path.join(root, 'local'),
    shared = path.join(root, 'data');
  const owner = 'fixture.mail',
    groupId = 'fixture.google';
  const directory = path.join(local, 'web-accounts', owner);
  const file = group
    ? path.join(shared, 'web-account-groups', groupId, 'accounts.json')
    : path.join(directory, 'accounts.json');
  const stateFile = path.join(local, 'web-account-groups', groupId, 'state.json');
  const bindingFile = path.join(directory, 'group-binding.json');
  const legacyFile = path.join(directory, 'accounts.json');
  const options = {
    bindingFile,
    ...(group ? { group: { id: groupId, owner, stateFile, legacyFile } } : {}),
  };
  const store = new WebAccountRoster(file, options);
  const ids = [randomUUID(), randomUUID()];
  const raw = {
    version: 1,
    accounts: ids.map((id, i) => ({
      id,
      name: 'Same',
      temporaryName: true,
      hidden: 'PRIVATE_ROW',
      ...(group ? {} : { monitoring: false, sound: { enabled: false, file: '' } }),
    })),
    retained: { value: 'PRIVATE_ROOT' },
    ...(!group ? { selected: ids[1] } : {}),
  };
  const save = (value = raw) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  return {
    root,
    local,
    shared,
    owner,
    groupId,
    directory,
    file,
    stateFile,
    bindingFile,
    legacyFile,
    store,
    ids,
    raw,
    save,
  };
}
const refuses = (work, code) => assert.throws(work, (error) => error.code === code);
test('adding a row preserves unedited legacy spacing and temporary-name state', (t) => {
  const f = fixture(t);
  f.raw.accounts[0].name = '  Legacy spacing  ';
  f.save();
  const current = f.store.publicConfiguration();
  f.store
    .planPublicConfiguration(
      [...current.accounts, { id: randomUUID(), name: ' New ' }],
      current.revision,
    )
    .commit();
  const saved = JSON.parse(fs.readFileSync(f.file));
  assert.equal(saved.accounts[0].name, '  Legacy spacing  ');
  assert.equal(saved.accounts[0].temporaryName, true);
  assert.equal(saved.accounts[2].name, 'New');
});
for (const grouped of [false, true]) {
  test(`${grouped ? 'shared' : 'private'} roster plans preserve private fields, selection and login bytes`, (t) => {
    const f = fixture(t, grouped);
    f.save();
    const marker = path.join(f.directory, 'sessions', f.ids[0], 'Cookies.fixture');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, 'PRIVATE_COOKIE');
    const current = f.store.publicConfiguration(),
      before = fs.readFileSync(f.file);
    assert.deepEqual(
      current.accounts,
      f.ids.map((id) => ({ id, name: 'Same' })),
    );
    assert.doesNotMatch(JSON.stringify(current), /PRIVATE|selected|monitoring|sound|temporaryName/);
    const rows = [
      { id: randomUUID(), name: ' Added ' },
      ...current.accounts.map((a, i) => ({ ...a, name: i ? 'Same' : ' Renamed ' })),
    ];
    const plan = f.store.planPublicConfiguration(rows, current.revision);
    assert(plan.changed);
    assert.deepEqual(fs.readFileSync(f.file), before);
    plan.commit();
    const saved = JSON.parse(fs.readFileSync(f.file));
    assert.equal(saved.accounts[1].hidden, 'PRIVATE_ROW');
    assert.equal(saved.retained.value, 'PRIVATE_ROOT');
    assert.equal(saved.accounts[1].name, 'Renamed');
    assert.equal(saved.accounts[1].temporaryName, false);
    assert.equal(saved.accounts[2].temporaryName, true);
    assert.equal(saved.selected, grouped ? undefined : f.ids[1]);
    if (!grouped) {
      assert.equal(saved.accounts[1].monitoring, false);
      assert.deepEqual(saved.accounts[1].sound, { enabled: false, file: '' });
    }
    assert.equal(fs.readFileSync(marker, 'utf8'), 'PRIVATE_COOKIE');
    const after = fs.readFileSync(f.file),
      again = f.store.publicConfiguration();
    const noOp = f.store.planPublicConfiguration(again.accounts, again.revision);
    assert.equal(noOp.changed, false);
    noOp.commit();
    assert.deepEqual(fs.readFileSync(f.file), after);
  });
  test(`${grouped ? 'shared' : 'private'} discovery and dryRun never initialize storage`, (t) => {
    const f = fixture(t, grouped);
    const current = f.store.publicConfiguration();
    assert.deepEqual(current.accounts, []);
    assert.equal(fs.existsSync(f.local), false);
    assert.equal(fs.existsSync(f.shared), false);
    const id = randomUUID();
    const plan = f.store.planPublicConfiguration([{ id, name: 'First' }], current.revision);
    assert.equal(fs.existsSync(f.file), false);
    plan.commit();
    assert.equal(JSON.parse(fs.readFileSync(f.file)).selected, grouped ? undefined : id);
  });
}
test('roster guards reject unknown fields, removal, identity replacement, reordering and invalid names', (t) => {
  const f = fixture(t);
  f.save();
  const current = f.store.publicConfiguration(),
    before = fs.readFileSync(f.file);
  for (const rows of [
    current.accounts.slice(1),
    [...current.accounts].reverse(),
    [{ ...current.accounts[0], id: randomUUID() }, current.accounts[1]],
    current.accounts.map((a) => ({ ...a, token: 'PRIVATE_NEW' })),
    current.accounts.map((a) => ({ ...a, name: '\u0000' })),
    current.accounts.map((a) => ({ ...a, name: 'x'.repeat(61) })),
    [...current.accounts, current.accounts[0]],
  ])
    refuses(() => f.store.planPublicConfiguration(rows, current.revision), 'INVALID_ARGUMENT');
  assert.deepEqual(fs.readFileSync(f.file), before);
});
test('unknown-field edits and local transaction changes invalidate prepared plans', (t) => {
  const f = fixture(t, true);
  f.save();
  fs.mkdirSync(path.dirname(f.stateFile), { recursive: true });
  const local = { version: 1, rosterKnown: true, members: {}, legacySessions: {} };
  fs.writeFileSync(f.stateFile, JSON.stringify(local));
  const a = f.store.publicConfiguration();
  const rows = a.accounts.map((p) => ({ ...p, name: 'Changed' }));
  const plan = f.store.planPublicConfiguration(rows, a.revision);
  fs.writeFileSync(f.stateFile, JSON.stringify({ ...local, retained: 'PRIVATE_LOCAL' }));
  refuses(() => plan.commit(), 'REVISION_CONFLICT');
  const b = f.store.publicConfiguration();
  const second = f.store.planPublicConfiguration(rows, b.revision);
  f.save({ ...f.raw, retained: { value: 'OTHER_PRIVATE' } });
  refuses(() => second.commit(), 'REVISION_CONFLICT');
  assert.equal(JSON.parse(fs.readFileSync(f.file)).accounts[0].name, 'Same');
});
test('corrupt, sync-missing and pending-migration/recovery data is unavailable without repairs', (t) => {
  const f = fixture(t, true);
  f.save();
  fs.mkdirSync(path.dirname(f.stateFile), { recursive: true });
  for (const content of [
    '{',
    JSON.stringify({ version: 2, members: {} }),
    JSON.stringify({ version: 1, members: {}, pending: {} }),
  ]) {
    fs.writeFileSync(f.stateFile, content);
    refuses(() => f.store.publicConfiguration(), 'UNAVAILABLE');
    assert.equal(fs.readFileSync(f.stateFile, 'utf8'), content);
  }
  fs.writeFileSync(f.stateFile, JSON.stringify({ version: 1, members: {}, rosterKnown: true }));
  fs.unlinkSync(f.file);
  refuses(() => f.store.publicConfiguration(), 'UNAVAILABLE');
  assert.equal(fs.existsSync(f.file), false);
  f.save();
  fs.mkdirSync(f.directory, { recursive: true });
  fs.writeFileSync(f.legacyFile, JSON.stringify({ version: 1, accounts: [] }));
  refuses(() => f.store.publicConfiguration(), 'UNAVAILABLE');
  const own = fixture(t);
  own.save();
  fs.writeFileSync(own.bindingFile, JSON.stringify({ version: 1, groupId: 'fixture.google' }));
  refuses(() => own.store.publicConfiguration(), 'UNAVAILABLE');
});
test('live shared owner applies public changes to every member without rewriting local preferences', (t) => {
  const f = fixture(t, true);
  const group = new WebAccountGroup(f.groupId, f.shared, f.local, parseWebAccountSound);
  group.connect(f.owner, { version: 1, selected: f.ids[1], accounts: f.raw.accounts });
  group.connect('fixture.calendar');
  const store = group.settingsRoster(f.owner, f.legacyFile),
    localBefore = fs.readFileSync(f.stateFile);
  const current = store.publicConfiguration();
  store
    .planPublicConfiguration(
      current.accounts.map((a) => ({ ...a, name: 'Shared' })),
      current.revision,
    )
    .commit();
  assert.equal(group.snapshot('fixture.calendar').accounts[0].name, 'Shared');
  assert.equal(group.snapshot(f.owner).selected, f.ids[1]);
  assert.deepEqual(fs.readFileSync(f.stateFile), localBefore);
});

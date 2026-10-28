const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { WebAccountGroup, groupId } = require('../out/main/main/core/web-account-groups');
const { parseWebAccountSound } = require('../out/main/main/core/web-accounts');

test('local preferences cannot override shared identity fields', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  const file = path.join(f.local, 'web-account-groups', g.id, 'state.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.members['fixture.gmail'].preferences[0].name = 'Local shadow';
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.throws(() => f.create(), /アカウント設定/);
  assert.equal(JSON.parse(fs.readFileSync(g.file, 'utf8')).accounts[0].name, 'Personal');
});

test('a default selection remains stable when another member reorders the group', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  g.connect('fixture.calendar');
  assert.equal(g.snapshot('fixture.calendar').selected, f.a);
  const next = g.snapshot('fixture.gmail');
  next.accounts.reverse();
  g.update('fixture.gmail', next);
  assert.equal(g.snapshot('fixture.calendar').selected, f.a);
  assert.equal(f.create().snapshot('fixture.calendar').selected, f.a);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'account-groups-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const shared = path.join(root, 'shared'),
    local = path.join(root, 'local');
  const create = (id = 'fixture.google') =>
    new WebAccountGroup(id, shared, local, parseWebAccountSound);
  const a = randomUUID(),
    b = randomUUID();
  const legacy = {
    version: 1,
    selected: b,
    accounts: [
      {
        id: a,
        name: 'Personal',
        temporaryName: false,
        monitoring: false,
        sound: { enabled: true, file: 'bell.wav' },
      },
      { id: b, name: 'Work', temporaryName: false },
    ],
  };
  return { root, shared, local, create, a, b, legacy };
}

test('group identifiers exclude paths, Windows device names and unscoped identifiers', () => {
  for (const id of [
    'google',
    '../other',
    'a/b',
    'a\\b',
    'con.google',
    'a.google.',
    '',
    null,
    'A.google',
  ])
    assert.equal(groupId(id), false);
  assert.equal(groupId('at365.google'), true);
});

test('legacy migration preserves UUID, order, selection and sessions without copying credentials', (t) => {
  const f = fixture(t),
    g = f.create();
  const session = path.join(f.local, 'web-accounts', 'fixture.gmail', 'sessions', f.a);
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, 'sentinel'), 'original-session');
  g.connect('fixture.gmail', f.legacy);
  assert.deepEqual(g.snapshot('fixture.gmail'), f.legacy);
  assert.equal(g.sessionPath(f.a), session);
  assert.equal(fs.readFileSync(path.join(session, 'sentinel'), 'utf8'), 'original-session');
  const roster = JSON.parse(fs.readFileSync(g.file, 'utf8'));
  assert.equal(roster.accounts[0].monitoring, undefined);
  assert.equal(roster.accounts[0].sound, undefined);
  assert.equal(roster.accounts[0].id, f.a);
  assert.deepEqual(f.create().snapshot('fixture.gmail'), f.legacy);
});

test('members share identity changes but keep selected account, monitoring and sounds independent', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  g.connect('fixture.calendar');
  let next = g.snapshot('fixture.calendar');
  assert.equal(next.accounts[0].sound, undefined);
  assert.equal(next.accounts[0].monitoring, undefined);
  next.selected = f.a;
  next.accounts.reverse();
  next.accounts.find((a) => a.id === f.a).name = 'Shared name';
  next.accounts.find((a) => a.id === f.a).sound = { enabled: false, file: '' };
  g.update('fixture.calendar', next);
  const gmail = g.snapshot('fixture.gmail');
  assert.equal(gmail.selected, f.b);
  assert.equal(gmail.accounts[1].name, 'Shared name');
  assert.equal(gmail.accounts[1].monitoring, false);
  assert.equal(gmail.accounts[1].sound.file, 'bell.wav');
  assert.equal(g.snapshot('fixture.calendar').selected, f.a);
  assert.equal(g.snapshot('fixture.calendar').accounts[1].sound.file, '');
});

test('new group does not create an empty shared roster and another PC never inherits session bindings', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.calendar');
  assert.equal(fs.existsSync(g.file), false);
  assert.deepEqual(g.snapshot('fixture.calendar').accounts, []);
  g.connect('fixture.gmail', f.legacy);
  const other = new WebAccountGroup(
    'fixture.google',
    f.shared,
    path.join(f.root, 'other-pc'),
    parseWebAccountSound,
  );
  other.connect('fixture.calendar');
  assert.equal(other.snapshot('fixture.calendar').accounts[0].id, f.a);
  assert.notEqual(other.sessionPath(f.a), g.sessionPath(f.a));
  assert.match(other.sessionPath(f.a), /other-pc/);
});

test('delete stops all consumers before clearing and serializes mutations; migration is not repeated', async (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  g.connect('fixture.calendar');
  const closed = [];
  const offs = ['gmail', 'calendar'].map((name) =>
    g.subscribe({
      changed() {},
      removing(id) {
        closed.push([name, id]);
      },
      failed() {},
    }),
  );
  t.after(() => offs.forEach((off) => off()));
  await g.remove(f.a, async () => {
    assert.equal(closed.length, 2);
    assert.equal(g.removingId, f.a);
    assert.throws(() => g.update('fixture.gmail', f.legacy), /削除/);
    assert.throws(() => g.connect('fixture.third'), /接続/);
  });
  assert.equal(g.removingId, undefined);
  const restarted = f.create();
  restarted.connect('fixture.gmail', f.legacy);
  assert.deepEqual(
    restarted.snapshot('fixture.gmail').accounts.map((a) => a.id),
    [f.b],
  );
  await assert.rejects(
    restarted.remove(f.b, async () => {}),
    /最後/,
  );
});

test('a failed session cleanup preserves roster and permits retry', async (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  await assert.rejects(
    g.remove(f.a, async () => {
      throw Error('fixture clear failure');
    }),
    /fixture/,
  );
  assert.equal(g.snapshot('fixture.gmail').accounts.length, 2);
  assert.equal(g.removingId, undefined);
  await g.remove(f.a, async () => {});
  assert.equal(g.snapshot('fixture.gmail').accounts.length, 1);
});

test('external roster changes, missing files and invalid JSON are never overwritten by a local edit', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  const next = g.snapshot('fixture.gmail');
  next.accounts[0].name = 'Local';
  for (const value of ['{', JSON.stringify({ version: 1, accounts: [] })]) {
    fs.writeFileSync(g.file, value);
    assert.throws(() => g.update('fixture.gmail', next), /変更/);
    assert.equal(fs.readFileSync(g.file, 'utf8'), value);
  }
  fs.unlinkSync(g.file);
  assert.throws(() => g.update('fixture.gmail', next), /変更/);
  assert.equal(fs.existsSync(g.file), false);
  assert.throws(() => f.create().connect('fixture.gmail'), /同期/);
  fs.writeFileSync(g.file, '{');
  assert.throws(() => f.create());
});

test('stable external roster updates propagate while invalid updates retain the last good roster', async (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  let changed = 0,
    failed = 0,
    removed = 0;
  const off = g.subscribe({
    changed() {
      changed++;
    },
    failed() {
      failed++;
    },
    removing() {
      removed++;
    },
  });
  t.after(off);
  fs.writeFileSync(
    g.file,
    JSON.stringify({ version: 1, accounts: [{ id: f.b, name: 'From sync' }] }),
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(g.snapshot('fixture.gmail').accounts[0].name, 'From sync');
  assert.equal(changed, 1);
  assert.equal(removed, 0); // Sync is not permission to clear local credentials.
  fs.writeFileSync(g.file, '{');
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(failed > 0);
  assert.equal(g.snapshot('fixture.gmail').accounts[0].name, 'From sync');
});

test('transaction recovery handles interruption before and after roster replacement', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  const localFile = path.join(f.local, 'web-account-groups', g.id, 'state.json');
  const before = fs.readFileSync(g.file, 'utf8');
  const state = JSON.parse(fs.readFileSync(localFile, 'utf8'));
  const next = JSON.parse(before);
  next.accounts[0].name = 'Recovered';
  const after = JSON.stringify(next);
  for (const current of [before, after]) {
    fs.writeFileSync(g.file, current);
    fs.writeFileSync(localFile, JSON.stringify({ ...state, pending: { before, after, state } }));
    const recovered = f.create();
    assert.equal(recovered.snapshot('fixture.gmail').accounts[0].name, 'Recovered');
    assert.equal(JSON.parse(fs.readFileSync(localFile, 'utf8')).pending, undefined);
  }
  fs.writeFileSync(g.file, before + ' ');
  fs.writeFileSync(localFile, JSON.stringify({ ...state, pending: { before, after, state } }));
  assert.throws(() => f.create(), /移行中/);
  assert.equal(fs.readFileSync(g.file, 'utf8'), before + ' ');
});

test('failed final journal write recovers committed roster and member settings on restart', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  const localFile = path.join(f.local, 'web-account-groups', g.id, 'state.json');
  const rename = fs.renameSync;
  let replacements = 0;
  const next = g.snapshot('fixture.gmail');
  next.accounts[0].name = 'After failure';
  try {
    fs.renameSync = function (from, to) {
      if (to === localFile && ++replacements === 2)
        throw Object.assign(Error('fixture disk error'), { code: 'EIO' });
      return rename.apply(this, arguments);
    };
    assert.throws(() => g.update('fixture.gmail', next), /disk error/);
  } finally {
    fs.renameSync = rename;
  }
  assert.throws(() => g.update('fixture.gmail', next), /再起動/);
  assert.equal(f.create().snapshot('fixture.gmail').accounts[0].name, 'After failure');
});

test('legacy binding prevents implicit reuse by another group and preserves migration beyond ten identities', (t) => {
  const f = fixture(t),
    g = f.create();
  g.connect('fixture.gmail', f.legacy);
  const other = f.create('fixture.other');
  assert.throws(() => other.connect('fixture.gmail', f.legacy), /グループ変更/);
  const additional = structuredClone(f.legacy);
  additional.accounts = Array.from({ length: 100 }, (_, n) => ({
    id: randomUUID(),
    name: `Other ${n}`,
  }));
  additional.selected = additional.accounts[0].id;
  g.connect('fixture.other', additional);
  const accounts = g.snapshot('fixture.gmail').accounts;
  assert.equal(accounts.length, 102);
  assert.deepEqual(
    accounts.slice(-100).map((item) => item.id),
    additional.accounts.map((item) => item.id),
  );
  assert.equal(f.create().snapshot('fixture.gmail').accounts.length, 102);
});

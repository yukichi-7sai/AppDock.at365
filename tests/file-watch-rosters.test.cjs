const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { WebAccountGroup } = require('../out/main/main/core/web-account-groups');
const { WebProfileStore } = require('../out/main/main/core/web-profiles');

function fixture() {
  const root = fs.mkdtempSync(path.resolve('.artifacts/file-watch-rosters-'));
  const jobs = new Map();
  const assistance = {
    register(id, check) {
      assert(!jobs.has(id), 'duplicate roster registration');
      jobs.set(id, check);
      return () => jobs.delete(id);
    },
  };
  return { root, jobs, assistance };
}
const listener = () => ({ changed() {}, removing() {}, failed() {} });

test('shared account subscribers own one assistance registration until the last subscriber leaves', (t) => {
  const f = fixture();
  const group = new WebAccountGroup(
    'fixture.shared',
    path.join(f.root, 'data'),
    path.join(f.root, 'local'),
    (sound) => sound,
    f.assistance,
  );
  const first = group.subscribe(listener());
  const second = group.subscribe(listener());
  t.after(() => {
    first();
    second();
  });
  assert.equal(f.jobs.size, 1);
  assert.equal(fs.existsSync(group.file), false, 'watching does not create an empty roster');
  first();
  assert.equal(f.jobs.size, 1);
  second();
  assert.equal(f.jobs.size, 0);
  const later = group.subscribe(listener());
  assert.equal(f.jobs.size, 1);
  later();
  assert.equal(f.jobs.size, 0);
});

test('a standalone roster receives a missed update through assistance and releases its registration on close', async (t) => {
  const f = fixture();
  const file = path.join(f.root, 'accounts.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts: [] }));
  const store = new WebProfileStore(file);
  store.loadStandalone(() => false);
  t.after(() => store.close());
  let changes = 0;
  const failures = [];
  t.mock.method(fs, 'watch', () => Object.assign(new EventEmitter(), { close() {} }));
  store.watch(
    () => changes++,
    (error) => failures.push(error),
    f.assistance,
  );
  assert.equal(f.jobs.size, 1);
  // The native watcher emits nothing, as when an OS notification is missed.
  const id = 'account.' + randomUUID();
  fs.writeFileSync(
    file,
    JSON.stringify({ schemaVersion: 1, accounts: [{ id, name: 'Received' }] }),
  );
  await [...f.jobs.values()][0]({ signal: new AbortController().signal });
  assert.deepEqual(failures, []);
  assert.equal(store.snapshot()[0].id, id);
  assert.equal(changes, 1);
  store.close();
  assert.equal(f.jobs.size, 0);
});
